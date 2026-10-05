# WhatsApp model-worker instructions

Scope: `apps/whatsapp-worker`. Inherit the [root instructions](../../AGENTS.md). This private HTTP worker runs ADK/OpenRouter turns; API owns Postgres, queue/leases, task sessions, trusted tools, Meta sends, and all org credentials.

## Architecture and interfaces

- `src/main.ts` handles dispatch/health/capacity/shutdown; `runner.ts` runs ADK; `session-store.ts` checkpoints through API; `api-client.ts` authenticates callbacks; `tools.ts` proxies supported tools; `clock.ts` supplies runtime time.
- `API_BASE_URL` is an origin without `/api`; `WORKER_CALLBACK_SECRET` and `OPENROUTER_API_KEY` are required. Never introduce a worker DB, Meta client, GHL credential store, or durable local session directory.
- Canonical [WhatsAppWorkerTurn](../../packages/contracts/src/whatsapp-harness.ts) includes id, conversationId, generation, UUID leaseToken, sender/body, persona prompt, enabledTools, session snapshot, checkpoint, and task runtime (required field, null for platform).
- `POST /turns` requires `X-Worker-Secret` and schema validation. Accepted work returns HTTP 202 `{ accepted: true }` before execution; it is not a reply/delivery response. Invalid input → 400, bad secret → 401, duplicate active/full/stopping worker → 429. Completion happens through callbacks.
- `GET /health` returns ready, active, capacity, and `taskProtocolVersion: 1`; stopping returns 503. Private listener is dual-stack, default port 8082. Health/protocol support gates task-aware API dispatch.
- Worker-to-API operations are `/api/internal/whatsapp/turns/:id/{heartbeat,checkpoint,complete,fail,tools}` and require current lease. Preserve heartbeat/deadline aborts, bounded capacity, generation fencing, and shutdown behavior.
- Model/catalog id comes from contracts (`WHATSAPP_AGENT_MODEL`). A fresh sender-local clock is attached for each model request; UTC is fallback. Do not persist a stale prompt clock or serialize reasoning parts into history/replies.

## Tasks, tools, and response recovery

- Org tasks are `receptionist`/`appointment_booking` from versioned WhatsApp contracts, separate from LiveKit task keys. API supplies immutable secret-free configuration/runtime snapshots; worker uses received persona/objective/session.
- Only the four GHL capabilities are proxied: lookupGhlContact, upsertGhlContact, checkGhlFreeSlots, scheduleGhlMeeting. API rechecks org, allowlist/profile, active linked voice-agent GHL source, sender/contact identity, and checked slots. A worker tool result cannot bypass that authorization.
- Successful booking requires an API-persisted appointment receipt/id. Generated text or worker task status cannot complete a booking. API validates quoted evidence for declineBooking; unknown writes block unsafe refusal closure/repetition.
- `/new` is an API-owned exact case-insensitive reset. It fences the old generation and sends one canned reply without the model; worker must not revive or commit stale work.
- Resume from API checkpoints/initial snapshots; persisted final checkpoints/receipts recover final confirmation without rebooking. Do not treat retry as mid-token model resumption.
- Org task history belongs to task sessions. Closed sessions are never reused; only the completing turn may finish its final reply. Outbox send retries remain independent and do not rerun tools/model.
- Platform env receptionist has null task/no tools. OTP is API priority-template delivery and never enters this runtime/history. Meta acceptance is not delivery/read; unknown external-write outcomes are never automatically repeated.
- Ephemeral active maps and ADK objects are fine; durable state is checkpointed via API. Never log message bodies, recipient numbers, leases, provider keys, or org credentials.

## Naming, changes, and verification

- Match existing kebab-case filenames, PascalCase classes/types, camelCase functions/tool ids, snake_case task keys, and `.js` relative ESM imports. Wire names come from contracts, not locally invented shapes.
- Contract changes update API runtime/dispatch/callback validation and worker schemas together. Preserve task protocol compatibility and worker-before-API rollout; do not mix incompatible worker replicas behind one URL.
- From repo root: `npm run build:whatsapp-worker`, `npm run test:whatsapp-worker` (Node test runner over `test/*.test.mjs`). Dev/prod scripts: `npm run start:whatsapp-worker:dev` / `npm run start:whatsapp-worker:prod`.
- Changes to session/tool recovery also require focused API harness tests; real PostgreSQL tests use only the isolated fixture described in [API testing](../api/docs/testing.md).
- Read [README](README.md) for defaults/inspection/recovery and [TASK-SESSIONS](TASK-SESSIONS.md) for receipt, refusal, reset, final-response, and rollout contracts. Read [Railway instructions](../../railway/AGENTS.md) before deployment; WhatsApp worker is a separate private service from voice.

