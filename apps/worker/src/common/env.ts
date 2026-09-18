export function parseEnvInt(
  raw: string | undefined,
  fallback: number,
  min: number,
): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) {
    return fallback;
  }
  return n;
}

export type WorkerApiConfig = {
  baseUrl: string;
  secret: string;
};

export function resolveWorkerApiConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerApiConfig | null {
  const baseUrl = env.API_BASE_URL?.replace(/\/$/, '');
  const secret = env.WORKER_CALLBACK_SECRET;
  if (!baseUrl || !secret) {
    return null;
  }
  return { baseUrl, secret };
}
