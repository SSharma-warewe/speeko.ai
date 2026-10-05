import type { KnownToolId } from './tools.js';
import type {
  VoiceTaskCheck,
  VoiceTaskDefinition,
  VoiceTaskField,
} from './voice-tasks.js';

const field = (
  key: string,
  description = key,
  type: VoiceTaskField['type'] = 'string',
): VoiceTaskField => ({ key, description, type });
const identity = {
  title: 'Identity',
  instructions:
    'Confirm it is a good time. Confirm the expected person from context, or ask for their name. Do not disclose offer, debt, or visit details to the wrong person. Retry unclear identity once. Do not interpret hello or noise as an answer.',
  fieldKeys: ['confirmedName'],
  toolIds: [],
};
const outcome = (
  key: string,
  description: string,
  requiredFields: string[] = [],
  checks: VoiceTaskCheck[] = ['usable_answer'],
) => ({ key, description, requiredFields, checks });
const bookingTools: KnownToolId[] = [
  'lookupGhlContact',
  'upsertGhlContact',
  'checkGhlFreeSlots',
  'scheduleGhlMeeting',
];
const bookingInstructions =
  'Ask for the preferred date and time; use the authoritative call clock. Resolve the real contact from lookup/upsert or ghlContactId in context. Check availability before booking. Use the exact available slot. Only claim booking after a real booking tool succeeds. Read back the confirmed time once. Do not retry uncertain writes or repeat successful bookings. If tools fail, offer another time or callback.';
