import {
  WHATSAPP_TASK_STARTERS,
  whatsAppTaskDefinitionErrors,
  prepareWhatsAppTaskContext,
  type WhatsAppTaskDefinition,
} from '@call-agent/contracts';
import { validateTaskCompletion } from '../task-completion';
import { checkpointSchema } from '../../whatsapp-harness/turn-checkpoint';
const definition = (): WhatsAppTaskDefinition => ({
  name: 'Qualification',
  description: '',
  objective: 'Collect interest',
  phases: [
    {
      title: 'Ask',
      instructions: 'Ask about interest',
      fieldKeys: ['interest'],
      toolIds: [],
    },
  ],
  contextFields: [],
  resultFields: [
    {
      key: 'interest',
      description: 'Customer interest',
      type: 'enum',
      enumValues: ['yes', 'no'],
      required: true,
    },
  ],
  outcomes: [
    {
      key: 'qualified',
      description: 'Interest captured',
      requiredFields: ['interest'],
      checks: ['usable_customer_message'],
      terminalStatus: 'completed',
    },
    {
      key: 'declined',
      description: 'Customer asked to stop',
      requiredFields: [],
      checks: ['explicit_refusal'],
      terminalStatus: 'cancelled',
    },
  ],
  toolIds: [],
});
const session = { state: {}, events: [] };
describe('Configurable WhatsApp task validation', () => {
  it('accepts the two starters and workflows without tools', () => {
    for (const d of Object.values(WHATSAPP_TASK_STARTERS))
      expect(whatsAppTaskDefinitionErrors(d)).toEqual([]);
    expect(whatsAppTaskDefinitionErrors(definition())).toEqual([]);
  });
  it.each([
    { directions: ['inbound'] },
    { executable: 'eval()' },
    { toolIds: ['endCall'] },
    { toolIds: ['scheduleGhlMeeting'] },
    {
      outcomes: [
        {
          key: 'cancelled',
          description: 'Stop',
          terminalStatus: 'cancelled',
          requiredFields: [],
          checks: [],
        },
      ],
    },
  ])('rejects unsupported or unsafe configuration %p', (patch) => {
    expect(
      whatsAppTaskDefinitionErrors({ ...definition(), ...patch }),
    ).not.toEqual([]);
  });
  it('rejects unknown outcome/field references and invalid defaults', () => {
    const d = definition();
    d.outcomes[0].requiredFields = ['unknown'];
    expect(whatsAppTaskDefinitionErrors(d)).not.toEqual([]);
    d.resultFields[0].defaultValue = 'maybe';
    expect(whatsAppTaskDefinitionErrors(d)).not.toEqual([]);
  });
  it('applies defaults without inventing required inputs', () => {
    const d = definition();
    d.contextFields = [
      {
        key: 'company',
        type: 'string',
        description: '',
        defaultValue: 'Example',
        required: true,
      },
    ];
    expect(prepareWhatsAppTaskContext(d)).toEqual({ company: 'Example' });
    expect(() => prepareWhatsAppTaskContext(d, { company: false })).toThrow(
      'company',
    );
  });
  it('validates structured completion and rejects missing/wrong values', () => {
    expect(
      validateTaskCompletion(
        definition(),
        { outcome: 'qualified', fields: { interest: 'yes' } },
        'Yes, interested',
        session,
        null,
      ),
    ).toEqual([]);
    for (const fields of [
      {},
      { interest: 'maybe' },
      { interest: 'yes', fabricated: true },
    ])
      expect(
        validateTaskCompletion(
          definition(),
          { outcome: 'qualified', fields },
          'Yes',
          session,
          null,
        ),
      ).not.toEqual([]);
  });
  it('requires API booking evidence and rejects mismatched receipt ids', () => {
    const d = structuredClone(WHATSAPP_TASK_STARTERS.appointment_booking);
    d.resultFields = [
      { key: 'appointmentId', description: '', type: 'string' },
    ];
    expect(
      validateTaskCompletion(
        d,
        { outcome: 'booked', fields: {} },
        'Book it',
        session,
        null,
      ),
    ).not.toEqual([]);
    expect(
      validateTaskCompletion(
        d,
        { outcome: 'booked', fields: {} },
        'Book it',
        session,
        { ok: true, appointmentId: 'real' },
      ),
    ).toEqual([]);
    expect(
      validateTaskCompletion(
        d,
        { outcome: 'booked', fields: { appointmentId: 'fake' } },
        'Book it',
        session,
        { ok: true, appointmentId: 'real' },
      ),
    ).not.toEqual([]);
  });
  it('requires quoted explicit current-message refusal, not model assertions', () => {
    const d = definition();
    d.resultFields[0].required = false;
    for (const [body, evidence] of [
      ['please stop', 'please stop'],
      ['not interested', 'not interested'],
    ])
      expect(
        validateTaskCompletion(
          d,
          { outcome: 'declined', fields: {}, evidence },
          body,
          session,
          null,
        ),
      ).toEqual([]);
    for (const [body, evidence] of [
      ['keep going', 'stop'],
      ["don't stop", 'stop'],
      ['Could you stop tomorrow?', 'stop'],
    ])
      expect(
        validateTaskCompletion(
          d,
          { outcome: 'declined', fields: {}, evidence },
          body,
          session,
          null,
        ),
      ).not.toEqual([]);
  });
  it('preserves completion through checkpoint validation and rejects invalid payloads', () => {
    const completion = { outcome: 'qualified', fields: { interest: 'yes' } };
    expect(
      checkpointSchema.parse({ session, reply: 'Done', completion }).completion,
    ).toEqual(completion);
    expect(() =>
      checkpointSchema.parse({
        session,
        completion: { outcome: 'qualified', fields: [], executable: true },
      }),
    ).toThrow();
  });
});
