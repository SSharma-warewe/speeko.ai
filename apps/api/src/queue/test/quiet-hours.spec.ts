import { OrganizationQueueSettings } from '../organization-queue-settings.entity';
import { quietHoursState } from '../quiet-hours';

describe('queue quiet hours', () => {
  const settings = {
    quietHoursEnabled: true,
    quietHoursStart: '21:00',
    quietHoursEnd: '08:00',
    quietHoursTimezone: 'UTC',
  } as OrganizationQueueSettings;
  it.each([
    ['20:59', 'open'],
    ['21:00', 'quiet'],
    ['00:00', 'quiet'],
    ['07:59', 'quiet'],
    ['08:00', 'open'],
  ])('overnight %s -> %s', (time, state) => {
    expect(quietHoursState(new Date(`2026-10-07T${time}:00Z`), settings)).toBe(
      state,
    );
  });
  it('uses tenant timezone', () => {
    expect(
      quietHoursState(new Date('2026-10-07T15:30:00Z'), {
        ...settings,
        quietHoursTimezone: 'Asia/Kolkata',
      }),
    ).toBe('quiet');
  });
  it('supports same-day windows and all-day quiet', () => {
    const at = new Date('2026-10-07T12:00:00Z');
    expect(
      quietHoursState(at, {
        ...settings,
        quietHoursStart: '09:00',
        quietHoursEnd: '17:00',
      }),
    ).toBe('quiet');
    expect(quietHoursState(at, { ...settings, quietHoursStart: '08:00' })).toBe(
      'quiet',
    );
  });
  it.each([
    { quietHoursStart: null },
    { quietHoursStart: '99:99' },
    { quietHoursTimezone: 'Invalid/Zone' },
  ])('rejects invalid enabled configuration %j', (patch) => {
    expect(quietHoursState(new Date(), { ...settings, ...patch })).toBe(
      'invalid',
    );
  });
  it('disabled quiet hours leave admission open', () => {
    expect(
      quietHoursState(new Date(), {
        ...settings,
        quietHoursEnabled: false,
        quietHoursStart: null,
      }),
    ).toBe('open');
  });
});