function task(
  name: string,
  objective: string,
  resultFields: VoiceTaskField[],
  outcomes: VoiceTaskDefinition['outcomes'],
  phases: VoiceTaskDefinition['phases'],
  contextFields: VoiceTaskField[] = [],
  toolIds: KnownToolId[] = [],
): VoiceTaskDefinition {
  return {
    name,
    description: objective,
    directions: ['outbound'],
    objective,
    phases,
    contextFields,
    resultFields,
    outcomes,
    toolIds,
  };
}
export const VOICE_TASK_STARTERS: Record<string, VoiceTaskDefinition> = {
  general: {
    ...task(
      'General conversation',
      'Help the person with their request on this voice call.',
      [field('summary')],
      [
        outcome('COMPLETED', 'Request resolved', [], []),
        outcome('TRANSFERRED', 'Caller transferred', [], []),
        outcome('ABANDONED', 'Caller chose to finish', [], []),
      ],
      [
        {
          title: 'Help the caller',
          instructions:
            'Understand the request and help using only available facts and tools. Finish when the request is resolved, transferred, or the caller is done.',
          fieldKeys: ['summary'],
          toolIds: [],
        },
      ],
    ),
    directions: ['inbound', 'outbound'],
  },
  demo_booking: task(
    'Demo booking',
    'Book a demo, then collect brief product-discovery answers.',
    [
      'eventId',
      'scheduledStart',
      'scheduledEnd',
      'participantEmail',
      'goals',
      'useCase',
      'successCriteria',
      'interestLevel',
      'notes',
    ].map((k) =>
      k === 'interestLevel'
        ? {
            ...field(k, k, 'enum'),
            enumValues: ['high', 'medium', 'low', 'none'],
          }
        : field(k),
    ),
    [
      outcome(
        'BOOKED_AND_QUALIFIED',
        'Demo booked and discovery collected',
        ['goals'],
        ['booking_receipt'],
      ),
      outcome(
        'BOOKED_ONLY',
        'Booked; caller declined discovery',
        [],
        ['booking_receipt'],
      ),
      outcome('NOT_BOOKED', 'Booking not achieved'),
      outcome('CALLBACK', 'Caller requested a callback'),
      outcome('DECLINED', 'Caller is not interested'),
    ],
    [
      {
        title: 'Book demo',
        instructions: `Confirm a good time to talk. Default demo length is 30 minutes. ${bookingInstructions}`,
        fieldKeys: [
          'eventId',
          'scheduledStart',
          'scheduledEnd',
          'participantEmail',
        ],
        toolIds: bookingTools,
      },
      {
        title: 'Product discovery',
        instructions:
          'After booking, ask their main goal or use case and what success looks like in 30–60 days, one question at a time. Do not end immediately after booking. Capture goals from their answer; if they decline questions use BOOKED_ONLY.',
        fieldKeys: [
          'goals',
          'useCase',
          'successCriteria',
          'interestLevel',
          'notes',
        ],
        toolIds: [],
      },
    ],
    [field('firstName'), field('email'), field('company')],
    bookingTools,
  ),
  interview_booking: task(
    'Interview booking',
    'Confirm candidate identity, then book an interview.',
    [
      'confirmedName',
      'eventId',
      'scheduledStart',
      'scheduledEnd',
      'participantEmail',
      'notes',
    ].map((k) => field(k)),
    [
      outcome(
        'BOOKED',
        'Interview booked',
        ['confirmedName'],
        ['booking_receipt'],
      ),
      outcome('NOT_BOOKED', 'No interview booked'),
      outcome('WRONG_PERSON', 'Not the expected person'),
      outcome('CALLBACK', 'Callback requested'),
      outcome('DECLINED', 'Interview declined'),
    ],
    [
      identity,
      {
        title: 'Book interview',
        instructions: `Only after identity confirmation, congratulate briefly. Default interview length is durationMinutes from context, otherwise 30 minutes. ${bookingInstructions}`,
        fieldKeys: [
          'eventId',
          'scheduledStart',
          'scheduledEnd',
          'participantEmail',
          'notes',
        ],
        toolIds: bookingTools,
      },
    ],
    [
      field('firstName'),
      field('email'),
      {
        ...field('durationMinutes', 'Interview duration', 'number'),
        defaultValue: 30,
      },
    ],
    bookingTools,
  ),
  personal_loan_outreach: task(
    'Personal loan outreach',
    'Present the supplied personal-loan offer and capture interest.',
    [
      'confirmedName',
      'email',
      'loanAmount',
      'interestRate',
      'time',
      'notes',
    ].map((k) => field(k)),
    [
      outcome(
        'INTERESTED',
        'Clearly interested',
        [],
        ['personal_loan_interest'],
      ),
      outcome(
        'NOT_INTERESTED',
        'Clearly not interested',
        [],
        ['personal_loan_interest'],
      ),
      outcome('CALLBACK', 'Callback requested'),
    ],
    [
      identity,
      {
        title: 'Offer',
        instructions:
          'Present only loanAmount, interestRate and time/tenure from context. Do not invent fees, eligibility, EMI or terms. Offer human follow-up for missing details.',
        fieldKeys: ['loanAmount', 'interestRate', 'time'],
        toolIds: [],
      },
      {
        title: 'Interest',
        instructions:
          'Explicitly ask if they are interested. Wait for their answer. Record callback if busy or the wrong person requests follow-up.',
        fieldKeys: ['notes'],
        toolIds: [],
      },
    ],
    ['firstName', 'email', 'loanAmount', 'interestRate', 'time'].map((k) =>
      field(k),
    ),
  ),
  loan_collection: task(
    'Loan collection',
    'Discuss the supplied due payment and collect commitment, delay reason, and help requested.',
    [
      'confirmedName',
      'email',
      'dueType',
      'dueDate',
      'loanAmount',
      'promisedPayDate',
      'delayReason',
      'helpRequested',
      'notes',
    ].map((k) => field(k)),
    [
      outcome(
        'PROMISED',
        'Payment committed',
        ['promisedPayDate', 'delayReason', 'helpRequested'],
        ['loan_collection'],
      ),
      outcome('REFUSED', 'Refuses payment', [], ['loan_collection']),
      outcome(
        'ALREADY_PAID',
        'Explicitly says already paid',
        [],
        ['loan_collection'],
      ),
      outcome('CALLBACK', 'Callback requested', [], ['loan_collection']),
      outcome(
        'WRONG_PERSON',
        'Explicitly wrong person',
        [],
        ['loan_collection'],
      ),
    ],
    [
      identity,
      {
        title: 'Due notice',
        instructions:
          'Present only supplied dueType, dueDate and loanAmount. Explain late payments may affect CIBIL and future borrowing without threats or invented numeric drops, fees, or penalties.',
        fieldKeys: ['dueType', 'dueDate', 'loanAmount'],
        toolIds: [],
      },
      {
        title: 'Payment commitment',
        instructions:
          'Ask when they will pay and wait for a commitment/date, refusal or explicit already-paid statement.',
        fieldKeys: ['promisedPayDate'],
        toolIds: [],
      },
      {
        title: 'Delay reason',
        instructions:
          'Ask why payment was delayed. Record none only if they decline to explain. Skip for already-paid or wrong-person outcomes.',
        fieldKeys: ['delayReason'],
        toolIds: [],
      },
      {
        title: 'Other help',
        instructions:
          'Ask whether they need any other help and wait for the answer before completing. Record none if they say no.',
        fieldKeys: ['helpRequested', 'notes'],
        toolIds: [],
      },
    ],
    ['firstName', 'email', 'dueType', 'dueDate', 'loanAmount'].map((k) =>
      field(k),
    ),
  ),
  real_estate_outreach: task(
    'Real estate outreach',
    'Present the supplied property inquiry and capture interest.',
    ['confirmedName', 'email', 'location', 'budget', 'notes'].map((k) =>
      field(k),
    ),
    [
      outcome('INTERESTED', 'Clearly interested', [], ['property_interest']),
      outcome(
        'NOT_INTERESTED',
        'Clearly not interested',
        [],
        ['property_interest'],
      ),
      outcome('CALLBACK', 'Callback requested'),
    ],
    [
      identity,
      {
        title: 'Property inquiry',
        instructions:
          'Present only location and budget from context. Do not invent listings, prices, amenities or availability. Offer human follow-up for missing details.',
        fieldKeys: ['location', 'budget'],
        toolIds: [],
      },
      {
        title: 'Interest',
        instructions: 'Ask if they are interested and wait for the answer.',
        fieldKeys: ['notes'],
        toolIds: [],
      },
    ],
    ['firstName', 'email', 'location', 'budget'].map((k) => field(k)),
  ),
  real_estate_visit_confirmation: task(
    'Property visit confirmation',
    'Confirm attendance for the supplied existing property visit.',
    ['confirmedName', 'location', 'time', 'notes'].map((k) => field(k)),
    [
      outcome('CONFIRMED', 'Will attend', [], ['visit_attendance']),
      outcome('NOT_COMING', 'Cannot attend', [], ['visit_attendance']),
      outcome('CALLBACK', 'Callback requested'),
    ],
    [
      identity,
      {
        title: 'Visit details',
        instructions:
          'Present only supplied location, time and notes. Do not invent directions, parking, documents or amenities.',
        fieldKeys: ['location', 'time'],
        toolIds: [],
      },
      {
        title: 'Attendance',
        instructions:
          'Ask whether they will attend and wait for the answer. Do not offer or book a replacement slot. Capture volunteered new times in notes; use NOT_COMING or CALLBACK.',
        fieldKeys: ['notes'],
        toolIds: [],
      },
    ],
    ['firstName', 'location', 'time', 'notes'].map((k) => field(k)),
  ),
};
