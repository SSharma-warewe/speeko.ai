# Shared contracts instructions

Scope: `packages/contracts`. Inherit the [root instructions](../../AGENTS.md). `@call-agent/contracts` is the canonical browser/server/worker wire and catalog package; it must not own application I/O or Nest DTO decorators.

## Structure and compatibility

- `opening-preparation.ts` owns the shared exact-opening resolver and outbound pre-dial classification, optional version-1 `openingPreparation {version,attemptId,deadline}` dispatch field and `speeko.openingPreparation` participant readiness report (status and bounded usage only). Producer/worker changes must be deployed worker first. CallFailureCode adds terminal `opening_preparation_failed`; no public readiness endpoint or new call state is introduced.

- `AgentJobPrompt.onEnterInstructions` remains the existing optional nullable string. With resolved `ttsPreparedSpeechEnabled=true` on a pipeline job, nonempty text is spoken verbatim; task-defined sentence/silent opening wins. Preparation Off/native realtime retains generation guidance. No new metadata field or schema version is introduced.

- `src/index.ts` exports domain catalogs/types; `src/http/index.ts` exports HTTP request/response types. Keep types grouped by existing domain and exported through the public barrel.
- Define new tool ids, task keys, call states/failure codes, integration providers, price wire shapes, delivery modes, speech/model/voice catalogs, metadata fields, and lead-quality helpers here first.
- Voice jobs use `AgentJobMetadata`; callbacks use `CompleteCallPayload`/inbound types. WhatsApp uses distinct versioned turn/session/task contracts. Do not conflate LiveKit task keys with WhatsApp tasks.
- Preserve null/optional distinctions: hooks null/default versus empty/silent, catalog null/default, inbound optional callId, outbound org defaultTaskKey null, WhatsApp platform task null, and legacy allowlist null/full access.
- This is an ESM package emitting JS/declarations to `dist`; TypeScript relative imports use `.js`. Server/worker builds consume the emitted package; Vite aliases source; API webpack/Jest use configured source mappings. Do not change exports casually.
- Nest class-validator/Swagger DTO classes remain in API and import these catalogs/types. CRM validation schemas remain in API; the shared fixed action catalog/wire types live here.
- No provider credentials, network calls, Postgres access, UI layouts, or application-specific runtime state in contracts.
- `tts-cache.ts` defines worker-only shared-cache requests/responses, safe PCM envelope/alignment types, canonical metadata validation, compatibility namespace and hard clip/wire limits. Hashing/base64 encoding and application I/O stay in API/worker. Namespace revisions must change together with incompatible SDK/transform changes. Do not put SDK objects, arbitrary userdata, provider usage or credentials in shared envelopes.
- `resolveTtsCacheEnabled(preference, defaultEnabled, model)` is the shared pure policy resolver: null inherits, final default false, native realtime always false. HTTP agents expose raw `ttsCacheEnabled: boolean | null`, `ttsCacheDefaultEnabled` and `effectiveTtsCacheEnabled`; template/org PATCH requests accept optional boolean/null. Dispatch metadata carries optional resolved boolean `ttsCacheEnabled`; only literal true enables worker caching, so legacy metadata stays off. Do not flatten raw inheritance in HTTP responses or portal saves.

## Naming and changes

Human-operated tools use separate `HUMAN_CALL_TOOL_IDS` (`interest`, `bookMeeting`, `notes`), not KNOWN_TOOL_IDS. `http/human-call-workspace.ts` defines optimistic updates, interest/notes and external-action receipts. CreateHumanCallRequest optionally carries selectedTools (omission means none); HumanCallSummary optionally carries workspace; create/join optionally carry ephemeral `connection { serverUrl, participantToken }` while retaining meetUrl compatibility. History excludes credentials and journal fingerprints. No voice/WhatsApp execution protocol changes are involved.

- File names lowercase kebab-case, exported types PascalCase, helpers camelCase, constants UPPER_SNAKE_CASE. Tool ids camelCase; task keys/provider values snake_case as established; URL/model ids preserve their catalog spelling.
- For a wire change, update all affected producer packers/DTOs, worker parsers/schemas/builders/callbacks, frontend clients/options, and tests in one change. Stable ids are persisted and dispatched; renaming them is a compatibility change, not a cosmetic cleanup.
- Versioned WhatsApp changes require compatible worker health/protocol and API rollout order; follow [TASK-SESSIONS](../../apps/whatsapp-worker/TASK-SESSIONS.md). Do not silently reinterpret saved jobs or task snapshots.

## Verification

