import {
  savedSpeechErrors,
  compileSavedSpeech,
  type SavedSpeech,
} from './saved-speech.js';
import { isKnownToolId, type KnownToolId } from './tools.js';

export const VOICE_TASK_CHECKS = [
  'usable_answer',
  'personal_loan_interest',
  'property_interest',
  'visit_attendance',
  'loan_collection',
  'booking_receipt',
] as const;
export type VoiceTaskCheck = (typeof VOICE_TASK_CHECKS)[number];
export type VoiceTaskField = {
  key: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  enumValues?: string[];
  defaultValue?: string | number | boolean;
  required?: boolean;
};
export type VoiceTaskDefinition = {
  savedSpeech?: SavedSpeech;
  name: string;
  description: string;
  directions: Array<'inbound' | 'outbound'>;
  objective: string;
  phases: Array<{
    title: string;
    instructions: string;
    sentenceKeys?: string[];
    fieldKeys: string[];
    toolIds: KnownToolId[];
  }>;
  contextFields: VoiceTaskField[];
  resultFields: VoiceTaskField[];
  outcomes: Array<{
    key: string;
    description: string;
    requiredFields: string[];
    checks: VoiceTaskCheck[];
  }>;
  toolIds: KnownToolId[];
};
export type VoiceTaskSnapshot = {
  schemaVersion: 1;
  taskId: string;
  version: number;
  /** Draft tests identify the exact revision without publishing. */
  draftRevision?: number;
  definition: VoiceTaskDefinition;
};
export type VoiceTaskRecord = {
  id: string;
  organizationId: string | null;
  starterKey: string | null;
  draftRevision: number;
  publishedVersion: number | null;
  archived: boolean;
  draft: VoiceTaskDefinition;
  published: VoiceTaskSnapshot | null;
};
export type VoiceTaskVersion = VoiceTaskSnapshot & { publishedAt: string };
export type CreateVoiceTaskRequest = { definition: VoiceTaskDefinition };
export type UpdateVoiceTaskRequest = {
  definition: VoiceTaskDefinition;
  revision: number;
};
export type VoiceTaskTestRequest = {
  organizationAgentId: string;
  revision: number;
  context?: Record<string, unknown>;
};

