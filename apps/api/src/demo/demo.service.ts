import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestDemoDto } from './dto/request-demo.dto';
import { RequestDemoResponseDto } from './dto/request-demo-response.dto';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Proxy marketing get-demo form to the configured integration enqueue URL.
   * Uses ENDPOINT_URL + SPEEKO_API (server-side only — never expose to the SPA).
   */
  async requestDemo(dto: RequestDemoDto): Promise<RequestDemoResponseDto> {
    const endpointUrl = this.config.get<string>('ENDPOINT_URL')?.trim() ?? '';
    const apiKey = this.config.get<string>('SPEEKO_API')?.trim() ?? '';

    if (!endpointUrl || !apiKey) {
      this.logger.error(
        'Demo dial not configured: set ENDPOINT_URL and SPEEKO_API',
      );
      throw new ServiceUnavailableException(
        'Demo requests are not configured. Please try again later.',
      );
    }

    const phoneNumber = dto.phone.trim();
    const email = dto.email.trim().toLowerCase();
    const body = {
      phoneNumber,
      externalId: `get-demo:${email}`,
      context: {
        source: 'get_demo',
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        company: dto.company.trim(),
        email,
        country: dto.country.trim(),
        teamSize: dto.teamSize.trim(),
        callsPerDay: dto.callsPerDay.trim(),
        direction: dto.direction,
        integrations: dto.integrations.map((i) => i.trim()).filter(Boolean),
      },
    };

    let response: Response;
    try {
      response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Demo enqueue network error: ${message}`);
      throw new BadGatewayException(
        'Could not start your demo call. Please try again shortly.',
      );
    }

    const rawText = await response.text().catch(() => '');
    let parsed: Record<string, unknown> | null = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      this.logger.error(
        `Demo enqueue failed: status=${response.status} body=${rawText.slice(0, 500)}`,
      );
      if (response.status === 401 || response.status === 403) {
        throw new BadGatewayException(
          'Demo dial is misconfigured. Please try again later.',
        );
      }
      throw new BadGatewayException(
        'Could not start your demo call. Please try again shortly.',
      );
    }

    const callId =
      typeof parsed?.callId === 'string' ? parsed.callId : undefined;
    this.logger.log(
      `Demo call enqueued for ${email}${callId ? ` callId=${callId}` : ''}`,
    );

    return callId ? { ok: true, callId } : { ok: true };
  }
}