## Execution, persistence, recovery, and environment details

The Nest API owns a one-second `WhatsAppTickerService`, using the same
`@Interval`/transactional claim/dispatch pattern as the outbound call dialer.
There is no broker, Redis, or worker-side database access. Pending turns are
durable PostgreSQL records that the API ticker dispatches over authenticated HTTP.

## Run locally

1. Build with `npm run build:whatsapp-worker`.
2. Start the worker with `npm run start:whatsapp-worker:dev` or
   `npm run start:whatsapp-worker:prod`.
3. Set these worker variables: `API_BASE_URL` (origin, without `/api`),
   `WORKER_CALLBACK_SECRET`, `OPENROUTER_API_KEY`, and `PORT=8082` locally.
4. On the API set `WHATSAPP_WORKER_URL=http://127.0.0.1:8082` and the same
   callback secret. Both settings are required at API startup.
   `WHATSAPP_TICKER_MAX_CONCURRENT` defaults to 4 across API replicas.
   Match it to `WHATSAPP_WORKER_CONCURRENCY` (default 4).
5. Configure the active org Meta connection, webhook subscription, nonempty
   Agent persona, selected task, existing voice-agent GHL source, and profile
   with assigned booking/free-slot/contact tools. Org Meta/GHL secrets remain on the API.

The durable harness is the sole execution path for org replies, platform replies,
and get-demo OTP delivery. There are no rollout switches or API-side model runners.
An unavailable worker leaves text turns pending/retryable. Platform Meta and OTP
settings are optional: an unconfigured platform number receives no replies, and
OTP APIs return 503 until all their settings are present. OTP sending runs
independently of model-worker health.

## Persistence and execution

Org channels now require a task selected in the portal Agent tab. Receptionist
and Appointment booking both end only after a persisted GHL appointment receipt.
The API creates an independent task session per customer, snapshots configuration,
and starts fresh memory on the next message after booking or explicit refusal.
See [TASK-SESSIONS.md](TASK-SESSIONS.md) for lifecycle, compatibility and rollout.
The legacy conversation session/tool state described below remains the platform
path; org execution uses `whatsapp_task_sessions` instead.

- Webhooks save their raw event, then persist eligible org/platform text turns **before**
  returning 200. Database ingestion errors return an error so Meta can retry.
- `whatsapp_conversations` stores session state/history, trusted booking state,
  and a generation number. `whatsapp_agent_turns` stores ordered inputs, leases,
  attempts, initial session snapshots, and execution checkpoints.
- The ticker atomically claims one turn per conversation, capped globally,
  then POSTs `/turns` to the worker. It also drives the outbox sender.
- Worker callbacks and API-to-worker dispatch require `X-Worker-Secret`.
  A UUID lease fences every heartbeat, checkpoint, completion, and tool call.
- The worker runs Google ADK/OpenRouter GPT-5.6 Luna. ADK events/state are
  checkpointed via the API. Reasoning parts are excluded from durable history.
- Conversation state advances with a successful turn. Completion atomically
  creates one `whatsapp_message_outbox` row. The next turn waits until the send
  is accepted or cancelled, so replies remain ordered.
- A restart reloads the last committed conversation. A partial attempt reruns
  from its initial snapshot. A final saved checkpoint is completed without
  another model request. This is turn recovery, not mid-token model resumption.
- The four existing GHL tools call back to the API. The API rechecks the live
  allowlist, profile, org, connection, and linked voice-agent credentials.
  Sender/contact identity and checked slots are maintained on the API.
- `whatsapp_tool_operations` persists an operation reservation before external
  work. Successful repeated bookings reuse their receipt. A write whose result
  is unknown is not repeated automatically. No exactly-once external-write
  guarantee is implied.
