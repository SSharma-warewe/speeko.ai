import { ConfigService } from '@nestjs/config';
import { CallsRepository } from '../../calls/calls.repository';
import { GhlCalendarToolsService } from '../ghl-calendar-tools.service';
import { GhlService } from '../ghl.service';
import {
  expandShortWindowToLocalDays,
  mapGhlFreeSlots,
  parseTimeToUnix,
} from '../ghl-time';

describe('mapGhlFreeSlots', () => {
  it('maps live date→slots shape and drops traceId', () => {
    const slots = mapGhlFreeSlots({
      '2026-08-14': {
        slots: ['2026-08-14T10:00:00+05:30', '2026-08-14T10:30:00+05:30'],
      },
      '2026-08-13': { slots: ['2026-08-13T16:00:00+05:30'] },
      traceId: 'trace-should-drop',
      events: [{ title: 'Secret meeting' }],
    });

    expect(slots).toEqual([
      {
        startIso: '2026-08-13T16:00:00+05:30',
        endIso: '2026-08-13T16:30:00+05:30',
      },
      {
        startIso: '2026-08-14T10:00:00+05:30',
        endIso: '2026-08-14T10:30:00+05:30',
      },
      {
        startIso: '2026-08-14T10:30:00+05:30',
        endIso: '2026-08-14T11:00:00+05:30',
      },
    ]);
    expect(JSON.stringify(slots)).not.toMatch(/Secret|title|trace/i);
  });

  it('caps at 12 and ignores non-string slot entries', () => {
    const many = Array.from({ length: 20 }, (_, i) => {
      const hh = String(8 + Math.floor(i / 2)).padStart(2, '0');
      const mm = i % 2 === 0 ? '00' : '30';
      return `2026-08-14T${hh}:${mm}:00+05:30`;
    });
    const slots = mapGhlFreeSlots({
      '2026-08-14': {
        slots: [...many, { title: 'busy', start: 'nope' }, 123],
      },
    });
    expect(slots).toHaveLength(12);
    expect(slots.every((s) => typeof s.startIso === 'string')).toBe(true);
  });
});

describe('parseTimeToUnix (GHL wall-clock)', () => {
  it('treats Z + Asia/Kolkata as local wall-clock (not UTC)', () => {
    expect(parseTimeToUnix('2026-08-14T15:00:00Z', 'Asia/Kolkata')).toBe(
      Date.parse('2026-08-14T09:30:00.000Z') / 1000,
    );
  });

  it('honors a numeric offset even when timezone is set', () => {
    expect(parseTimeToUnix('2026-08-14T15:00:00+05:30', 'Asia/Kolkata')).toBe(
      Date.parse('2026-08-14T09:30:00.000Z') / 1000,
    );
  });

  it('keeps Z as UTC when timezone is omitted', () => {
    expect(parseTimeToUnix('2026-08-14T15:00:00Z')).toBe(
      Date.parse('2026-08-14T15:00:00.000Z') / 1000,
    );
  });

  it('treats naive ISO + timezone as local wall-clock', () => {
    expect(parseTimeToUnix('2026-08-14T15:30:00', 'Asia/Kolkata')).toBe(
      Date.parse('2026-08-14T10:00:00.000Z') / 1000,
    );
  });

  it('leaves unix seconds unchanged', () => {
    expect(parseTimeToUnix('1786700000', 'Asia/Kolkata')).toBe(1786700000);
  });
});

describe('expandShortWindowToLocalDays', () => {
  it('expands a 60-minute IST window to that local calendar day', () => {
    const start = parseTimeToUnix('2026-08-14T15:00:00Z', 'Asia/Kolkata')!;
    const end = parseTimeToUnix('2026-08-14T16:00:00Z', 'Asia/Kolkata')!;
    const win = expandShortWindowToLocalDays(start, end, 'Asia/Kolkata');
    expect(win.expanded).toBe(true);
    expect(win.startSec).toBe(Date.parse('2026-08-13T18:30:00.000Z') / 1000);
    expect(win.endSec).toBe(Date.parse('2026-08-14T18:30:00.000Z') / 1000);
  });

  it('does not expand a window of 4 hours or more', () => {
    const start = parseTimeToUnix('2026-08-14T09:00:00+05:30')!;
    const end = parseTimeToUnix('2026-08-14T18:00:00+05:30')!;
    const win = expandShortWindowToLocalDays(start, end, 'Asia/Kolkata');
    expect(win).toEqual({ startSec: start, endSec: end, expanded: false });
  });
});

