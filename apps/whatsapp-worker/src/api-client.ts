import type { WhatsAppWorkerTurn } from '@call-agent/contracts';

export class HarnessApiError extends Error {
  constructor(readonly status: number) {
    super(`WhatsApp internal API HTTP ${status}`);
  }
}

/** Retries identical callbacks; logs never include credentials or bodies. */
export class HarnessApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  async post<T>(
    turn: WhatsAppWorkerTurn,
    action: string,
    data: object = {},
    signal?: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(
          `${this.baseUrl.replace(/\/$/, '')}/api/internal/whatsapp/turns/${turn.id}/${action}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Worker-Secret': this.secret,
            },
            body: JSON.stringify({ ...data, leaseToken: turn.leaseToken }),
            signal: AbortSignal.any([
              AbortSignal.timeout(action === 'tools' ? 35_000 : 8_000),
              ...(signal ? [signal] : []),
            ]),
            redirect: 'error',
          },
        );
        if (!response.ok) throw new HarnessApiError(response.status);
        return (await response.json()) as T;
      } catch (error) {
        if (
          signal?.aborted ||
          attempt >= 3 ||
          (error instanceof HarnessApiError &&
            error.status < 500 &&
            error.status !== 429)
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }
}