- `/new` resets durable memory, increments the generation, cancels old pending
  work/sends, and creates one canned reply. Already submitted external actions
  cannot be undone; stale workers cannot commit new replies.

Defaults: 45-second renewable lease, 180-second API execution ceiling,
90-second worker deadline, 12 model calls per turn, three generation attempts.
Outbox work is bounded to four concurrent sends per API tick so slow Meta
responses do not starve worker lease recovery.
An exhausted turn blocks later turns until explicitly retried or `/new`.
Meta acceptance means a successful send API response, **not delivery/read**.
Delivery receipt tracking and detailed multi-message job contracts are later phases.
Full history remains in JSONB; long-term retention/compaction is not implemented.
The internal API validates at most 2,000 ADK events and accepts a 3 MB body.

## Inspect and recover (org JWT)

- `GET /api/users/whatsapp/harness/health`
- `GET /api/users/whatsapp/conversations`
- `GET /api/users/whatsapp/conversations/:id` — latest 100 turns and send states
- `POST /api/users/whatsapp/turns/:id/retry` — failed generation only
- `POST /api/users/whatsapp/messages/:id/retry` — definitely failed send only
- `POST /api/users/whatsapp/messages/:id/resolve` with
  `{ "outcome": "accepted" | "failed" }` — operator-confirmed uncertain outcome

A Meta timeout/5xx or crashed sender is `uncertain`; automatic sending stops
for that conversation. Check Meta, explicitly resolve the outcome, then retry
only if it failed. Retrying a send does not rerun the model or booking tools.
Concurrent requests are tenant-scoped and reset generations cannot be retried.

## Platform receptionist and OTP delivery

Configured `WHATSAPP_URL` and `WHATSAPP_API_KEY` admit durable platform
conversations on that number. Active org connections take
precedence even with an empty prompt. Platform conversations have no org/connection
FK; their own phone/sender unique index isolates them from tenant history. The
worker receives the existing Warewe prompt with no tools; all Meta credentials
remain API-only. `/new`, deduplication, leases, checkpoints and ordered replies
work just as for org conversations. Old in-memory platform sessions are not imported.

OTP delivery always uses deterministic templates through the same durable outbox.
It requires platform Meta credentials, `OTP_HASH_SECRET`, and
`OTP_DELIVERY_ENCRYPTION_KEY`, a dedicated random 32-byte key encoded as 64 hex
characters, stored only on the API. Missing configuration returns 503 without
issuing a challenge; the API can still start. A supplied malformed key fails
startup validation.
Codes remain HMAC-only in challenges; delivery ciphertext uses AES-256-GCM bound to
challenge ID and expiry and is erased on terminal outcome or expiry. Do not rotate
the key while pending OTP deliveries exist. The template name, English language,
body/button parameters and Graph version from `WHATSAPP_URL` are preserved.

Issuance, sending, verification and proof consumption share a PostgreSQL per-phone
fence. Resends invalidate previous codes and cancel pending deliveries atomically.
OTP deliveries have priority. The sender has its own one-second interval and
overlap guard, independent of worker dispatch, so worker outages do not stop OTP.
Only definite 429 rejection retries (three attempts, 1s/2s backoff); ambiguous
network/timeout/5xx/crashed sends are never automatically repeated and burn the code.
`POST /api/otp/send` retains HTTP 200 + `{ challengeId }` after Meta acceptance.
It waits up to 30s, then reconciles under the send lock; an already-started Meta
request may add up to its 15s timeout. Verification/proof TTLs and rate limits
are unchanged. OTP is never placed in a worker dispatch or conversation history.

Admin-only inspection/recovery mirrors org routes under `/api/admin/whatsapp`:
`harness/health`, `conversations`, `conversations/:id`, `turns/:id/retry`,
`messages/:id/retry`, `messages/:id/resolve`. `GET otp-deliveries` exposes only
delivery status metadata (no phone, code, ciphertext or credentials). There is no
manual OTP retry: request a fresh challenge. Admin conversation routes are
platform-only; org routes cannot inspect/recover platform or OTP records.

Health responses preserve `enabled`, `platformEnabled`, and `otpEnabled`:
`enabled` is always true; the other two report configuration readiness, not
remote worker or Meta availability. Dispatch/sender timestamps and errors report
execution health.