describe('GhlService calendar', () => {
  const apiKey = 'pit-contacts';
  const calendarToken = 'pit-calendar';
  const locationId = 'loc_1';
  const calendarId = 'cal_shivam';

  let fetchMock: jest.SpyInstance;

  function makeService(
    env: {
      GHL_API_KEY?: string;
      GHL_CALENDAR?: string;
      GHL_LOCATION_ID?: string;
      GHL_CALENDAR_ID?: string;
    } = {},
  ): GhlService {
    const get = jest.fn((key: string) => {
      const map: Record<string, string | undefined> = {
        GHL_API_KEY: env.GHL_API_KEY ?? apiKey,
        GHL_CALENDAR: env.GHL_CALENDAR ?? calendarToken,
        GHL_LOCATION_ID: env.GHL_LOCATION_ID ?? locationId,
        GHL_CALENDAR_ID: env.GHL_CALENDAR_ID ?? calendarId,
      };
      return map[key];
    });
    return new GhlService({ get } as unknown as ConfigService);
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('skips free slots when GHL_CALENDAR is missing', async () => {
    const service = makeService({ GHL_CALENDAR: '' });
    await expect(
      service.getFreeSlots({ startMs: 1, endMs: 2 }),
    ).resolves.toMatchObject({
      ok: false,
      skipped: true,
      error: 'ghl_calendar_disabled',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips free slots when GHL_CALENDAR_ID is missing', async () => {
    const service = makeService({ GHL_CALENDAR_ID: '  ' });
    await expect(
      service.getFreeSlots({ startMs: 1, endMs: 2 }),
    ).resolves.toMatchObject({
      ok: false,
      error: 'ghl_calendar_disabled',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GETs free-slots with milliseconds and the calendar PIT', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        '2026-08-14': { slots: ['2026-08-14T10:00:00+05:30'] },
        traceId: 'abc',
      }),
    );
    const service = makeService();
    const result = await service.getFreeSlots({
      startMs: 1_775_000_000_000,
      endMs: 1_775_086_400_000,
      timezone: 'Asia/Kolkata',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slots).toHaveLength(1);
      expect(result.slots[0]).toEqual({
        startIso: '2026-08-14T10:00:00+05:30',
        endIso: '2026-08-14T10:30:00+05:30',
      });
      expect(result.slotMinutes).toBe(30);
      expect(JSON.stringify(result)).not.toMatch(/traceId|title|contact/i);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      `/calendars/${calendarId}/free-slots?startDate=1775000000000&endDate=1775086400000`,
    );
    expect(url).toContain('timezone=Asia%2FKolkata');
    expect(url).not.toContain('/calendars/events');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${calendarToken}`);
    expect(init.method).toBe('GET');
  });

  it('upserts a contact without tags using the contacts PIT', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ new: true, contact: { id: 'ct_9' } }),
    );
    const service = makeService();
    await expect(
      service.upsertContact({
        email: '  Ada@Example.com ',
        phone: '+1 555',
        firstName: 'Ada',
      }),
    ).resolves.toEqual({ ok: true, contactId: 'ct_9', created: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://services.leadconnectorhq.com/contacts/upsert');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
    expect(JSON.parse(String(init.body))).toEqual({
      locationId,
      source: 'Speeko Voice Agent',
      firstName: 'Ada',
      email: 'ada@example.com',
      phone: '+1 555',
    });
  });

  it('POSTs appointment with calendar PIT and no ignoreFreeSlotValidation', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 'apt_1',
        startTime: '2026-08-14T10:00:00+05:30',
        endTime: '2026-08-14T10:30:00+05:30',
        title: 'Meeting — Ada',
      }),
    );
    const service = makeService();
    const result = await service.createAppointment({
      contactId: 'ct_9',
      startTime: '2026-08-14T10:00:00+05:30',
      endTime: '2026-08-14T10:30:00+05:30',
      title: 'Meeting — Ada',
    });
    expect(result).toEqual({
      ok: true,
      appointmentId: 'apt_1',
      startTime: '2026-08-14T10:00:00+05:30',
      endTime: '2026-08-14T10:30:00+05:30',
      title: 'Meeting — Ada',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://services.leadconnectorhq.com/calendars/events/appointments',
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${calendarToken}`);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      calendarId,
      locationId,
      contactId: 'ct_9',
      startTime: '2026-08-14T10:00:00+05:30',
      endTime: '2026-08-14T10:30:00+05:30',
      title: 'Meeting — Ada',
      toNotify: true,
    });
    expect(body).not.toHaveProperty('ignoreFreeSlotValidation');
  });

  it('maps 400 create appointment to slot_unavailable', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: 'Slot not available' }, 400),
    );
    const service = makeService();
    await expect(
      service.createAppointment({
        contactId: 'ct_9',
        startTime: '2026-08-14T10:00:00+05:30',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'slot_unavailable' });
  });

  it('does not log calendar or contacts tokens', async () => {
    const service = makeService();
    const logger = (
      service as unknown as {
        logger: { warn: (m: string) => void };
      }
    ).logger;
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, 401));

    await service.getFreeSlots({ startMs: 1, endMs: 2 });

    const joined = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(joined).not.toContain(calendarToken);
    expect(joined).not.toContain(apiKey);
    expect(joined).not.toMatch(/Bearer /i);
  });
});

