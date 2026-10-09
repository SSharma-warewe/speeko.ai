import {
  WHATSAPP_CONTACT_FIELDS,
  type WhatsAppContactField,
  type WhatsAppTemplate,
} from '@call-agent/contracts';

export const APPOINTMENT_FIELDS = {
  appointmentTitle: 'Appointment title',
  appointmentDate: 'Appointment date',
  appointmentTime: 'Appointment start time',
  appointmentDateTime: 'Appointment date and time',
  appointmentEndTime: 'Appointment end time',
  appointmentTimezone: 'Appointment timezone',
  appointmentCalendar: 'Calendar name',
  appointmentLocation: 'Appointment location',
} as const;
export type AppointmentField = keyof typeof APPOINTMENT_FIELDS;
export type AppointmentContext = Record<AppointmentField, string>;
export type SourceMode = WhatsAppContactField | AppointmentField | 'text';
export type SourceState = { mode: SourceMode; text: string };

export function isContactField(mode: SourceMode): mode is WhatsAppContactField {
  return (WHATSAPP_CONTACT_FIELDS as readonly string[]).includes(mode);
}

export function appointmentContext(
  event: {
    title?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    address?: unknown;
  },
  calendarName: string,
  timezone: string,
  locale?: string,
): AppointmentContext {
  const text = (value: unknown) =>
    typeof value === 'string' ? value.trim() : '';
  const start = new Date(text(event.startTime));
  const end = new Date(text(event.endTime));
  const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
    Number.isNaN(date.getTime())
      ? ''
      : new Intl.DateTimeFormat(locale, {
          ...options,
          timeZone: timezone,
        }).format(date);
  return {
    appointmentTitle: text(event.title),
    appointmentDate: format(start, { dateStyle: 'medium' }),
    appointmentTime: format(start, { timeStyle: 'short' }),
    appointmentDateTime: format(start, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    appointmentEndTime: format(end, { timeStyle: 'short' }),
    appointmentTimezone: timezone,
    appointmentCalendar: calendarName,
    appointmentLocation: text(event.address),
  };
}

// Named parameters identify themselves. Positional parameters need a clear label
// immediately before them; never treat Meta example values as customer data.
function namedField(key: string): SourceMode | undefined {
  const name = key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, SourceMode> = {
    firstname: 'firstName',
    customerfirstname: 'firstName',
    contactfirstname: 'firstName',
    lastname: 'lastName',
    customerlastname: 'lastName',
    contactlastname: 'lastName',
    name: 'fullName',
    fullname: 'fullName',
    customername: 'fullName',
    contactname: 'fullName',
    phone: 'phone',
    phonenumber: 'phone',
    email: 'email',
    company: 'company',
    companyname: 'company',
    title: 'appointmentTitle',
    appointmenttitle: 'appointmentTitle',
    appointmentname: 'appointmentTitle',
    meetingtitle: 'appointmentTitle',
    meetingname: 'appointmentTitle',
    service: 'appointmentTitle',
    servicename: 'appointmentTitle',
    date: 'appointmentDate',
    appointmentdate: 'appointmentDate',
    meetingdate: 'appointmentDate',
    bookingdate: 'appointmentDate',
    time: 'appointmentTime',
    starttime: 'appointmentTime',
    appointmenttime: 'appointmentTime',
    appointmentstarttime: 'appointmentTime',
    meetingtime: 'appointmentTime',
    datetime: 'appointmentDateTime',
    appointmentdatetime: 'appointmentDateTime',
    meetingdatetime: 'appointmentDateTime',
    endtime: 'appointmentEndTime',
    appointmentendtime: 'appointmentEndTime',
    meetingendtime: 'appointmentEndTime',
    timezone: 'appointmentTimezone',
    calendartimezone: 'appointmentTimezone',
    appointmenttimezone: 'appointmentTimezone',
    calendar: 'appointmentCalendar',
    calendarname: 'appointmentCalendar',
    location: 'appointmentLocation',
    address: 'appointmentLocation',
    appointmentlocation: 'appointmentLocation',
    meetinglocation: 'appointmentLocation',
  };
  return Object.hasOwn(aliases, name) ? aliases[name] : undefined;
}

export function appointmentSources(
  template: WhatsAppTemplate,
  context: AppointmentContext,
): Record<string, SourceState> {
  const inferred = new Map<string, SourceMode | null>();
  const pattern = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  let previousEnd = 0;
  let previousMode: SourceMode | undefined;
  for (const match of template.bodyText.matchAll(pattern)) {
    const key = match[1];
    const left = template.bodyText
      .slice(previousEnd, match.index)
      .slice(-80)
      .toLowerCase()
      .trim();
    const right = template.bodyText.slice(match.index + match[0].length);
    let mode = namedField(key);
    if (!mode) {
      if (
        /\b(?:date\s*(?:and|&)\s*time|date\s*\/\s*time)\s*[:\-]?\s*$/.test(left)
      )
        mode = 'appointmentDateTime';
      else if (/\b(?:scheduled for|confirmed for)\s*[:\-]?\s*$/.test(left))
        mode = /^\s+at\s+\{\{/i.test(right)
          ? 'appointmentDate'
          : 'appointmentDateTime';
      else if (/\b(?:end time|ends at|until)\s*[:\-]?\s*$/.test(left))
        mode = 'appointmentEndTime';
      else if (/\b(?:timezone|time zone)\s*[:\-]?\s*$/.test(left))
        mode = 'appointmentTimezone';
      else if (/\b(?:date|day|on)\s*[:\-]?\s*$/.test(left))
        mode = 'appointmentDate';
      else if (
        /\b(?:time|starts at|start time)\s*[:\-]?\s*$/.test(left) ||
        (/\bat\s*$/.test(left) && previousMode === 'appointmentDate')
      )
        mode = 'appointmentTime';
      else if (
        /\b(?:appointment title|meeting title|appointment name|meeting name|service|appointment for)\s*[:\-]?\s*$/.test(
          left,
        )
      )
        mode = 'appointmentTitle';
      else if (/\b(?:calendar|calendar name)\s*[:\-]?\s*$/.test(left))
        mode = 'appointmentCalendar';
      else if (/\b(?:location|address)\s*[:\-]?\s*$/.test(left))
        mode = 'appointmentLocation';
      else if (/\b(?:hi|hello|dear|hey|namaste)\s*$/.test(left))
        mode = 'firstName';
    }
    if (mode) {
      const previous = inferred.get(key);
      inferred.set(key, inferred.has(key) && previous !== mode ? null : mode);
    }
    previousMode = mode;
    previousEnd = match.index + match[0].length;
  }
  return Object.fromEntries(
    template.bodyVariables.map((variable) => {
      const mode = namedField(variable.key) ?? inferred.get(variable.key);
      if (mode && isContactField(mode))
        return [variable.key, { mode, text: '' }];
      if (mode && mode !== 'text')
        return [variable.key, { mode, text: context[mode] }];
      return [variable.key, { mode: 'text', text: '' }];
    }),
  );
}