Historical switch-based predecessor only: before upgrading from a release with legacy execution, configure and verify the
worker, URL, callback secret, and optional OTP settings. Preserve any existing
OTP encryption key. Enable all three harness rollout switches on the preceding
release and let already-running legacy requests finish before deploying this
release. Verify that no old API replicas remain. A rollback to that preceding
release must keep all its harness switches enabled, so legacy execution cannot
overlap durable work. This is not current setup: current code has no switches.
Task-session rollback also requires the compatible API/worker pairing in
[TASK-SESSIONS.md](TASK-SESSIONS.md). Use the inspection/retry/resolve endpoints for recovery.
This cleanup changes no schema. Previously deferred Erflow synchronization remains
outstanding.

## Railway deployment

Create a separate Railway service using `Dockerfile.whatsapp-worker` and
`railway/whatsapp-worker.toml`. Worker readiness is `GET /health`.
For CLI-created services, set `RAILWAY_DOCKERFILE_PATH=Dockerfile.whatsapp-worker`
and `PORT=8082`; the Dockerfile supplies the start command. Reference API secrets
with Railway `${{api.WORKER_CALLBACK_SECRET}}` / `${{api.OPENROUTER_API_KEY}}`
variables instead of copying literal values. The worker listens dual-stack for
private networking. If the API only binds IPv4, use its public HTTPS origin for
worker callbacks; this does not expose the private worker.
Set `WHATSAPP_WORKER_URL` to its private HTTP origin, set the API origin on the
worker, and share the callback secret. Verify worker readiness before deploying
the API, then smoke-test ingestion and delivery. No marketing/portal build is needed.
This change does not deploy or alter any production database itself.

TypeORM currently synchronizes harness entities when the API starts. This cleanup
does not change them. The previously deferred Erflow update remains outstanding.

## Verification

`npm run test:whatsapp-worker` builds the ESM worker and runs real ADK with
a deterministic local model (no OpenRouter/Meta/GHL traffic).

API unit/regression tests:

```powershell
node node_modules/jest/bin/jest.js --testPathPatterns='whatsapp-harness/test|whatsapp/test|whatsapp-agent/test|otp/test|meta-whatsapp/test|organization-integrations/test' --no-coverage --runInBand
```

The PostgreSQL suite is opt-in with `WHATSAPP_TEST_DATABASE_URL` and refuses
anything except the isolated local `whatsapp_harness_test` database on
`127.0.0.1:55439`. It creates/uses the `harness_test` schema and exercises real
row locks, transaction boundaries, duplicate ingestion and restart recovery.

## Task-session lifecycle and rollout details

The org Agent tab assigns `receptionist` or `appointment_booking` to the connected
number. Persona is separate from the versioned task objective. Both tasks require
an active GHL calendar source and assigned `scheduleGhlMeeting`,
`checkGhlFreeSlots`, and at least one contact tool. A nonempty persona without a
task no longer enables org auto-replies. Raw webhook storage continues.

## Lifecycle and recovery

Conversations identify the channel/customer; task sessions own reusable ADK
history and trusted tool state. The first claimed org turn creates or resumes
one active task session. Snapshot task version, persona, effective tool IDs,
profile ID, voice-agent ID, calendar integration ID, location and calendar IDs.
Never snapshot credential values. Later configuration edits affect new sessions.
Current allowlists and source ownership/active state remain authoritative; a
changed calendar source is rejected rather than silently switching credentials.

The API commits `scheduleGhlMeeting` success with a nonempty appointment ID and
task closure together. Tool errors, unknown write outcomes, and generated text
never complete the task. Closed tasks reject new operations; duplicate receipt
reads are harmless. Only the completing turn may finish the final confirmation.
Worker recovery uses the persisted receipt without rerunning a model or booking.
The final booking confirmation includes “Thank you! Your booking is complete.
This session has ended.” Explicit declines include “Thank you! This session has
ended.” after the refusal acknowledgement. Each closing is part of the same
checkpointed reply sent through the durable outbox; retries preserve recorded
final replies. Ordinary replies and booking errors do not add this closing.
New queued messages wait for that reply's outbox acceptance/cancellation, then
create a new session with no old ADK or booking state. Failed/uncertain sends
retain the existing operator recovery endpoints, even after task closure.