describe('GhlCalendarToolsService', () => {
  const CALL_ID = '11111111-1111-1111-1111-111111111111';
  const futureStart = new Date(Date.now() + 48 * 3600_000).toISOString();
  const futureEnd = new Date(Date.now() + 72 * 3600_000).toISOString();

  let callsRepository: { findById: jest.Mock };
  let ghl: {
    getFreeSlots: jest.Mock;
    upsertContact: jest.Mock;
    createAppointment: jest.Mock;
  };
  let service: GhlCalendarToolsService;

  beforeEach(() => {
    callsRepository = { findById: jest.fn() };
    ghl = {
      getFreeSlots: jest.fn(),
      upsertContact: jest.fn(),
      createAppointment: jest.fn(),
    };
    service = new GhlCalendarToolsService(
      callsRepository as unknown as CallsRepository,
      ghl as unknown as GhlService,
    );
  });

  it('returns call_not_found without hitting GHL', async () => {
    callsRepository.findById.mockResolvedValue(null);
    await expect(
      service.freeSlots(CALL_ID, {
        startTime: futureStart,
        endTime: futureEnd,
      }),
    ).resolves.toMatchObject({ ok: false, error: 'call_not_found' });
    expect(ghl.getFreeSlots).not.toHaveBeenCalled();
  });

  it('rejects past windows without calling GHL', async () => {
    callsRepository.findById.mockResolvedValue({ id: CALL_ID, context: {} });
    await expect(
      service.freeSlots(CALL_ID, {
        startTime: '2020-01-01T00:00:00Z',
        endTime: '2020-01-02T00:00:00Z',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'window_in_past' });
    expect(ghl.getFreeSlots).not.toHaveBeenCalled();
  });

  it('forwards millisecond window to getFreeSlots', async () => {
    callsRepository.findById.mockResolvedValue({ id: CALL_ID, context: {} });
    ghl.getFreeSlots.mockResolvedValue({
      ok: true,
      slotMinutes: 30,
      slots: [{ startIso: '2026-08-14T10:00:00+05:30', endIso: '2026-08-14T10:30:00+05:30' }],
    });
    const startTime = '2028-06-15T09:00:00+05:30';
    const endTime = '2028-06-15T18:00:00+05:30';
    const res = await service.freeSlots(CALL_ID, {
      startTime,
      endTime,
      timezone: 'Asia/Kolkata',
    });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({
      timezone: undefined,
      slotMinutes: 30,
      slots: [
        {
          startIso: '2026-08-14T10:00:00+05:30',
          endIso: '2026-08-14T10:30:00+05:30',
        },
      ],
    });
    const arg = ghl.getFreeSlots.mock.calls[0][0] as {
      startMs: number;
      endMs: number;
      timezone?: string;
    };
    expect(arg.startMs).toBe(Date.parse(startTime));
    expect(arg.endMs).toBe(Date.parse(endTime));
    expect(arg.timezone).toBe('Asia/Kolkata');
    expect(JSON.stringify(res)).not.toMatch(/title|contactId|event/i);
  });

  it('reinterprets Z+timezone as local and expands a short window to the day', async () => {
    callsRepository.findById.mockResolvedValue({ id: CALL_ID, context: {} });
    ghl.getFreeSlots.mockResolvedValue({
      ok: true,
      slotMinutes: 30,
      timezone: 'Asia/Kolkata',
      slots: [{ startIso: '2028-06-15T15:30:00+05:30', endIso: '2028-06-15T16:00:00+05:30' }],
    });
    const res = await service.freeSlots(CALL_ID, {
      startTime: '2028-06-15T15:00:00Z',
      endTime: '2028-06-15T16:00:00Z',
      timezone: 'Asia/Kolkata',
    });
    expect(res.ok).toBe(true);
    const arg = ghl.getFreeSlots.mock.calls[0][0] as {
      startMs: number;
      endMs: number;
    };
    expect(arg.startMs).toBe(Date.parse('2028-06-14T18:30:00.000Z'));
    expect(arg.endMs).toBe(Date.parse('2028-06-15T18:30:00.000Z'));
  });

  it('books using call context email when tool omits identity', async () => {
    callsRepository.findById.mockResolvedValue({
      id: CALL_ID,
      context: { email: 'ada@example.com', name: 'Ada Lovelace' },
    });
    ghl.upsertContact.mockResolvedValue({
      ok: true,
      contactId: 'ct_1',
      created: false,
    });
    ghl.createAppointment.mockResolvedValue({
      ok: true,
      appointmentId: 'apt_1',
      startTime: '2026-08-14T10:00:00+05:30',
      endTime: '2026-08-14T10:30:00+05:30',
      title: 'Meeting — Ada Lovelace',
    });

    const res = await service.scheduleMeeting(CALL_ID, {
      startTime: '2026-08-14T10:00:00+05:30',
    });
    expect(res.ok).toBe(true);
    expect(ghl.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ada@example.com',
        name: 'Ada Lovelace',
      }),
    );
    expect(ghl.createAppointment).toHaveBeenCalledWith({
      contactId: 'ct_1',
      startTime: '2026-08-14T10:00:00+05:30',
      endTime: '2026-08-14T10:30:00+05:30',
      title: 'Meeting — Ada Lovelace',
      description: undefined,
    });
    expect(res.data).toEqual({
      appointmentId: 'apt_1',
      title: 'Meeting — Ada Lovelace',
      startIso: '2026-08-14T10:00:00+05:30',
      endIso: '2026-08-14T10:30:00+05:30',
    });
  });

  it('fails schedule without email or phone', async () => {
    callsRepository.findById.mockResolvedValue({ id: CALL_ID, context: {} });
    await expect(
      service.scheduleMeeting(CALL_ID, {
        startTime: '2026-08-14T10:00:00+05:30',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'missing_contact' });
    expect(ghl.upsertContact).not.toHaveBeenCalled();
    expect(ghl.createAppointment).not.toHaveBeenCalled();
  });

  it('books a Z+timezone spoken time as local IST, not UTC', async () => {
    callsRepository.findById.mockResolvedValue({
      id: CALL_ID,
      context: { email: 'ada@example.com' },
    });
    ghl.upsertContact.mockResolvedValue({
      ok: true,
      contactId: 'ct_1',
      created: false,
    });
    ghl.createAppointment.mockResolvedValue({
      ok: true,
      appointmentId: 'apt_1',
      startTime: '2028-06-15T15:00:00+05:30',
      endTime: '2028-06-15T15:30:00+05:30',
      title: 'Meeting',
    });

    await service.scheduleMeeting(CALL_ID, {
      startTime: '2028-06-15T15:00:00Z',
      timezone: 'Asia/Kolkata',
    });

    expect(ghl.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: '2028-06-15T09:30:00.000Z',
        endTime: '2028-06-15T10:00:00.000Z',
      }),
    );
  });
});
