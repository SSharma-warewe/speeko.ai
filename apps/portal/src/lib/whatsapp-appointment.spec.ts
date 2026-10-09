import { appointmentContext, appointmentSources } from './whatsapp-appointment';
import type { WhatsAppTemplate } from '@call-agent/contracts';

const template = (bodyText: string): WhatsAppTemplate => ({
  id: 'template',
  name: 'appointment_confirmation',
  language: 'en',
  category: 'UTILITY',
  status: 'APPROVED',
  parameterFormat: 'POSITIONAL',
  sendable: true,
  unsendableReason: null,
  bodyText,
  bodyVariables: Array.from(
    new Set(
      Array.from(bodyText.matchAll(/\{\{(\w+)\}\}/g), (match) => match[1]),
    ),
  ).map((key) => ({ key, example: 'Not customer data' })),
  urlButtonVariable: false,
  urlButtonIndex: null,
});
const event = {
  title: 'Consultation',
  startTime: '2026-10-09T23:30:00Z',
  endTime: '2026-10-10T00:00:00Z',
  address: 'Main office',
};
const context = appointmentContext(event, 'Clinic', 'Asia/Kolkata', 'en-US');

describe('appointment WhatsApp autofill', () => {
  it('uses explicit timezone, including appointments crossing the UTC date boundary', () => {
    expect(context.appointmentDate).toBe('Oct 10, 2026');
    expect(context.appointmentTime).toBe('5:00 AM');
    expect(context.appointmentEndTime).toBe('5:30 AM');
    expect(context.appointmentTimezone).toBe('Asia/Kolkata');
    const elsewhere = appointmentContext(
      event,
      'Clinic',
      'America/New_York',
      'en-US',
    );
    expect(elsewhere.appointmentDate).toBe('Oct 9, 2026');
    expect(elsewhere.appointmentTime).toBe('7:30 PM');
  });

  it('maps named parameters independently of position and exposes actual context values', () => {
    const sources = appointmentSources(
      template(
        'Date {{appointment_date}}, time {{startTime}}, title {{meeting_title}}, customer {{customer_name}}, timezone {{timezone}}, calendar {{calendar_name}}, location {{address}}.',
      ),
      context,
    );
    expect(sources.appointment_date).toEqual({
      mode: 'appointmentDate',
      text: 'Oct 10, 2026',
    });
    expect(sources.startTime).toEqual({
      mode: 'appointmentTime',
      text: '5:00 AM',
    });
    expect(sources.meeting_title).toEqual({
      mode: 'appointmentTitle',
      text: 'Consultation',
    });
    expect(sources.customer_name).toEqual({ mode: 'fullName', text: '' });
    expect(sources.timezone.text).toBe('Asia/Kolkata');
    expect(sources.calendar_name.text).toBe('Clinic');
    expect(sources.address.text).toBe('Main office');
  });

  it('fills common positional confirmation wording without relying on numeric order', () => {
    const sources = appointmentSources(
      template(
        'Hello {{1}}, your appointment for {{2}} is confirmed on {{3}} at {{4}}.',
      ),
      context,
    );
    expect(sources['1'].mode).toBe('firstName');
    expect(sources['2'].text).toBe('Consultation');
    expect(sources['3'].text).toBe('Oct 10, 2026');
    expect(sources['4'].text).toBe('5:00 AM');
    expect(
      appointmentSources(template('Date: {{1}}. Time: {{2}}.'), context)['1']
        .mode,
    ).toBe('appointmentDate');
  });

  it('handles whitespace, combined date/time and end-time labels', () => {
    const t = template('Date and time: {{1}}. Until {{2}}.');
    t.bodyText = 'Date and time: {{ 1 }}. Until {{ 2 }}.';
    const sources = appointmentSources(t, context);
    expect(sources['1'].text).toBe(context.appointmentDateTime);
    expect(sources['2'].text).toBe('5:30 AM');
  });

  it('leaves ambiguous fields blank rather than using template examples or positional guesses', () => {
    const sources = appointmentSources(
      template(
        'Your booking {{1}}, at {{2}}. Code {{3}}. {{unknown_field}} {{__proto__}}',
      ),
      context,
    );
    for (const source of Object.values(sources))
      expect(source).toEqual({ mode: 'text', text: '' });
  });

  it('distinguishes a confirmation date followed by time from a combined timestamp', () => {
    const separated = appointmentSources(
      template('Your appointment is confirmed for {{1}} at {{2}}.'),
      context,
    );
    expect(separated['1'].mode).toBe('appointmentDate');
    expect(separated['2'].mode).toBe('appointmentTime');
    expect(
      appointmentSources(
        template('Your appointment is scheduled for {{1}}.'),
        context,
      )['1'].text,
    ).toBe(context.appointmentDateTime);
  });

  it('requires review when a reused positional parameter has conflicting meanings', () => {
    expect(
      appointmentSources(template('Date: {{1}}. Location: {{1}}.'), context)[
        '1'
      ],
    ).toEqual({ mode: 'text', text: '' });
  });

  it('never invents missing dates, location or title', () => {
    const missing = appointmentContext(
      { startTime: 'invalid', endTime: '' },
      '',
      'Asia/Kolkata',
      'en-US',
    );
    expect(missing.appointmentDate).toBe('');
    expect(missing.appointmentTime).toBe('');
    expect(missing.appointmentTitle).toBe('');
    expect(missing.appointmentLocation).toBe('');
    expect(
      appointmentSources(template('{{date}} {{address}}'), missing).date.text,
    ).toBe('');
  });
});
