import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GhlLeadDirection,
  GhlLeadInput,
  GhlUpsertLeadResult,
} from './ghl.types';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';
const GHL_SOURCE = 'Speeko Get Demo';
const GHL_DEMO_TAG = 'speeko-get-demo';
const ERROR_BODY_LOG_LIMIT = 400;

/** Marketing country labels → ISO 3166-1 alpha-2 (GHL `country`). */
const COUNTRY_TO_ISO: Record<string, string> = {
  'united states': 'US',
  'united kingdom': 'GB',
  canada: 'CA',
  australia: 'AU',
  germany: 'DE',
  france: 'FR',
  india: 'IN',
  singapore: 'SG',
  'united arab emirates': 'AE',
  netherlands: 'NL',
};

const DIRECTIONS = new Set<GhlLeadDirection>([
  'outbound',
  'inbound',
  'both',
]);

type GhlJson = Record<string, unknown>;

type GhlHttpResult = {
  ok: boolean;
  status: number;
  json: GhlJson | null;
  text: string;
  networkError?: string;
};

@Injectable()
export class GhlService {
  private readonly logger = new Logger(GhlService.name);
  private readonly apiKey: string;
  private readonly locationId: string;
  private disabledLogged = false;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GHL_API_KEY')?.trim() ?? '';
    this.locationId = this.config.get<string>('GHL_LOCATION_ID')?.trim() ?? '';

    if (!this.apiKey || !this.locationId) {
      this.logger.warn(
        'GHL disabled: set GHL_API_KEY and GHL_LOCATION_ID. upsertLead() will no-op.',
      );
    }
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey && this.locationId);
  }

  /**
   * Upsert a marketing get-demo lead as a GHL contact, then add tags + a note.
   * Never throws — failures return `{ ok: false }` so the demo dial still runs.
   */
  async upsertLead(input: GhlLeadInput): Promise<GhlUpsertLeadResult> {
    if (!this.isEnabled()) {
      if (!this.disabledLogged) {
        this.logger.warn(
          'GhlService.upsertLead skipped: GHL_API_KEY or GHL_LOCATION_ID not set',
        );
        this.disabledLogged = true;
      }
      return { ok: false, skipped: true, error: 'ghl disabled' };
    }

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const email = input.email.trim().toLowerCase();
    const phone = input.phone.trim();
    const companyName = input.company.trim();

    if (!email && !phone) {
      this.logger.warn('GhlService.upsertLead rejected: email or phone required');
      return { ok: false, error: 'email or phone is required' };
    }

    const country = toIsoCountry(input.country);
    const direction = DIRECTIONS.has(input.direction)
      ? input.direction
      : undefined;
    const integrations = input.integrations
      .map((i) => i.trim())
      .filter(Boolean);

    const body: GhlJson = {
      locationId: this.locationId,
      source: GHL_SOURCE,
    };
    if (firstName) body.firstName = firstName;
    if (lastName) body.lastName = lastName;
    if (email) body.email = email;
    if (phone) body.phone = phone;
    if (companyName) body.companyName = companyName;
    if (country) body.country = country;

    const upsert = await this.request('POST', '/contacts/upsert', body);
    if (upsert.networkError) {
      this.logger.warn(`GHL upsert network error: ${upsert.networkError}`);
      return { ok: false, error: upsert.networkError };
    }
    if (!upsert.ok) {
      this.logger.warn(
        `GHL upsert failed: status=${upsert.status} body=${truncate(upsert.text)}`,
      );
      return { ok: false, error: `ghl upsert ${upsert.status}` };
    }

    const contactId = readContactId(upsert.json);
    if (!contactId) {
      this.logger.warn('GHL upsert succeeded but contact.id was missing');
      return { ok: false, error: 'ghl upsert missing contact.id' };
    }

    const created = upsert.json?.new === true;
    const tags = [GHL_DEMO_TAG];
    if (direction) tags.push(`direction:${direction}`);

    const tagResult = await this.request('POST', `/contacts/${contactId}/tags`, {
      tags,
    });
    if (!tagResult.ok) {
      this.logger.warn(
        `GHL add tags failed for contact=${contactId} status=${tagResult.status} body=${truncate(tagResult.text)}`,
      );
    }

    const noteBody = buildLeadNote({
      teamSize: input.teamSize.trim(),
      callsPerDay: input.callsPerDay.trim(),
      direction,
      integrations,
    });
    if (noteBody) {
      const noteResult = await this.request(
        'POST',
        `/contacts/${contactId}/notes`,
        { body: noteBody },
      );
      if (!noteResult.ok) {
        this.logger.warn(
          `GHL add note failed for contact=${contactId} status=${noteResult.status} body=${truncate(noteResult.text)}`,
        );
      }
    }

    this.logger.log(
      `GHL lead upserted contact=${contactId} created=${created} email=${email || 'n/a'}`,
    );
    return { ok: true, contactId, created };
  }

  private async request(
    method: string,
    path: string,
    body?: GhlJson,
  ): Promise<GhlHttpResult> {
    try {
      const response = await fetch(`${GHL_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Version: GHL_API_VERSION,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text().catch(() => '');
      return {
        ok: response.ok,
        status: response.status,
        json: parseJson(text),
        text,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 0,
        json: null,
        text: '',
        networkError: message,
      };
    }
  }
}

export function toIsoCountry(raw: string): string | undefined {
  const key = raw.trim().toLowerCase();
  if (!key || key === 'other') return undefined;
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  return COUNTRY_TO_ISO[key];
}

export function buildLeadNote(input: {
  teamSize: string;
  callsPerDay: string;
  direction?: GhlLeadDirection;
  integrations: string[];
}): string {
  const lines: string[] = [];
  if (input.teamSize) lines.push(`Team size: ${input.teamSize}`);
  if (input.callsPerDay) lines.push(`Calls per day: ${input.callsPerDay}`);
  if (input.direction) lines.push(`Direction: ${input.direction}`);
  if (input.integrations.length > 0) {
    lines.push(`Integrations: ${input.integrations.join(', ')}`);
  }
  return lines.join('\n');
}

function readContactId(json: GhlJson | null): string | undefined {
  const contact = json?.contact;
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)) {
    return undefined;
  }
  const id = (contact as { id?: unknown }).id;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

function parseJson(text: string): GhlJson | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as GhlJson;
  } catch {
    return null;
  }
}

function truncate(text: string): string {
  if (text.length <= ERROR_BODY_LOG_LIMIT) return text;
  return `${text.slice(0, ERROR_BODY_LOG_LIMIT)}…`;
}