- From repo root: `npm run typecheck:contracts`, `npm run build:contracts`. API/worker/WhatsApp build scripts build contracts first; dev workers need emitted contracts available.
- Run affected consumer builds/typechecks and meaningful catalog/alignment tests. Existing voice alignment: [contracts-alignment.spec.ts](../../apps/worker/src/test/contracts-alignment.spec.ts). UI is a separate source package.
- Read the relevant [API](../../apps/api/AGENTS.md), [voice worker](../../apps/worker/AGENTS.md), [WhatsApp worker](../../apps/whatsapp-worker/AGENTS.md), [web](../../apps/web/AGENTS.md), or [portal](../../apps/portal/AGENTS.md) guide before changing consumer behavior. [Railway guide](../../railway/AGENTS.md) determines which consumers need deployment.

## Canonical export and ownership map

| Source | Public contract owned here |
| --- | --- |
| `tools.ts` / `tasks.ts` | `KNOWN_TOOL_IDS`, `TOOL_IDS`, guards; `KNOWN_TASK_KEYS`, `TASK_KEYS`, `DEFAULT_TASK_KEY` |
| `llm.ts` / `tts.ts` / `stt.ts` | Model ids, aliases, backend specs, defaults, voice compatibility, pipeline/realtime lists |
| `speech-language.ts` / `delivery.ts` | Speech-language catalogs/normalization; Inworld `DELIVERY_MODES` |
| `agent.ts` / `call.ts` / `sip.ts` / `queue.ts` / `user.ts` | Direction, status/buckets/failures/transcripts, SIP publication, queue/batch and member-role enums |
| `integration.ts` / `crm.ts` | Provider/calendar guards; fixed `CRM_ACTIONS`, `CRM_SCOPES`, command/result types |
| `price.ts` | Cost attempts/lines/snapshots and summaries; prices themselves stay API-owned |
| `demo.ts` / `demo-lead.ts` | Form choices and shared real-person/work-email validation |
| `job-metadata.ts` / `worker-callback.ts` | API dispatch and voice completion/inbound callback wire shapes |
| `whatsapp-harness.ts` / `whatsapp-tasks.ts` / `whatsapp-clock.ts` | Model/tool ids, turn/lease/checkpoint/task snapshots and fresh sender-time instructions |
| `http/index.ts` and domain HTTP files | Public request/response shapes and errors, re-exported by the package barrel |

Keep exports in `src/index.ts` and the relevant HTTP barrel aligned. Existing consumers import from `@call-agent/contracts`; internal relative ESM imports end in `.js`. Browser-safe catalog/validation helpers must not acquire server packages or side effects.

## Catalog defaults and workflow semantics

Voice task ids are `general`, `demo_booking`, `interview_booking`, `personal_loan_outreach`, `loan_collection`, `real_estate_outreach`, and `real_estate_visit_confirmation`. Tool ids are `endCall`, `booking`, `cancelBooking`, `transferCall`, `lookupCustomer`, `confirmAppointment`, `checkCalendarAvailability`, `listCalendarEvents`, `createCalendarEvent`, `cancelCalendarEvent`, `checkGhlFreeSlots`, `lookupGhlContact`, `upsertGhlContact`, and `scheduleGhlMeeting`. Document additions here and update the registry, API validators/allowlists, pickers, metadata, and alignment tests together.