const reserved = new Set([
  'task',
  'taskId',
  'taskVersion',
  'outcome',
  '__proto__',
  'prototype',
  'constructor',
]);
const identifier = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Browser-safe structural and reference validation. Reject unknown executable configuration. */
export function voiceTaskDefinitionErrors(value: unknown): string[] {
  const errors: string[] = [];
  if (!record(value)) return ['Task definition must be an object'];
  const allowed = [
    'name',
    'description',
    'directions',
    'objective',
    'phases',
    'contextFields',
    'resultFields',
    'outcomes',
    'toolIds',
    'savedSpeech',
  ];
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) errors.push(`Unknown task property: ${key}`);
  for (const key of ['name', 'objective'])
    if (typeof value[key] !== 'string' || !value[key].trim())
      errors.push(`${key} is required`);
  for (const key of ['name', 'description', 'objective'])
    if (
      typeof value[key] !== 'string' ||
      (value[key] as string).length > (key === 'name' ? 120 : 8000)
    )
      errors.push(`Invalid ${key}`);
  if (
    !Array.isArray(value.directions) ||
    !value.directions.length ||
    value.directions.some((d) => d !== 'inbound' && d !== 'outbound')
  )
    errors.push('Choose inbound and/or outbound');
  const lists: Record<string, unknown[]> = {};
  for (const key of [
    'phases',
    'contextFields',
    'resultFields',
    'outcomes',
    'toolIds',
  ]) {
    if (!Array.isArray(value[key]) || value[key].length > 40)
      errors.push(`${key} must be an array of at most 40 items`);
    lists[key] = Array.isArray(value[key]) ? value[key] : [];
  }
  if (!lists.phases.length || !lists.outcomes.length)
    errors.push('At least one phase and outcome are required');
  const tools = new Set(lists.toolIds);
  if (
    tools.size !== lists.toolIds.length ||
    lists.toolIds.some((id) => typeof id !== 'string' || !isKnownToolId(id))
  )
    errors.push('Tool ids must be unique supported capabilities');
  const fields = new Set<string>();
  const resultKeys = new Set<string>();
  for (const kind of ['contextFields', 'resultFields']) {
    const seen = new Set<string>();
    for (const field of lists[kind]) {
      if (!record(field)) {
        errors.push(`Invalid ${kind} field`);
        continue;
      }
      for (const key of Object.keys(field))
        if (
          ![
            'key',
            'description',
            'type',
            'enumValues',
            'defaultValue',
            'required',
          ].includes(key)
        )
          errors.push(`Unknown field property: ${key}`);
      const key = String(field.key ?? '');
      if (!identifier.test(key) || reserved.has(key) || seen.has(key))
        errors.push(`Invalid or duplicate field key: ${key}`);
      seen.add(key);
      fields.add(key);
      if (kind === 'resultFields') resultKeys.add(key);
      if (
        typeof field.description !== 'string' ||
        field.description.length > 2000
      )
        errors.push(`Invalid description for ${key}`);
      if (!['string', 'number', 'boolean', 'enum'].includes(String(field.type)))
        errors.push(`Invalid type for ${key}`);
      if (field.required !== undefined && typeof field.required !== 'boolean')
        errors.push(`Invalid required flag for ${key}`);
      if (
        field.type === 'enum' &&
        (!Array.isArray(field.enumValues) ||
          !field.enumValues.length ||
          field.enumValues.length > 40 ||
          field.enumValues.some(
            (v) => typeof v !== 'string' || !v.trim() || v.length > 120,
          ) ||
          new Set(field.enumValues).size !== field.enumValues.length)
      )
        errors.push(`Invalid enum for ${key}`);
      if (
        field.defaultValue !== undefined &&
        !voiceTaskFieldAccepts(field as VoiceTaskField, field.defaultValue)
      )
        errors.push(`Invalid default for ${key}`);
    }
  }
  for (const phase of lists.phases) {
    if (!record(phase)) {
      errors.push('Invalid phase');
      continue;
    }
    for (const key of Object.keys(phase))
      if (
        ![
          'title',
          'instructions',
          'fieldKeys',
          'toolIds',
          'sentenceKeys',
        ].includes(key)
      )
        errors.push(`Unknown phase property: ${key}`);
    if (
      typeof phase.title !== 'string' ||
      !phase.title.trim() ||
      phase.title.length > 120 ||
      typeof phase.instructions !== 'string' ||
      !phase.instructions.trim() ||
      phase.instructions.length > 8000
    )
      errors.push('Phase title and instructions are required');
    if (
      !Array.isArray(phase.fieldKeys) ||
      phase.fieldKeys.some((k) => !fields.has(String(k)))
    )
      errors.push('Phase references an unknown field');
    if (
      !Array.isArray(phase.toolIds) ||
      phase.toolIds.some((k) => !tools.has(k))
    )
      errors.push('Phase references an unselected tool');
  }
  const outcomes = new Set<string>();
  for (const outcome of lists.outcomes) {
    if (!record(outcome)) {
      errors.push('Invalid outcome');
      continue;
    }
    for (const key of Object.keys(outcome))
      if (!['key', 'description', 'requiredFields', 'checks'].includes(key))
        errors.push(`Unknown outcome property: ${key}`);
    const key = String(outcome.key ?? '');
    if (!identifier.test(key) || reserved.has(key) || outcomes.has(key))
      errors.push(`Invalid or duplicate outcome: ${key}`);
    outcomes.add(key);
    if (
      typeof outcome.description !== 'string' ||
      !outcome.description.trim() ||
      outcome.description.length > 2000
    )
      errors.push(`Outcome ${key} needs a description`);
    if (
      !Array.isArray(outcome.requiredFields) ||
      outcome.requiredFields.some((k) => !resultKeys.has(String(k)))
    )
      errors.push(`Outcome ${key} references an unknown result field`);
    const checkOutcomes: Partial<Record<VoiceTaskCheck, string[]>> = {
      personal_loan_interest: ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK'],
      property_interest: ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK'],
      visit_attendance: ['CONFIRMED', 'NOT_COMING', 'CALLBACK'],
      loan_collection: [
        'PROMISED',
        'REFUSED',
        'ALREADY_PAID',
        'CALLBACK',
        'WRONG_PERSON',
      ],
    };
    if (Array.isArray(outcome.checks))
      for (const check of outcome.checks) {
        const supported = checkOutcomes[check as VoiceTaskCheck];
        if (supported && !supported.includes(key))
          errors.push(`Check ${check} does not support outcome ${key}`);
        if (check === 'loan_collection' && key === 'PROMISED')
          for (const required of [
            'promisedPayDate',
            'delayReason',
            'helpRequested',
          ]) {
            if (
              !lists.resultFields.some(
                (f) => record(f) && f.key === required && f.type === 'string',
              )
            )
              errors.push(`Loan collection requires string result ${required}`);
          }
      }
    if (
      !Array.isArray(outcome.checks) ||
      outcome.checks.some(
        (c) => !(VOICE_TASK_CHECKS as readonly unknown[]).includes(c),
      )
    )
      errors.push(`Outcome ${key} has unsupported completion checks`);
    if (
      Array.isArray(outcome.checks) &&
      outcome.checks.includes('booking_receipt') &&
      !tools.has('scheduleGhlMeeting') &&
      !tools.has('createCalendarEvent')
    )
      errors.push(`Outcome ${key} needs a real calendar booking tool`);
  }
  errors.push(
    ...savedSpeechErrors(value.savedSpeech, lists.phases, lists.toolIds),
  );
  if (JSON.stringify(value).length > 48000)
    errors.push('Task definition exceeds 48 KB');
  return errors;
}