`declineBooking` is a model-requested cancellation with quoted current-message
evidence. The API checks explicit refusal and refuses closure while a booking
write has an unknown outcome. Decline is cancelled/declined, never booked success.
Short refusals require the preceding assistant booking invitation. `/new`
cancels the active task and retains existing generation/lease fencing. Late
external results remain audit receipts but cannot revive a reset task.

Closed records are retained for audit. There is no automatic inactivity expiry.
Org conversation detail includes `taskSessions`; lease tokens remain redacted.
Platform env replies, OTP priority outbox and portal template sends do not use
org task sessions and keep their existing execution paths.

## Coordinated rollout

1. Pause ingress/dispatch and drain running voice-independent WhatsApp turns
   before changing API/worker versions. Do not replace APIs with executing legacy
   org turns. Preserve pending/failed/uncertain outbox records and OTP keys.
2. Deploy all new WhatsApp workers. Health exposes `taskProtocolVersion: 1`;
   the new worker requires a `task` field (null for platform), and validates task
   keys, version and completion rule. The API checks protocol support before
   dispatching task jobs. Do not mix old/new worker replicas behind one URL.
3. Deploy the API, then portal. TypeORM synchronization adds the session table,
   nullable links, protocol column, task key and indexes; no tables/history are
   dropped. The ticker retires historical null-protocol org pending/failed turns
   as `legacy_task_retired`, preserving their outbox sends. It never imports old
   conversation memory into new tasks. Org channels pause until task selection.
4. Select the task and required booking source/profile for each org connection,
   including the receptionist org. Smoke-test a successful agreed booking, final
   confirmation, a fresh next session, refusal, and `/new`. Monitor health,
   protocol rejection, turn failures and uncertain sends through existing routes.

Rollback must keep task-aware API and worker contracts paired. An older worker
cannot process these jobs, and an older API does not enforce task session closure.
Do not automatically replay archived/retired work.

Erflow synchronization for these changes was explicitly deferred by the user;
the entity schema still needs to be mirrored into the canonical model.

## Verification

Run contracts/API/worker builds, `npm run test:whatsapp-worker`, and portal
typecheck/build. The API harness suite includes task closure, crash recovery,
decline evidence, queued session isolation, snapshot immutability, reset fencing,
legacy retirement and final-send recovery. Its PostgreSQL tests require the
isolated `whatsapp_harness_test` database at `127.0.0.1:55439`; never point them
at another database. No test calls real Meta, OpenRouter or GHL services.

## Turn and task wire structure

These are source snapshots from contracts; update the source first and keep API DTOs/worker validation compatible. No real payload values belong here.

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

## Dispatch validation and response limits

Dispatch validates UUID id/conversationId/leaseToken, positive integer generation, digit-only sender length 6–20, body length 1–4096, and persona length 1–20000. enabledTools can contain only the four shared GHL ids. Session state/events are JSON object structures; checkpoint is nullable with optional reply up to 4096 and decline evidence 1–4096.

The task field is required: null for platform or a task object with UUID sessionId, known key, literal version 1, objective 1–20000, ghl_appointment_created completionRule, active/completed/cancelled status, and nullable result. Do not silently accept old missing-task jobs.

The HTTP body limit is 3,000,000 bytes. Health response contains ready, active, capacity, taskProtocolVersion. Accepted dispatch responds `202 { "accepted": true }` immediately; resulting text is sent only through API completion/outbox, never the dispatch HTTP response.

Heartbeat runs every 10 seconds without overlap. A failed heartbeat aborts execution. Worker turn timeout defaults 90000ms and is clamped 30000–150000ms; capacity defaults 4 and clamps 1–100 via WHATSAPP_WORKER_CONCURRENCY. API global ticker capacity defaults 4; coordinate the values. Shutdown stops acceptance, aborts work as implemented, and exposes unready health.

On error the worker posts a bounded failure code (turn_aborted or model_error) and logs turn id only. Preserve cancellation/deadline/final-checkpoint behavior. Do not add reasoning, message bodies, phone numbers, leases, provider keys, or raw upstream errors to logs.