Null voice model defaults are Gemma LLM, Inworld TTS-2, and Deepgram Nova-3 STT. Native OpenAI/xAI realtime models are speech-to-speech and ignore pipeline STT/TTS. `speakingRate` is 0.5–1.5 where supported; Inworld alone uses `STABLE` / `BALANCED` / `CREATIVE` delivery. Model switching must validate the compatible voice set. Catalogs are the live supported-id source; the detailed provider behavior is in [voice instructions](../../apps/worker/AGENTS.md#detailed-runtime).

Call lifecycle values are pending, creating, dialing, ready, failed, completed, incomplete, and cancelled. `taskCompleted` is explicit: a leftover `taskResult` is not completion evidence. Inbound metadata has no unique call id at publish; the worker obtains it by API upsert. Empty hook strings mean silent; null/undefined hooks select defaults.

Human CRM call contracts add CallExecutionType (agent/human), CallTaskStatus.NOT_APPLICABLE, and http/human-calls.ts request/phase/summary/response types. CallRecord exposes executionType and optional humanCall history metadata. A completed human call means an answered session ended, not a workflow result. HumanCallResponse may include ephemeral meetUrl only on create/join; ActiveHumanCallResponse exposes enabled and nullable active without credentials. No worker job/callback protocol changes are required. Keep date strings and ordinary history free of join tokens, operational leases, or provider credentials.

WhatsApp model is `openai/gpt-5.6-luna`; permitted GHL ids are lookupGhlContact, upsertGhlContact, checkGhlFreeSlots, scheduleGhlMeeting. Version-1 `receptionist` and `appointment_booking` tasks share `ghl_appointment_created` completion. API-persisted appointment receipts are the authority. Platform turns have `task: null`; OTP is not a model turn.

## Wire definitions

### Human transcription

`human-transcription.ts` defines the separate `{mode:'human_transcription',callId,roomName}` worker dispatch shape. It is not AgentJobMetadata and must branch before the AI parser. Start carries roomName/jobId and returns authoritative browserIdentity/sipIdentity plus a private callbackToken. Checkpoint carries jobId/callbackToken, final segments `{id,role:'caller'|'contact',content,createdAt}`, cumulative audioDuration/listenerDuration seconds and optional partial; finish adds answered. HumanCallSummary optionally exposes `{status,provider:'sarvam',model:'saaras:v3-realtime'}`. Status IDs are pending/running/finalizing/complete/partial/unavailable/not_needed. Existing CallTranscriptItem, call lifecycle and task status contracts are unchanged. No token is persisted in reports or public history.

The following source snapshots expose the complete field structure for contributors. Update these examples when changing their source contracts; source files, not Markdown examples, remain authoritative. These contain shapes only, never actual leases, credentials, recipient data, or transcript content.

### job-metadata.ts

```ts
import type { AgentDirection } from './agent.js';
import type { CallMedium } from './call.js';
import type { DeliveryMode } from './delivery.js';

export type AgentJobPrompt = {
  systemPrompt: string;
  /**
   * LiveKit onEnter generateReply instructions.
   * undefined/null = built-in default; empty string = skip opening speech.
   */
  onEnterInstructions?: string | null;
  /**
   * Spoken closing line for LiveKit onExit (`session.say`).
   * undefined/null = built-in default; empty string = skip closing speech.
   */
  onExitInstructions?: string | null;
};

/**
 * Runtime-only dispatch metadata packed by the API and parsed by the worker.
 * No executable code. Persona = prompt.systemPrompt; workflow = task;
 * capabilities = enabledTools.
 *
 * Inbound SIP dispatch has no unique callId (static at publish). The worker
 * upserts a calls row and then uses the returned id on complete.
 */
export type AgentJobMetadata = {
  openingPreparation?: import('./opening-preparation.js').OpeningPreparation;
  callId?: string;
  organizationId?: string;
  organizationAgentId?: string;
  agentKey: string;
  direction: AgentDirection;
  medium?: CallMedium;
  /** LiveKit TaskRegistry key. */
  task: string;
  prompt: AgentJobPrompt;
  /** Worker ToolRegistry ids. */
  enabledTools: string[];
  /** Free-form runtime context (CRM fields, booking details, etc.). */
  context?: Record<string, unknown>;
  participantIdentity?: string;
  voice?: string | null;
  /** LLM / realtime catalog id. null = Gemma via LiveKit Inference. */
  model?: string | null;
  /** TTS catalog id. null = Inworld. Ignored when `model` is realtime. */
  ttsModel?: string | null;
  /** STT catalog id. null = Deepgram Nova-3. Ignored when `model` is a speech-to-speech realtime id. */
  sttModel?: string | null;
  /**
   * BCP-47 speech language for Sarvam STT/TTS (`hi-IN`, `en-IN`, `unknown`, …).
   * Ignored unless a Sarvam speech model is selected. null = worker default.
   */
  speechLanguage?: string | null;
  temperature?: number | null;
  /** Speaking-rate multiplier when the selected TTS supports it (0.5–1.5). */
  speakingRate?: number | null;
  /** API-resolved caching policy; missing means off. */
  ttsCacheEnabled?: boolean;
  /** Inworld TTS-2 delivery_mode. Ignored by other speech models. */
  deliveryMode?: DeliveryMode | null;
};
```

### worker-callback.ts

```ts
import type { CallFailureCode, CallTranscriptItem } from './call.js';

/** One worker tool invocation during a call (persisted via complete → sessionReport). */
export type ToolEvent = {
  at: string;
  toolId: string;
  args?: unknown;
  /** Sanitized tool return value (size-capped). */
  result?: unknown;
  ok?: boolean;
  error?: string;
  summary?: string;
  durationMs?: number;
};

/**
 * Worker → API POST /api/internal/calls/:id/complete.
 * `status: completed` means the voice session ended after answer;
 * `taskCompleted` says whether the LiveKit task actually finished.
 * API maps completed+true → completed, completed+false → incomplete.
 */
export type CompleteCallPayload = {
  status: 'completed' | 'failed';
  errorMessage?: string | null;
  failureCode?: CallFailureCode | string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  transcript?: CallTranscriptItem[] | null;
  usage?: Record<string, unknown> | null;
  sessionReport?: Record<string, unknown> | null;
  taskResult?: Record<string, unknown> | null;
  taskCompleted?: boolean;
  toolEvents?: ToolEvent[] | null;
};

/**
 * Worker → API POST /api/internal/organization-agents/:id/job-metadata
 * Live inbound pack so voice/model/prompt/tools are not frozen at SIP publish.
 */
export type InboundJobMetadataRequest = {
  organizationId: string;
  organizationAgentId: string;
};

/** Worker → API POST /api/internal/calls/inbound (upsert by room name). */
export type InboundEnsurePayload = {
  roomName: string;
  organizationId?: string;
  organizationAgentId?: string;
  agentKey?: string;
  task?: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  participantIdentity?: string | null;
  livekitSipCallId?: string | null;
  livekitTrunkId?: string | null;
  context?: Record<string, unknown> | null;
};
```

### whatsapp-harness.ts

```ts
/** API dispatches turns on its ticker; workers never read the database. */
export const WHATSAPP_AGENT_TOOL_IDS = [
  'lookupGhlContact',
  'upsertGhlContact',
  'checkGhlFreeSlots',
  'scheduleGhlMeeting',
] as const;
export type WhatsAppAgentToolId = (typeof WHATSAPP_AGENT_TOOL_IDS)[number];
export type WhatsAppConversationScope = 'org' | 'platform';
export type WhatsAppDeliveryKind = 'text' | 'otp_template';
export type WhatsAppTurnStatus =
  'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type WhatsAppSendStatus =
  'pending' | 'sending' | 'accepted' | 'uncertain' | 'failed' | 'cancelled';
export type WhatsAppSessionSnapshot = {
  state: Record<string, unknown>;
  events: Record<string, unknown>[];
};
export type WhatsAppTurnCheckpoint = {
  session: WhatsAppSessionSnapshot;
  reply?: string;
  /** A model request only; the API checks quoted evidence and unresolved writes. */
  decline?: { evidence: string };
};
export type WhatsAppWorkerTurn = {
  id: string;
  conversationId: string;
  generation: number;
  leaseToken: string;
  sender: string;
  body: string;
  prompt: string;
  enabledTools: WhatsAppAgentToolId[];
  session: WhatsAppSessionSnapshot;
  checkpoint: WhatsAppTurnCheckpoint | null;
  /** Null for the environment-configured platform receptionist. */
  task: import('./whatsapp-tasks.js').WhatsAppTaskRuntime | null;
};
export type WhatsAppTurnLease = { leaseToken: string };
export type WhatsAppTurnComplete = WhatsAppTurnLease & WhatsAppTurnCheckpoint;
export type WhatsAppToolRequest = WhatsAppTurnLease & {
  toolId: WhatsAppAgentToolId;
  args: Record<string, string>;
};
export const WHATSAPP_AGENT_MODEL = 'openai/gpt-5.6-luna';
```

### whatsapp-tasks.ts

```ts
/** Versioned WhatsApp workflows; independent of the LiveKit voice task registry. */
export const WHATSAPP_TASK_KEYS = [
  'receptionist',
  'appointment_booking',
] as const;
export type WhatsAppTaskKey = (typeof WHATSAPP_TASK_KEYS)[number];
export const WHATSAPP_TASKS = {
  receptionist: {
    name: 'Receptionist',
    version: 1,
    objective:
      'Understand the customer requirement and arrange a suitable team appointment. Ask short relevant questions, one at a time. Your main objective is to create the agreed GHL booking.',
  },
  appointment_booking: {
    name: 'Appointment booking',
    version: 1,
    objective:
      'Arrange one appointment for this customer. Find or create their contact, check open slots, ask which slot they want, and create the agreed GHL booking.',
  },
} as const;
export const WHATSAPP_TASK_COMPLETION =
  'Ends when a GHL appointment is created.';
export function isWhatsAppTaskKey(value: unknown): value is WhatsAppTaskKey {
  return WHATSAPP_TASK_KEYS.some((key) => key === value);
}
export type WhatsAppTaskConfiguration = {
  key: WhatsAppTaskKey;
  version: number;
  objective: string;
  completionRule: 'ghl_appointment_created';
  persona: string;
  toolProfileId: string;
  voiceAgentId: string;
  calendarIntegrationId: string;
  locationId: string;
  calendarId: string;
  enabledTools: import('./whatsapp-harness.js').WhatsAppAgentToolId[];
};
export type WhatsAppTaskRuntime = {
  sessionId: string;
  key: WhatsAppTaskKey;
  version: number;
  objective: string;
  completionRule: 'ghl_appointment_created';
  status: 'active' | 'completed' | 'cancelled';
  result: Record<string, unknown> | null;
};
```

## Configurable voice-task contracts

voice-tasks.ts exports VoiceTaskDefinition, VoiceTaskSnapshot (schemaVersion:1; published version>=1 or version:0 with draftRevision), VoiceTaskRecord, immutable VoiceTaskVersion history, create/update/test requests, validation and prompt compilation. voice-task-starters.ts exports the seven declarative platform starter definitions while KNOWN_TASK_KEYS continues to identify the seven legacy code factories.

Definitions contain objective, directions, ordered phases, typed input/result fields, outcomes with required result references, selected KnownToolIds and VOICE_TASK_CHECKS. Supported checks are usable_answer, personal_loan_interest, property_interest, visit_attendance, loan_collection and booking_receipt. Validators reject executable extensions, unknown field/tool/check references, duplicate/reserved keys, invalid enum/default values and incompatible workflow checks. Tools remain deployed code; configuration cannot upload tool schemas, expressions or credentials.

AgentJobMetadata.voiceTask carries the exact snapshot. Agent HTTP responses/assignment/PATCH expose defaultVoiceTaskId for both directions; call/test/batch and endpoint configuration expose voiceTaskId. CallRecord.voiceTaskSnapshot keeps historical definitions. InboundEnsurePayload.voiceTask carries only {taskId,version} so API persists the exact version selected during live refresh. Selectors voiceTaskId and legacy task are mutually exclusive. Legacy outbound defaultTaskKey remains null; configured outbound defaults use defaultVoiceTaskId.

## Configurable WhatsApp contracts

configurable-whatsapp-tasks.ts exports WhatsAppTaskDefinition/Snapshot/Record/Version, WhatsAppTaskCompletion, sandbox request/record types, browser-safe definition/context/completion validation, instruction compilation and two published platform starter definitions. Definitions reuse typed field helpers but remain distinct from voice definitions: no directions, speech controls or LiveKit imports.

WhatsApp checks are usable_customer_message, booking_receipt and explicit_refusal. Outcomes specify required results and terminalStatus completed/cancelled; cancelled outcomes require refusal evidence. GHL capabilities remain the original four. No executable extensions or uploaded schemas are accepted.

The legacy configuration/runtime examples above are version-1 subsets. Current WhatsAppTaskConfiguration and WhatsAppTaskRuntime also support key configured, completionRule configured, optional snapshot and context. WhatsAppWorkerTurn adds optional taskProtocolVersion:2 and sandbox:true. WhatsAppTurnCheckpoint adds completion:{outcome,fields,evidence?}. Published configured snapshots use versions >=1; sandbox snapshots use version:0 with draftRevision. WhatsApp Agent GET/PATCH adds whatsappTaskId and taskContext. http/whatsapp-conversations.ts provides typed summaries, session results and message-history projections for the portal.

## Prepared-sentence policy

resolveTtsPreparedSpeechEnabled uses the same nullable inheritance/default-off/native-realtime rules as resolveTtsCacheEnabled, independently. HTTP agents expose raw ttsPreparedSpeechEnabled:boolean|null, ttsPreparedSpeechDefaultEnabled and effectiveTtsPreparedSpeechEnabled; PATCH accepts optional boolean/null. AgentJobMetadata carries optional resolved ttsPreparedSpeechEnabled; missing/malformed worker metadata stays off. Shared TtsCacheLookupRequest adds optional purpose:'automatic'|'prepared'; omission preserves automatic policy for legacy clients, and publication inherits that field. PCM envelope, namespace, digest identity and storage limits are unchanged.

## Task saved speech contracts

VoiceTaskDefinition.savedSpeech is an optional additive configuration owned by saved-speech.ts, with at most 20 sentences {key,text,whenToUse,prepare}, opening/closing {mode:agent|silent} or {mode:sentence,key}, and optional phase sentenceKeys. Browser-safe validation rejects reserved/duplicate keys, unknown fields, blank/oversized text, placeholders, malformed flags and dangling references. Keys follow the existing task identifier pattern. Snapshot schemaVersion remains 1; absent savedSpeech is fully supported. New configuration must reach a compatible worker before APIs publish it because old workers reject unknown task properties. compileVoiceTaskInstructions accepts a nativeSpeech option to omit pipeline tool guidance. The real_estate_receptionist starter is an opt-in eighth configurable example, not a new legacy task key.