export function voiceTaskFieldAccepts(
  field: VoiceTaskField,
  value: unknown,
): boolean {
  if (field.type === 'enum')
    return typeof value === 'string' && !!field.enumValues?.includes(value);
  if (field.type === 'number')
    return typeof value === 'number' && Number.isFinite(value);
  return typeof value === field.type;
}
export function isVoiceTaskSnapshot(
  value: unknown,
): value is VoiceTaskSnapshot {
  return (
    record(value) &&
    Object.keys(value).every((k) =>
      [
        'schemaVersion',
        'taskId',
        'version',
        'draftRevision',
        'definition',
      ].includes(k),
    ) &&
    value.schemaVersion === 1 &&
    typeof value.taskId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.taskId,
    ) &&
    Number.isInteger(value.version) &&
    Number(value.version) >= 0 &&
    Number(value.version) <= 2147483647 &&
    (value.version === 0
      ? Number.isInteger(value.draftRevision) && Number(value.draftRevision) > 0
      : value.draftRevision === undefined) &&
    voiceTaskDefinitionErrors(value.definition).length === 0
  );
}
export function compileVoiceTaskInstructions(
  definition: VoiceTaskDefinition,
  options: { nativeSpeech?: boolean } = {},
): string {
  return [
    `Objective: ${definition.objective}`,
    ...definition.phases.map(
      (phase, i) =>
        `PHASE ${i + 1}: ${phase.title}\n${phase.instructions}\nAssociated fields: ${phase.fieldKeys.join(', ') || 'none'}. Capabilities: ${phase.toolIds.join(', ') || 'none'}.`,
    ),
    ...definition.phases.flatMap((phase, i) =>
      phase.sentenceKeys?.length
        ? [
            `Phase ${i + 1} saved sentence keys: ${phase.sentenceKeys.join(', ')}`,
          ]
        : [],
    ),
    compileSavedSpeech(definition.savedSpeech, options.nativeSpeech),
    'INPUT CONTEXT:',
    ...definition.contextFields.map(
      (f) =>
        `${f.key} (${f.type}): ${f.description}. ${f.required ? 'Required input.' : 'Optional input.'}`,
    ),
    'Ask one short question at a time. Skip information already answered. Never invent missing facts or claim an external action succeeded without a successful tool result.',
    'RESULT FIELDS:',
    ...definition.resultFields.map(
      (f) => `${f.key} (${f.type}): ${f.description}`,
    ),
    'COMPLETION OUTCOMES:',
    ...definition.outcomes.map(
      (o) =>
        `${o.key}: ${o.description}. Required fields: ${o.requiredFields.join(', ') || 'none'}. Evidence checks: ${o.checks.join(', ') || 'none'}.`,
    ),
    'Call complete_voice_task only after the caller answers your final question and the chosen outcome requirements are satisfied. Refusal and callback use their own outcome requirements. If they ask to stop, end promptly. After completion the system says goodbye and hangs up.',
  ].join('\n\n');
}
