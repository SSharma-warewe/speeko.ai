# API instructions

Scope: `apps/api`. Inherit the [root instructions](../../AGENTS.md). Nest API owns public/product HTTP, Postgres, tenant authorization, dialing/queues, credentials, and durable WhatsApp execution. Workers own model/voice execution and their private dispatch/health surfaces.

## Structure and naming

- Layer domain code as controller → service → custom repository → entity. Controllers own routes/guards/Swagger; services own business rules/mapping; repositories own TypeORM access; entities own schema mappings.
- Put `@InjectRepository` only in the matching `*.repository.ts`, register custom repositories in module providers, and inject them into services. Queue/harness atomic SQL transactions may use `DataSource` in their established ownership layer.
- Feature directories/files use kebab-case; class names PascalCase and suffixes such as `Controller`, `Service`, `Repository`, `Dto`. Persisted columns use existing snake_case mappings; JSON/TypeScript fields use camelCase. URL segments are lowercase kebab-case.
- Shared tool ids remain camelCase (`scheduleGhlMeeting`), tasks snake_case (`demo_booking`), model ids catalog strings. Use shared contracts rather than local spellings.
- Slugs/keys use [common/slug.ts](src/common/slug.ts); org-agent fallback uses [agents/slug.util.ts](src/agents/slug.util.ts). Shared voice PATCH decorators live in `agents/dto/voice-settings.dto.ts`.
- Member HTTP stays in `users`; org-agent routes stay in `agents/user-organization-agents.controller.ts`. Keep `LivekitService`, `EmailService`, `GhlService`, and `MetaWhatsAppClient` as infrastructure boundaries.

## HTTP and authorization

- Voice task draft/publish validation accepts opt-in `savedSpeech.toolWaiting` using the shared contract validator. Waiting messages and their tool-only sentences stay inside existing task/version JSONB snapshots, including draft tests and clones; no new endpoint/column is needed. Published calls keep the exact selected text/delay. Unknown/unselected tool ids, unsupported end/transfer waiting speech, malformed delays and conversational references to tool-only sentences are rejected.

- Global prefix is `/api`; Swagger is `/docs` and `/docs-json`. Validate bodies with class-validator DTOs, document success/errors, and reuse contracts catalogs. CRM action params use strict per-action Zod schemas after DTO validation.
- Admin/user are separate principals (`JWT.typ=admin|user`). Protected controllers use `JwtAuthGuard` plus the appropriate `AdminGuard`/`UserGuard`. Org routes derive tenant id through [orgIdFrom](src/auth/org-id.ts); never accept a client org id as authority.
- JWT strategy reloads principal and org from DB on every authenticated request. Missing/inactive principals or inactive orgs are rejected; live profile fields replace stale claims. Member roles are stored but not enforced as additional permission tiers.
- Login requires org slug/id for users, bcrypt passwords, separate admin login, and Bearer access JWT only. Password invites/resets store SHA-256 token hashes, revoke siblings on reissue/use, and never expose password hashes. Boot seeds an absent admin without overwriting an existing password.
- `PasswordLifecycleService` owns complete issuance, token replacement, and authenticated password-change operations. `PasswordLifecycleRepository` owns their database transactions: lock the existing user/admin row with `FOR UPDATE` before token writes, reload activity/email/tenant state, replace the password and consume/invalidate tokens together. All replicas use this serialization point; do not restore a caller-managed validate → password write → token consumption sequence. Bcrypt runs outside the transaction; authenticated changes recheck the verified original hash under the lock. Invitations require no existing password; resets require an existing password. Send emails only after commit; delivery failure does not undo the password change, and forgot-password remains nondisclosing if eligibility changes while waiting for the lock.
- User/admin profile-name writes update only the `name` column. Never save a previously loaded principal's password hash during unrelated profile edits; that can overwrite a committed concurrent reset. The former public `updatePasswordHash` helpers are removed; existing-principal password replacement belongs exclusively to the lifecycle transaction.
- Login, password, OTP, and demo guards retain origin/IP/rate-limit behavior. Fixed-window login/demo counters are per API process, not replica-wide; proxy/IP and CORS normalization use shared common helpers.
- Public integration enqueue uses hashed `ca_live_…` endpoint keys via Bearer or `X-Api-Key`, not JWT. Return full keys only on create/rotate. Endpoint configuration fixes agent/task/trunk/queue; request carries phone/context/external id only.
- Internal voice and WhatsApp callbacks use `WorkerSecretGuard`/`X-Worker-Secret`; WhatsApp also checks current UUID turn lease/generation. Public Meta verification/ingest and OTP/demo must not acquire JWT guards.
- Errors go through `HttpExceptionFilter`: `{ statusCode, error, code, message }`. Use contracts `ErrorCode`, Swagger error decorators, and `ParseResourceIdPipe(resource)` (invalid path UUID → 404; invalid request body → 400).
- Action POSTs use `@HttpCode(200)`/`@ApiOkResponse`; actual creates use 201/`@ApiCreatedResponse`. Throw Nest exceptions; do not invent ad hoc HTTP shapes.

## Calls, capabilities, and integrations

- Calls own agent resolution and lifecycle; API alone creates SIP participants and admits outbound queues. Keep calls split into root Nest surface, `services/` orchestration, and `lib/` pure helpers. `QueueAdmissionService` exposes complete `admitPending(organizationId)` and `beginDial(admissionId)` operations; its repository owns transactions. Never calculate capacity outside admission or restore claim-with-limit/recount/release choreography. Admission locks current org settings, enforces organization/batch ceilings and rolling rate usage, and reserves eligible calls with `FOR UPDATE SKIP LOCKED`. Inbound SIP and web tests never consume queue limits.
- All call status writes use `applyCallEvent`/`initializeCallStatus`. Agent completion requires `taskCompleted: true`; answered agent sessions without task completion are incomplete and are not dialer retries. Answered human sessions finish through HUMAN_ENDED with task status not_applicable. Unanswered SIP is failed/no_answer. Late complete cannot overwrite requeued pending/creating rows.
- Inbound calls are upserted by room, max attempts one, never requeued as outbound. Publish metadata is a pointer/snapshot without a per-ring call id; worker fetches live org-agent metadata for each ring before runtime construction.
- Reuse `requireActiveOrgAgent`, `packOrgAgentJobMetadata`, `resolveEnabledToolIds`, `resolveVoiceRuntime`, and `toCallResponse`; do not copy config assembly across dispatch paths.
- Persona is separate from workflow and capabilities. Inbound org agents require `defaultTaskKey`; outbound configs store null and use call/endpoint task → template → general. Many named org agents may share one template; template PATCH does not retro-update their personas.
- Tool profiles store ids, never schemas/code. Org metadata is profile ∩ allowlist; null allowlist preserves legacy full access, new orgs get `["endCall"]`, explicit sets always keep endCall. Org custom profiles cannot exceed assigned tools.
- Calendar providers are `nylas`/`ghl`. Resolve active same-org links at execution; no platform GHL-env fallback. All GHL HTTP uses `GhlService`, Meta uses `MetaWhatsAppClient`, LiveKit SDK uses `LivekitService`, mail uses global `EmailService`.
- Both call-calendar paths use the leaf `CallCapabilitiesModule` before every operation. Its repository reads the current call, org, org agent, active template, profile/tools, and linked integration in one joined query. Require active same-org resources, a platform/same-org profile, exact tool membership intersected with the pure org allowlist normalization, and provider credentials. Null allowlists retain legacy full access; missing/empty profiles grant no calendar tools. Inbound SIP uses the org agent's profile without a template fallback; outbound and org web tests fall back to the template default profile. Configured calls must also permit the tool in their persisted task snapshot; never resolve a newer definition or require the pinned task to remain active.
- Calendar authorization uses the **current linked calendar on each request**, including changes after call creation. Each method supplies fixed contract ids: GHL free slots/contact lookup/contact upsert/appointment creation use `checkGhlFreeSlots`/`lookupGhlContact`/`upsertGhlContact`/`scheduleGhlMeeting`; Nylas free/busy/event listing/event creation/event cancellation use `checkCalendarAvailability`/`listCalendarEvents`/`createCalendarEvent`/`cancelCalendarEvent`. Legacy `booking`/`cancelBooking` do not grant these operations. Worker secret, DTO validation, and HTTP 200 `{ ok: false, error, message }` denials remain; `organization_inactive`, `agent_inactive`, and `tool_not_allowed` are API-local denials. Denial performs no provider I/O or context writes. Do not cache authorization, hold a transaction/lock over provider HTTP, or automatically retry uncertain writes. Revocation cannot undo an already-submitted provider request.
- GHL free slots expose open times only; booking needs a real contact id from lookup/upsert/context and does not create contacts. Persist looked-up/upserted ids in call context. Preserve timezone normalization and missing-contact versus unavailable-slot errors.
- CRM uses active `ghl_crm` connections, strict `CRM_ACTIONS`, location/membership authorization, redacted errors, and no automatic write retry. It is live upstream data, not a mirror or agent-calendar provider. Read [CRM README](src/crm/README.md).
- PriceService owns cost calculations/snapshots and attempts; markup stays zero. Sarvam rates use the dated price catalog/conversion; BYO OpenAI/xAI charges are not in LiveKit snapshots. Org summaries are JWT-scoped; recompute stays admin-only.
- Never return SIP passwords, integration secrets/hashes, Meta tokens, OTP codes/ciphertext, or worker leases. Full endpoint keys and webhook verify tokens are returned only by documented create/rotate actions; OTP verification proof only by verify. Stored secret prefixes are safe display fields.

## Shared TTS cache

Production release verified 2026-10-08 from `857c86c`: API deployment `968a71c2-c96b-460b-a650-18821fb92e60` is SUCCESS/RUNNING after compatible worker deployment and eight reviewed additive schema statements. Schema fingerprints preserve all unrelated objects; all 2 templates/10 org agents remain with nullable default-null cache preferences. Shared flags are off, allowlist empty, startup synchronization false. Routes/401/no-store, Swagger fields and minute cleanup with zero unavailability passed. Release verification: 725 tests/59 suites including 14 real PostgreSQL cases; builds/typechecks passed. Erflow is explicitly deferred for this release; live provider/usage/latency acceptance remains with the user. See [complete rollout record](../../railway/AGENTS.md#shared-tts-cache-rollout).

- `tts-cache` owns worker-only `POST /api/internal/calls/:callId/tts-cache/lookup` and `/publish`. Use `WorkerSecretGuard`; derive tenant from the live call, validate actual room, `execution_type=agent`, status creating/dialing/ready, active org and same-org agent/template. Requests never supply an authoritative organization id. Tenantless platform tests are local-only. All route responses, including auth/validation errors, use `Cache-Control: no-store`.
- `TTS_SHARED_CACHE_ENABLED=false` defaults off in API and voice worker. API-only `TTS_SHARED_CACHE_ORGANIZATION_IDS` is a comma-separated UUID allowlist, default empty. Shared access additionally requires the corresponding live persisted policy (automatic by default, or prepared for purpose prepared) to resolve true and a pipeline model. The existing authorization join reads org/template preferences and model overrides on every request. Opt-out stops new shared lookups/publications; existing job-local audio follows its runtime policy/lifetime.
- `agents.tts_cache_enabled` and `organization_agents.tts_cache_enabled` are nullable booleans, default null. Organization preference resolves to template preference then false; explicit false overrides true. New assignments inherit (null), clones copy raw values, and seeds leave existing preferences intact. Native realtime forces the effective policy off but retains the stored preference. Shared `resolveTtsCacheEnabled` owns the browser-safe resolution rule; `resolveVoiceRuntime` packs the effective boolean in every dispatch/live refresh/test path. Legacy/missing worker metadata stays off.
- Existing template/admin-org/user-org PATCH DTOs accept only boolean/null; omission preserves and null restores inheritance. Responses expose raw `ttsCacheEnabled`, `ttsCacheDefaultEnabled` (template preference for org agents, false for templates), and `effectiveTtsCacheEnabled` (false on native realtime). Other voice fields retain their existing effective response semantics. No public cache-management endpoint or caller-controlled tenant authority is introduced. Preference changes affect new runtimes; live shared authorization can revoke access immediately without interrupting active speech or purging clips.
- `tts_cache_entries` owns opaque tenant/digest identities, PCM `bytea`, versioned safe frame/alignment JSON, checksum, accounted bytes and creation/expiry times. Organization FK cascades. Unique organization/digest and expiry/global/tenant oldest-entry indexes support lookup/eviction. Audio and alignment may contain personal information. Log aggregate counters only, never clips, alignment, text, HTTP bodies or secrets.
- Immutable publication uses one cache-specific transaction advisory lock with try-lock skip. First valid entry wins; hits/duplicates never refresh TTL. Limits: 24-hour reuse expiry, 1 MiB accounted decoded PCM/metadata and 15 seconds/2,048 frames per clip, 64 MiB/1,024 entries per tenant, 1 GiB/16,384 globally. Evict expired batches first then oldest tenant/global entries. Accounted budgets exclude table/index/TOAST/WAL/backups. Cleanup removes up to 500 expired rows each minute even while sharing is disabled. Expired audio is never returned; physical deletion can lag, and WAL/backups keep existing retention.
- Cache repository operations, including authorization, use a separate lazy two-connection pool with immediate saturation bypass, 100 ms connection timeout, 15 ms read/150 ms write statement limits, 10 ms lock timeout, and 20/180 ms operation budgets. SQL logging is disabled. Database failures yield miss/skipped; they must not become voice call errors. Reads acquire no publication lock. Authorization uses one verified scope per operation and does not import calendar credentials or grant tools.
- Contracts define `shared-v1-livekit-1.7.1`, envelope revision 1, PCM s16le with canonical metadata + PCM SHA-256. API and worker validate exact frame lengths, format/revision, checksum, finite safe timings and size before storage/replay. Only complete nonempty worker captures are eligible. Worker lookups share a 25 ms budget with local fill waiting; uploads are asynchronous, bounded, one-second, and never retried. Cache replay emits no fresh provider synthesis metrics; this is not a billing/savings claim.
- Tests: `tts-cache/test` includes HTTP authentication/validation/redaction plus real `tts_cache_test` schema races, immutable winners, tenant isolation, budgets/eviction, expiry, contention, rollback, cleanup, cascade, pool saturation, and actual module registration. Use only the guarded `API_SECURITY_TEST_DATABASE_URL` fixture at api_security_test / 127.0.0.1:55445. Additive canonical delta: [tts-cache-schema.dbml](docs/tts-cache-schema.dbml). Canonical Erflow synchronization remains outstanding and was explicitly deferred for the 2026-10-08 release. Production schema/routes/cleanup are verified; live provider/latency acceptance remains pending the user.
- Verified locally on 2026-10-07: 431 tests across 42 affected suites passed, including the full voice-worker suite and 13 real PostgreSQL cache tests on a fresh disposable PostgreSQL 17 fixture. Contracts typecheck, API build and worker build passed; physical unique/index/check/FK definitions were inspected. Commands: `npx jest --testPathPatterns='worker/src/test|tts-cache/test|common/test/api-security-database|auth/test/worker-secret.guard' --runInBand --no-coverage`, `npm run typecheck:contracts`, `npm run build:api`, `npm run build:worker`. Run the Jest command with the guarded dedicated fixture configured; skipped PostgreSQL tests do not establish storage guarantees.
- Step 3 verification on 2026-10-08: 659 tests in 52 focused suites passed, including all worker suites and 14 real isolated PostgreSQL tests. The added real-HTTP test exercises template/admin-org/user-org PATCH/read persistence, nullable defaults, omission, strict validation, principal/tenant boundaries, realtime retention and live shared opt-out without clip deletion. Contracts/portal typechecks and API/worker/portal builds passed. Synthetic headless Edge checks covered all three editors, save/reload/inheritance, realtime switching, failed saves, keyboard input and 390px screenshots. These do not establish live provider latency or usage. Additive policy delta: [tts-cache-policy-schema.dbml](docs/tts-cache-policy-schema.dbml); canonical Erflow synchronization remains outstanding under the explicit 2026-10-08 release deferral.

## Prepared sentences

### Outbound opening readiness

For outbound SIP AI calls with effective Prepared sentences On and an exact opening, CallDialService dispatches the worker but does not call CreateSIPParticipant until complete worker-local opening audio is ready. API and worker share the pure exact-opening resolver, preserving task sentence/silent priority and existing generated/native/inbound/web/human behavior. Other sentences do not block dialing.

The existing admitted attempt remains dialing/in_progress during preparation and retains organization/batch capacity and attempt/rate accounting. Optional version-1 openingPreparation job metadata contains a fresh attempt UUID and 30-second deadline. LivekitService polls the actual dispatch's AGENT participant attributes every 250 ms using dedicated one-second, no-failover clients; foreign participants, other jobs, malformed reports and old attempt UUIDs cannot authorize SIP. Calls remain API-owned; no process-local callback waiter or schema change is introduced.

Before SIP submission, recheck current call room/dispatch/status, active organization/agent/template and readiness. Failure or timeout deletes the unused room and sets opening_preparation_failed, always terminal even if included in retryOn. Preserve cancellation and later attempts. Readiness reports carry only bounded validated TTS usage; repository updates that usage field fenced to the dialing call/room/dispatch. PriceService retains preparation spend through existing attempt pricing. Report payloads/attempt UUIDs are not logged; diagnostics record call id and preparation-ready/SIP-submit ordering.

Deploy the compatible voice worker before API. Older workers supply no readiness and fail closed. Preserve saved policies, sharing flags/allowlist and DATABASE_SYNCHRONIZE=false; no migration or portal behavior change is required. Verify cold/shared-hit/user-cancelled calls without automatically placing a production call.

- On pipeline agents with effective Prepared sentences On, nonempty `onEnterInstructions` is exact opening text rather than model guidance. Task-defined sentence/silent openings take priority; null/default and empty/silent semantics remain. With preparation Off or native realtime, it remains generation guidance. This changes no columns or wire properties; use the existing nullable preference and worker-resolved boolean.

- Selected-organization sharing verified 2026-10-09: source `e904794`, API deployment `ebc542c5-26ff-4ede-998d-64c3ad503a09`, SUCCESS/Online. API/worker sharing flags are true, API allowlist contains only `27db0119-0c7d-46cc-bba7-0ffce504f57d`, startup synchronization remains false, and fingerprints preserve all organization-agent/template configs. Swagger exact-opening semantics, 401/no-store and authenticated nonexistent-call 404/no-store passed. No new schema or automatic live call was introduced; see the [rollout record](../../railway/AGENTS.md#exact-configured-opening-and-selected-organization-sharing).

- agents and organization_agents add nullable boolean tts_prepared_speech_enabled, default null. Null inherits template then false; explicit false overrides true. Assignments inherit and clones preserve raw preference. resolveTtsPreparedSpeechEnabled follows the same native-realtime exclusion as automatic caching without coupling the settings.
- Existing template/admin-org/user-org PATCH accepts optional boolean/null ttsPreparedSpeechEnabled. Responses expose raw preference, ttsPreparedSpeechDefaultEnabled and effectiveTtsPreparedSpeechEnabled. resolveVoiceRuntime dispatches the resolved boolean through all job packers.
- Shared-cache lookup/publish optionally accepts purpose automatic/prepared (missing = automatic). Each request reads the corresponding live persisted preference independently. Tenant, call/room, active-resource, pipeline-model, global flag and organization allowlist restrictions remain mandatory. The namespace/digest/audio store and existing quotas/24-hour expiry remain shared; enabling preparation never authorizes arbitrary automatic speech access.
- Canonical delta: [DBML](docs/tts-prepared-speech-schema.dbml), [additive SQL](docs/tts-prepared-speech-schema.sql). Apply before API rollout with DATABASE_SYNCHRONIZE=false. Canonical Erflow read/update/refetch is pending because MCP/browser access was unavailable in the implementation session; this is a release prerequisite, not a new deferral. Earlier specifically deferred cache schema remains separately outstanding.
- Worker preparation starts in parallel at session entry, uses two consumers and 10-second/30-second deadlines, and cannot delay pickup. See [worker owner](../worker/AGENTS.md#prepared-sentences). Both preferences remain off by default; no production flags/preferences are changed by implementation.
- Local verification on 2026-10-08 passed affected regression tests and 15 real PostgreSQL cases, including both policies through actual template/admin-org/user-org HTTP save/read, null defaults, strict validation, principal/tenant restrictions and live revocation. A fresh native PostgreSQL 17 fixture used only api_security_test at 127.0.0.1:55445 and was shut down after testing. API/worker/portal builds and contracts/portal typechecks passed. No production schema or preferences were changed.

## Human CRM calling

### Human call workspace

- CRM Call offers trunk selection followed by human-operated `interest`, `bookMeeting`, and `notes` checkboxes. New portal calls explicitly select tools; older requests that omit `selectedTools` have none. Selection is immutable and participates in request replay checks. These IDs are separate from AI worker tools and never dispatch a worker.
- Create/join responses retain optional `meetUrl` and add ephemeral `connection { serverUrl, participantToken }`. Active/history/workspace responses contain no credentials. Existing microphone-ready admission, one-active-call, owner, reconnect and cleanup rules apply.
- `GET/PATCH /users/calls/:id/human/workspace` reads/saves caller-only interest and notes (4,000 characters), including after termination. PATCH requires the current revision; conflicts return 409. Org call history exposes saved results without edit authority. Transactions lock the session and update only its workspace column so supervision cannot be overwritten.
- `POST /users/calls/:id/human/workspace/actions` accepts requestId/revision plus `bookMeeting` with calendar/title/start/end/timezone, or `publishSummary`. Contact/connection authority comes from the persisted session. CRM uses the existing `ghl_crm` connection and scope/membership checks, with no voice-agent calendar. Booking requires future explicit-offset instants and an IANA timezone. Only returned CRM record IDs count as success.
- Actions are journaled before provider I/O. Fingerprints fence altered replays; matching requests return their existing result; unresolved writes block another request ID of the same kind. No transaction stays open over provider HTTP; writes are never automatically retried. Known validation/scope/rate rejections are failed; ambiguous results are uncertain. Pending entries older than one minute display as uncertain. Raw provider errors/bodies and fingerprints never appear in history.
- `POST /users/calls/:id/human/workspace/actions/:requestId/resolve` reconciles without sending again. `found` verifies the CRM receipt against the called contact; `not_found` records the caller's explicit confirmation after inspecting CRM and permits a new manual request. Pending requests younger than one minute cannot be reconciled.
- Schema adds only `human_call_sessions.workspace jsonb NOT NULL DEFAULT '{}'`. [Additive SQL](docs/human-call-workspace-schema.sql) and [column-only DBML](docs/human-call-workspace-schema.dbml) must precede the API when synchronization is disabled. On 2026-10-08 the user explicitly selected “Defer Erflow for this release and deploy” after access was unavailable. Canonical read/update/refetch remains outstanding; this exception does not waive future schema changes.
- Checks: `npx jest --testPathPatterns='calls/test/human-call|crm/test|ghl/test/ghl-crm-request|livekit/test' --runInBand --no-coverage`, API/contracts/portal builds and the portal synthetic browser script. PostgreSQL uses only the guarded disposable API_SECURITY_TEST_DATABASE_URL below. Local checks do not establish production SIP audio/calendar acceptance.
- Local verification on 2026-10-08: 182 tests passed in eight focused suites, including 11 real PostgreSQL tests on a fresh disposable PostgreSQL 17 fixture at 127.0.0.1:55445/api_security_test. Column inspection confirmed workspace is non-null JSONB with an empty-object default. API/contracts and portal builds passed; headless Edge verified the CRM sidebar selector, CRM-only navigation, drafts/conflicts, wrap-up booking, scope isolation and 390px layout with synthetic API fixtures. No production schema, deployment or real call/calendar write was performed. Canonical Erflow synchronization and live audio/provider acceptance remain outstanding.
- Subsequent authorized production rollout on 2026-10-08 deployed pushed source `ae1ebfe` to API and portal. The reviewed workspace column was added with bounded locks/timeouts; fingerprints preserved all three existing sessions and pre-existing schema objects. API `358bd162-7bd3-4b3f-847d-d857669df6f7` reached SUCCESS/RUNNING, startup completed, Swagger routes and unauthenticated 401 passed. DATABASE_SYNCHRONIZE remains false and human calling remains enabled. No real call or CRM write was performed; Erflow is deferred for this release and live acceptance remains outstanding. See the [rollout record](../../railway/AGENTS.md#crm-human-call-workspace-rollout).

- `HUMAN_CRM_CALLS_ENABLED=false` is the default. It gates new sessions only; active lookup, owner join/end, and API supervision remain available when disabled. New calls dispatch a silent Sarvam transcription listener. Calling performs no AI conversation, audio recording, or automatic CRM mutation. Explicit workspace actions can create CRM notes and appointments.
- Routes: `POST /users/calls/human` with crmIntegrationId/crmContactId/sipTrunkId/requestId; `GET /users/calls/human/active` returns enabled + active; `POST /users/calls/:id/human/join` returns ephemeral Meet credentials; `POST /users/calls/:id/human/end` persists idempotent termination. Create/join/active responses are no-store. Register the static routes before the generic call-id controller. Only the initiating live user may join/end; ordinary call history remains org-scoped.
- `HumanCallsService` fetches the live CRM contact through CrmService and validates active tenant-owned connection/location, DND (global and call-specific), phone, and outbound trunk. Normalize valid international or ten-digit India-local numbers. Revalidate before dial and refuse changed destination/caller numbers. Microphone-only room-scoped tokens last ten minutes; never persist/log token or Meet URL.
- `calls.execution_type` defaults to agent; human rows have null agent/task/dispatch/model data and task_status not_applicable. `human_call_sessions` owns caller/contact snapshots, original request selections, participant identities, join/departure/dial markers, finish/cleanup state, and reconciliation leases. Request ID uniqueness and a partial unfinished-user index fence duplicates. Preserve snapshots on user/connection deletion; provider records are not mirrored.
- API supervisor observes due sessions every two seconds using cross-replica DB leases. Wait up to 120 seconds for expected browser participation with an unmuted microphone. Persist an attempt atomically with admission, then submit SIP once. Never repeat uncertain SIP creation; reconcile exact room/participant identities instead. SIP answer uses active/automation or the existing published-audio fallback when attributes are omitted; room presence alone is insufficient. Answer deadline is 60 seconds. Browser departure has a 15-second reconnection grace; muting after answer does not count as departure.
- Human call lifecycle diagnostics log only call IDs, microphone-ready booleans, browser-wait/validation durations and answer milestones. Browser arrival alone does not prove microphone readiness; separate the permission/publish wait from live CRM/trunk validation when investigating delayed dialing. No contact data, audio, notes, participant tokens or provider response bodies belong in these logs.
- All queued, immediate AI, and manual outbound starts serialize through QueueAdmissionRepository's organization-settings lock and share concurrency/rate charges. Immediate AI now obeys enabled/paused, quiet hours, rate, and capacity settings. Prepared human and unadmitted immediate sessions consume no capacity; admitted dialing/ready human sessions do. Queued batch ceilings are preserved. Human calls never enter AI candidates, retry actions, worker completion, or worker stale recovery.
- Cleanup requires confirmed room absence; unavailable reads are not absence. Retain Ending until removal is confirmed. Uncertain SIP submission retains cleanup observation for 70 seconds after its durable marker; uncertain room creation retains it for 30 seconds from preparation. Dedicated human SDK clients use bounded requests and disable region failover/write retries. Log only IDs and phases; overdue cleanup (>120 seconds) is an error requiring investigation.
- PriceService estimates human WebRTC time from observed browser join to end and SIP/carrier/isolation time from answer to end. New transcription calls also include measured Sarvam STT usage and observed listener transport (self-hosted WebRTC or deployed agent-session time), without LLM/TTS charges. Final transcription reprices the same attempt under a call lock; cleanup pricing uses that lock too. These are observed list-price estimates with zero markup, not CDRs/invoices. Daily workflow outcome metrics select agent calls; manual sessions appear separately in call history.
- Tests: focused `calls/test/human-calls.service.spec.ts`, LiveKit token/cleanup tests, and `human-calls.postgres.spec.ts`. PostgreSQL uses only API_SECURITY_TEST_DATABASE_URL pointing to api_security_test at 127.0.0.1:55445, schema human_call_test; the common fixture rejects shared DB targets. Mocked tests do not establish live Meet/SIP audio compatibility.
- Local verification on 2026-10-07: 215 focused tests passed, including 50 real isolated PostgreSQL admission/session tests. API/contracts/portal and both worker compatibility builds passed. The broader Jest run had 1,581 passes and one unrelated pre-existing demo-lead-quality fixture failure (missing required verificationToken). No live call or deployment was performed; contact/trunk selection and operator audio acceptance remain pending.
- Subsequent production rollout on 2026-10-07 deployed implementation e3c4893 to API and portal and enabled HUMAN_CRM_CALLS_ENABLED=true at the user's explicit request for their own acceptance testing. Schema/index/FK inspection, published Swagger routes, unauthenticated 401, LiveKit read access, and shipped portal assets were verified. No real call was placed; live audio acceptance remains with the user. Exact deployment IDs and rollback behavior are recorded in [the deployment guide](../../railway/AGENTS.md#human-crm-call-deployment).
- The exact additive schema delta is [human-call-schema.dbml](docs/human-call-schema.dbml). Erflow synchronization for this human-call change is outstanding and was explicitly deferred by the user on 2026-10-07 ("leave er flow"). This exception does not waive future schema synchronization. Live Meet/SIP acceptance remains required before enabling the feature.

## OTP and durable WhatsApp

- OTP is its own public module: send challenge → verify HMAC code → consume same-phone single-use proof before CRM/dial. API owns expiry/attempt limits, per-phone fencing, encryption, and durable priority delivery. No browser/worker code generation or Meta credential handoff.
- Demo validates real names/work email and allowed form choices; origin/rate failures do not enqueue. GHL lead upsert is best-effort; configured endpoint/key drive enqueue. Mail failures are nonfatal and should remain observable.
- Webhooks persist raw events and eligible durable turns before acknowledging; persistence failure lets Meta retry. Unconfigured/unmatched lines stay store-only. Active org connections win over platform routing even if their persona is empty.
- `whatsapp-agent` owns configuration and booking/parsing helpers; `whatsapp-harness` owns turns, task sessions, leases, authorization, receipts, checkpoint persistence, outbox, and independent API ticker loops. The separate WhatsApp worker alone runs ADK/OpenRouter. Harness is always active; no execution rollout switches.
- Org auto-replies need persona/task and assigned GHL booking/free-slot/contact capabilities with the existing linked voice-agent calendar. Platform receptionist has no tools; OTP never enters a worker turn/history.
- Only persisted successful scheduleGhlMeeting with appointment id closes a booked task. Refusal is API-validated cancelled/declined; exact case-insensitive `/new` cancels/reset-fences old work. Closed memory is not reused; final-send recovery stays independent of task closure.
- Unknown external-write/send outcomes are not automatically repeated. Meta accepted is API acceptance, not delivery/read. Recheck tenant, allowlist, profile, source activity/ownership at each tool call. Read [worker README](../whatsapp-worker/README.md) and [TASK-SESSIONS](../whatsapp-worker/TASK-SESSIONS.md) before harness changes.

## Change checklist and verification

- Schema edits follow [schema/Erflow workflow](#schema-and-erflow); preserve its specifically deferred updates without extending that exception. Update entities, DTOs, references, and applicable scoped guidance together.
- New wire fields/catalogs go in contracts first; update producers, validators, consumers, and response mappers. Add tests for business rules, guards, tenant isolation, state transitions, and redaction.
- Establish new product endpoints and their Swagger behavior before adding the UI unless the user explicitly requests the UI work first.
- From repo root: `npm run build:api`; focused Jest with `npx jest --testPathPatterns=<module>/test --no-coverage`. Test conventions and isolated PostgreSQL requirements are in [the testing section](#testing-reference). Do not run rewrite-enabled lint as a read-only check.
- Local: `npm run start:api:dev`. Swagger web tests need API + registered voice worker; integration/dial tests also need the configured upstreams. Mock I/O in unit tests.
- Read [the architecture/routes section](#architecture-and-api-routes) for endpoint families/examples and [Railway instructions](../../railway/AGENTS.md) for deployment, env ownership, and compatible worker-before-API rollout.

## Schema and Erflow

### CRM human-call transcription

New human calls initialize `sessionReport.transcription` and create a three-participant LiveKit room with a `human_transcription` job on the existing dispatch name. API remains the only SIP/lifecycle owner. Worker/sidecar outages never gate dialing, and uncertain room/SIP writes are not repeated. Older calls have no transcription state and are not backfilled.

Worker-secret-protected POST `/internal/calls/:id/human/transcription/start|checkpoint|finish` uses shared contracts and validated Nest DTOs. Start checks a human session, exact room, active phase and single job ownership; its private HMAC callback token is returned with no-store and is never persisted/logged. Subsequent callbacks verify job/token with constant-time byte comparison. Call-first transactions update only transcript/report/usage/cost fields, including after `finished_at`; workspace edits and supervision retain their authority. Final segments have stable UUIDs and caller/contact roles, are deduplicated across retries, and sort by speech timestamp. Active human transcripts are omitted from call responses.

Statuses are pending/running/finalizing/complete/partial/unavailable/not_needed. Worker checkpoints every final segment and heartbeats every five seconds. API expires missing heartbeats after 30 seconds; termination allows a 30-second final callback window using cleanup start/end time. No connected audio is not_needed. Partial speech survives failures. A five-second sweep also handles ended calls after their human supervisor stops. No new table, column, index or migration is introduced. Focused tests are `calls/test/human-call-transcription`, `calls/test/human-calls.postgres` (guarded api_security_test fixture), worker listener/entry/Sarvam suites, and price tests. Live bilingual audio acceptance is separate from mocked/local checks.

Prepared sentences release exception, 2026-10-08: the user explicitly selected “Defer Erflow for this release and deploy” for the two nullable tts_prepared_speech_enabled columns. Apply the reviewed additive SQL with DATABASE_SYNCHRONIZE=false. Canonical Erflow synchronization remains outstanding; this exception is limited to this release and does not waive future schema work.

TTS cache release exception, 2026-10-08: the user explicitly selected “Explicitly defer Erflow,” authorized production deployment with caching off, and will perform live testing. Canonical synchronization remains outstanding for `tts_cache_entries` and both `tts_cache_enabled` columns. Earlier statements in the implementation verification record describe the prerequisites before this exception; it does not waive future schema synchronization.

`DATABASE_SYNCHRONIZE` is API-only and defaults true for existing local development behavior. Production is explicitly set false for the TTS rollout; apply reviewed additive schema changes before starting API versions that require them. Never enable synchronization to repair unrelated production drift. `scripts/tts-cache-release-preflight.ts` recreates the production TTS delta only within guarded `tts_cache_test`, exports eight additive statements, and confirms the older WhatsApp index remains untouched. It requires `API_SECURITY_TEST_DATABASE_URL` and `TTS_SCHEMA_DELTA_OUTPUT` and restores the disposable fixture in `finally`.

## Data model (Erflow)

Canonical ER model:

**https://app.erflow.io/workspace/my-workspace000/models/eaaca8f3-41cf-429f-9bbc-b31ff2f2292b**

### Required workflow after any schema change

Whenever you add/change/remove tables, columns, indexes, or foreign keys:

1. Update TypeORM entities under `apps/api/src/**/**.entity.ts`.
2. Keep local DB schema in sync (`synchronize: true` is currently enabled for early dev; switch to migrations when schema stabilizes).
3. **Update the Erflow model** via the Erflow MCP tools:
   - Call `get-data-model-dbml` first to read current state.
   - Apply changes with `create-table` / `create-column` / `update-table` / `create-foreign-key` / etc. (prefer `batch-operations` for multi-step changes).
   - Re-fetch DBML and confirm it matches the entities.
4. Update DTOs, Swagger decorators, this guide and the schema reference index if conventions changed.

Do **not** leave entities and Erflow out of sync.

### Organization hub

`organizations` is the **tenant hub**. Call-stack resources hang off it:

```
organizations
├── users                              (org members; password set via invite email)
├── password_reset_tokens              (invite + reset hashes; hang off users/admins)
├── organization_agents                (named org AI configs; many per template → tool_profiles)
├── organization_queue_settings        (1:1 outbound dial queue config)
├── queue_admissions                   (immutable rate charges for queued outbound SIP attempts)
├── call_batches                       (bulk enqueue groups + pause/cancel)
├── calls                              (voice sessions; org nullable for platform web tests)
├── sip_trunks                         (org SIP trunks: outbound + inbound drafts → LiveKit ST_… ids)
├── sip_dispatch_rules                 (inbound routing drafts → LiveKit SDR_… ids)
├── integration_endpoints              (CRM dial-in: preconfigured agent/task/queue + API key)
├── organization_integrations          (org BYO third-party keys; Nylas + GoHighLevel calendar)
├── whatsapp_webhook_configs           (1:1 Meta verify token + phone_number_id / WABA routing)
├── whatsapp_webhook_events            (raw inbound webhook JSONB; org nullable if ids unknown)
├── whatsapp_outbound_messages         (per-recipient log of template sends from the portal WhatsApp page)
├── allowed_tool_ids column            (JSONB worker tool allowlist; `null` = existing tenant keeps full catalog, new orgs `["endCall"]`)
└── phone_numbers                      (planned)

tool_profiles                  (capability bundles: platform seeds + org-owned customs)
└── tool_profile_tools         (profile → worker tool_id strings)
```

### Schema (current)

- `admins` — platform super-admins (separate from org users)
- `organizations` — tenants (hub). **`allowed_tool_ids` JSONB** is the admin-assigned worker tool allowlist. **`null` = pre-allowlist tenant** (full worker catalog — existing orgs on deploy). **New orgs store `["endCall"]`**. After an admin PATCH the set is explicit; `endCall` always kept. Org users may only put assigned ids on custom profiles. Runtime `enabledTools` is profile ∩ allowlist (`null` allowlist does not strip tools).
- `users` — org members (`organization_id` FK, unique `(organization_id, email)`). `password_hash` is **nullable** until the member sets a password from the invite email. Optional stored `role` (`org_admin` | `agent` | `supervisor`) is **not enforced** yet; any org user may use org-scoped user APIs.
- `password_reset_tokens` — hashed invite / reset tokens (`kind` `user` \| `admin`, `purpose` `invite` \| `reset`). Raw token is emailed once; only SHA-256 is stored. Unused siblings are invalidated on re-issue, set, change, or reset.
- `tool_profiles` — named capability bundles (`key`, `name`, optional `organization_id`). Platform seeds (`organization_id` null): `default`, `outbound`. Org users may create **custom** profiles from the **org allowlist** (not the full worker registry; `endCall` always included) and select them on agents.
- `tool_profile_tools` — rows of `tool_id` strings (worker registry ids, e.g. `endCall`, `booking`). **Not** JSON tool schemas.
- `agents` — **platform AI agent templates** (seeded: `inbound`, `outbound`). **Persona** via `system_prompt` (identity, tone, policies). Optional LiveKit hook instructions: `on_enter_instructions` / `on_exit_instructions` (`null` = worker default, empty string = silent). Also: `default_task_key`, `default_tool_profile_id`, optional `voice` / **`tts_model`** (speech catalog; `null` = Inworld TTS-2) / **`stt_model`** (STT catalog; `null` = Deepgram Nova-3) / **`speech_language`** (BCP-47 for Sarvam STT/TTS; `null` = worker default) / **`model`** (LLM / realtime catalog; `null` = Gemma; realtime ids are speech-to-speech) / `temperature` (LLM), `speaking_rate` (0.5–1.5 when the selected TTS supports it), `delivery_mode` (`STABLE` \| `BALANCED` \| `CREATIVE`, Inworld only). Not the same as user role `agent`.
- `organization_agents` — org-owned **named** agent configs: FK to org + platform template (`agent_id`); display `name` + unique-per-org `slug`; effective persona `system_prompt`, optional `on_enter_instructions` / `on_exit_instructions`, `tool_profile_id`, optional `voice` / **`tts_model`** / **`stt_model`** / **`speech_language`** / `model` / `temperature` / `speaking_rate` / `delivery_mode`. **`default_task_key` is inbound-only (required)** — packed into SIP dispatch metadata. Outbound configs store `null`; task is chosen on the call, batch, or integration endpoint (fallback: platform template → `general`). Unique `(organization_id, slug)` — **not** unique on template, so an org may have many inbound/outbound configs (different prompts/hooks/tools). Create/clone copies template or source config (outbound clone clears task). Org null voice fields fall back to the template at response/metadata time. Switching `tts_model` (or a realtime `model`) requires a `voice` from that catalog.
- `organization_queue_settings` — 1:1 with org. Outbound dial queue: `enabled`, `paused`, `max_concurrent`, `max_dials_per_minute`, `default_max_attempts`, backoff (`fixed` \| `exponential`, base/max seconds), `retry_on` JSONB failure codes, optional quiet hours + timezone, `claim_batch_size`. Lazy-created on first access / seeded on org create.
- `call_batches` — bulk enqueue groups: `status` `running` \| `paused` \| `cancelled` \| `completed`, optional overrides (`max_attempts`, `max_concurrent`, `priority`), `total_count`, agent/trunk/task snapshot. Batch `max_concurrent` is an additional ceiling and never raises organization capacity; null inherits the organization ceiling.
- `queue_admissions` — immutable rolling-rate charges: UUID `id`, `organization_id` (CASCADE), nullable `call_id` (SET NULL), `admitted_at` (timestamptz). Indexes cover `(organization_id, admitted_at)` and age-based cleanup; unique `(call_id, admitted_at)` prevents a timestamp collision from reusing an old lease identity. Call deletion leaves recent charges intact. Admission history contains no numbers, context, task definitions, or provider credentials. Schema changes must be reflected in the canonical Erflow model before release.
- `sip_trunks` — org SIP trunks (`direction` `outbound` \| `inbound`). Outbound: provider fields + `livekit_trunk_id` (`ST_…`) set on create (link or provision) via admin **or** org user; always `live` after create. Inbound: draft-first (`livekit_trunk_id` null until publish); also `allowed_numbers`, `allowed_addresses`, `krisp_enabled`, `published_at`. Never return `auth_password` in responses. Response `status`: `draft` \| `live` (derived from whether LiveKit id is set).
- `sip_dispatch_rules` — org inbound routing configs. Local draft of LiveKit dispatch rule: `rule_type` (`individual` \| `direct` \| `callee`), room fields, `sip_trunk_ids` (local inbound trunk UUIDs), optional `organization_agent_id` (persona packed into agent job metadata on publish), `agent_name`, `livekit_dispatch_rule_id` (`SDR_…`, null until publish), `published_at`. Default for agent telephony: `individual` + `room_prefix=call-`.
- `calls` — voice call records (queued pending, web test, or SIP outbound). Links optional `organization_id` / `organization_agent_id` / `agent_id` / `sip_trunk_id` / `batch_id` (→ `call_batches`); LiveKit `room_name` (null while pending), dispatch id, optional `livekit_sip_call_id`, numbers, **`context` JSONB** (request payload: CRM/demo fields, phoneNumber, externalId — what was asked of this call), `task_key` / `task_result` / **`task_status`** (`pending` \| `completed` \| `incomplete`), transcript/usage/`session_report` (includes **`toolEvents`**: worker tool invocations with args/result/ok/duration), **`cost` JSONB** + **`cost_usd`** (LiveKit list-price snapshot, **markup 0**, frozen on worker complete; retries append attempts), queue fields (`attempt_count`, `max_attempts`, `next_attempt_at`, `priority`, `last_failure_code`, `last_failure_at`, `dial_started_at`, `queue_locked_at`), timestamps. Status: `pending` \| `creating` \| `dialing` \| `ready` \| `failed` \| **`completed`** (session ended **and** `task.complete()` ran) \| **`incomplete`** (conversation ended without `task.complete()`) \| `cancelled`. Do **not** infer task done from `task_result` JSON (unanswered/crash paths also write one). Transitions go through `call-state-machine.ts`. Buckets: **pending** / **in_progress** / **done** (`completed` \| `incomplete` \| `failed` \| `cancelled`). Medium: `web` \| `sip`. **Inbound SIP rings** are upserted by the worker on job start (`POST /api/internal/calls/inbound` by LiveKit `room_name`) then completed on the existing complete callback; dispatch-rule metadata stays static (no per-ring `callId`). Inbound rows use `max_attempts=1` and are never requeued as outbound dials. Call APIs also expose derived top-level `toolEvents` from `session_report.toolEvents` for portal history, and **`cost`** (list-price snapshot, markup 0) on both admin and org-user call DTOs (`null` until worker complete). Portal call tapes show a derived **Outcome** badge (`callDisplayOutcome`: lifecycle, or `taskResult.outcome` when `status=completed`) — not raw `status`. Raw status stays on the dossier; do not infer completion from leftover `task_result` JSON.
- `integration_endpoints` — org CRM / external dial-in configs. Baked-in `organization_agent_id`, `task_key`, optional `sip_trunk_id`, queue overrides (`max_attempts`, `priority`, `max_concurrent`), optional `default_context` JSONB. Auth: opaque `public_id` in the URL path + per-endpoint API key (`key_prefix` display + `key_hash` SHA-256; full secret shown only on create/rotate). Soft `is_active`; `last_used_at` on successful public enqueue. Never return `key_hash` or full secret on list/get.
- `organization_integrations` — org-owned third-party credentials (`provider=nylas` \| `ghl` \| `ghl_contacts` \| `ghl_crm` \| `whatsapp`): `name`, `api_key` (secret, never returned), `api_key_prefix`, `grant_id` (Nylas; null otherwise), `location_id` (GHL / ghl_contacts / ghl_crm; null for other providers), `calendar_id` (Nylas default `primary`, or GHL calendar id), `api_uri` / `email` (Nylas-only), **`phone_number_id` / `waba_id`** (`whatsapp` only; numeric Graph ids), optional **`system_prompt`** (`whatsapp` only; null/empty = inbound auto-replies off), `is_active`. **Calendar providers are only `nylas` / `ghl`** — they are the only ones linkable via `calendar_integration_id` (`isCalendarIntegrationProvider`) and shown in calendar UIs. **`ghl_contacts`** = a separate GHL v3 PIT (`contacts.readonly`) + location id used only to import contacts for WhatsApp sends (independent of the calendar `ghl` connection). **`whatsapp`** = the org's own Meta Graph access token (System User; `whatsapp_business_management` + `whatsapp_business_messaging`) plus `phone_number_id` + `waba_id`; used for outbound template sends and inbound Agent auto-replies when `system_prompt` and `whatsapp_task_key` are set. `ghl_contacts` and `whatsapp` are **one per org** (409 on a second create).
- `whatsapp_outbound_messages` — one row per recipient of a portal template send: `organization_id` (CASCADE), `integration_id` (SET NULL), `batch_key` (uuid per send click), `contact_name`, `phone` (normalized digits), `ghl_contact_id`, `template_name`, `language`, `status` (`sent` \| `failed` \| `skipped`), `wamid`, `error`, `created_at`. Never stores the token, variable values, or message bodies.
- `whatsapp_webhook_configs` — 1:1 with org. Meta webhook subscription: `phone_number_id` / `waba_id` (at least one; unique when set), SHA-256 `verify_token_hash` + display `verify_token_prefix`. Raw verify token returned only on generate/rotate. `GET /api/webhooks/whatsapp` is public (no JWT): `hub.mode=subscribe` + matching `hub.verify_token` returns `hub.challenge` as `text/plain` 200; otherwise 403. Callback URL is `{API_PUBLIC_URL|/public API_BASE_URL|https://RAILWAY_PUBLIC_DOMAIN}/api/webhooks/whatsapp` (never `*.railway.internal`). Inbound POSTs route by phone number id then WABA id.
- `whatsapp_webhook_events` — one row per Meta POST: `payload` JSONB (empty body stored as `{ raw: null }`), `event_type` (first `entry[].changes[].field`, else `unknown`), `received_at`, optional `organization_id` (SET NULL for unknown ids). Numeric Graph phone/WABA ids are accepted. Raw events and eligible org/platform text turns are persisted before returning 200; ingestion failures return an error so Meta can retry. The dedicated WhatsApp worker runs Google ADK/OpenRouter `openai/gpt-5.6-luna`; the API sends replies from the durable outbox. Each model request gets a fresh sender-local clock (UTC fallback). Exact case-insensitive `/new` resets the durable generation and enqueues a canned reply without Luna. Unmatched/unconfigured lines remain store-only.
- `otp_challenges` — public get-demo WhatsApp OTP (not org-scoped, not the webhook module). `phone_digits`, `code_hash` (HMAC-SHA256 with `OTP_HASH_SECRET`), `expires_at` (5 min), `attempt_count` (max 5 then burn), `consumed_at`. After a correct code: `verification_token_hash` + `verification_expires_at` (10 min) + `verification_used_at` (single-use on demo request). Raw code and token are never stored or returned together. A new send burns older unused rows for that phone.
- `organization_agents.calendar_integration_id` — optional FK → `organization_integrations` (SET NULL). Which calendar powers calendar tools for that agent (Nylas **or** GHL); tool enablement stays on the tool profile.
- `organization_integrations.booking_voice_agent_id` — optional FK on a `whatsapp` connection → an existing `organization_agents` row (SET NULL). When paired with a tool profile, the WhatsApp agent reuses that voice agent's active GHL calendar integration for ADK contact and calendar tools. The WhatsApp Agent tab selects the voice agent as the credential source; no new integration is created. Runtime rechecks the org, agent, and calendar connection before each tool call.
- `organization_integrations.whatsapp_tool_profile_id` — optional FK on a `whatsapp` connection → an existing `tool_profiles` row (SET NULL). The WhatsApp Agent tab selects a visible platform or org tool profile. Its GHL tool ids are intersected with `organizations.allowed_tool_ids` on each reply; null or a profile without assigned GHL ids grants no WhatsApp booking tools. The voice agent selection supplies the existing GHL calendar credentials only.

### WhatsApp harness schema

- `organization_integrations.whatsapp_task_key` — nullable `receptionist` / `appointment_booking`, configured on the WhatsApp Agent tab. Org auto-replies require a nonempty persona and a selected task with assigned GHL booking, free-slot, and contact tools. Existing channels without a task remain store-only. The environment-configured platform receptionist remains unchanged.
- `whatsapp_task_sessions` — durable org task instances under a conversation, with one active instance per conversation (partial unique index), generation, immutable versioned configuration/credential-reference snapshot (no secrets), ADK session, trusted tool state, status, outcome/result, terminal turn ID and close timestamps. Only a persisted successful `scheduleGhlMeeting` receipt with an appointment ID completes a task. Explicit refusal closes as cancelled/declined; `/new` closes as cancelled/reset. Closed context is retained for audit and never reused.
- `whatsapp_agent_turns.task_session_id` and `whatsapp_tool_operations.task_session_id` link execution and receipts to a task. Operations also record their originating `turn_id`; task-scoped operation keys have a partial unique index, with the old conversation/generation uniqueness retained for legacy null-task records. `task_protocol_version=1` identifies new org turns; the ticker retires old pending/failed org work without cancelling its final sends. Task closure does not change conversation generation. Only the completing turn can finish confirmation/recovery; outbox retry remains independent of task closure.
- Task jobs require worker health `taskProtocolVersion: 1`. Deploy compatible workers before APIs, after draining executing turns. See [WhatsApp task-session lifecycle](../whatsapp-worker/TASK-SESSIONS.md).

Erflow synchronization for **this task-session schema change** was explicitly deferred by the user. It is outstanding in addition to the previously deferred harness/platform/OTP changes. This exception does not waive future schema synchronization.

- `whatsapp_conversations` — `scope=org|platform` (default org). Org scope has org + connection FKs CASCADE and unique connection/sender. Platform scope has null org/connection and `platform_phone_number_id`, unique platform phone/sender. A DB check enforces the scope/FK pairing. Reset generation and sequencing remain conversation-wide. Legacy/platform ADK `session` and trusted `tool_state` remain on this row; org memory and booking state belong to `whatsapp_task_sessions`.
- `whatsapp_agent_turns` — ordered inbound texts, unique Meta `(phone_number_id, message_id)` and conversation sequence, generation, pending/running/succeeded/failed/cancelled, attempts/backoff, renewable UUID lease, initial session snapshot and ADK checkpoint. Conversation FK CASCADE.
- `whatsapp_message_outbox` — `kind=text|otp_template` (default text). Text has one turn FK CASCADE + body. OTP has a unique challenge FK CASCADE, null turn/body, platform phone id/Graph version/template name and short-lived `encrypted_code` (select:false). A DB check enforces these shapes. Shared pending/sending/accepted/uncertain/failed/cancelled, Meta id and attempts/timestamps. Accepted means Meta API acceptance, not delivery/read.
- `whatsapp_tool_operations` — durable GHL operation reservation/result, unique task-session/operation key for task work, with legacy conversation/generation/operation uniqueness for null-task rows; conversation and task FKs CASCADE. An unknown write outcome is never automatically repeated.

Erflow synchronization for the original four harness tables and the platform/OTP schema extension was explicitly deferred by the user for these changes; it remains outstanding. This exception does not waive the normal schema workflow for future changes.

### CRM provider and schema evolution

`ghl_crm` is a value in the existing varchar provider column, not a new table/schema migration. Multiple named connections store per-org PIT and location id; data remains live in HighLevel, with no local contact/calendar/opportunity mirror. It is not a calendar-link provider. See [CRM README](src/crm/README.md).

The organization hub diagram above is a conceptual ownership map, not an exhaustive table list; allowed_tool_ids is an organization column, not a child table. Harness conversations own task sessions, turns, operations and outbox as described above; platform and OTP scopes follow their specific checks.

TypeORM currently uses synchronize: true in [ApiModule](src/api.module.ts), including deployment startup. The installed schema builder can drop removed columns on retained entity tables; the previous blanket claim that synchronize never drops columns was incorrect. Entity/table removal and data disposal still require an explicit reviewed plan; do not run DROP/CASCADE examples automatically or assume synchronization is a safe migration strategy. Local DB changes do not alter Railway Postgres. See [deployment schema handling](../../railway/README.md#schema--db-after-deploys).

The deferrals above apply only to the historical harness, platform/OTP extension, and task-session changes explicitly named. This documentation split adds no schema changes and does not perform or waive the outstanding Erflow work.

## Architecture and API routes

### Integration endpoints (CRM dial-in)

**Platform holds config; CRM sends a thin request.**

```
Dashboard form → integration_endpoints (agent, task, trunk, queue, default context) + API key once
CRM → POST /api/integrations/:publicId/calls  { phoneNumber, context?, externalId? }  + API key
API merges default_context + request → enqueue pending call (same path as bulk enqueue)
QueueDialerService claims and dials
```

- Management: JWT org user under `/api/users/integration-endpoints` (CRUD + rotate-key).
- Public: API key via `Authorization: Bearer ca_live_…` or `X-Api-Key` (not a JWT).
- Request must not carry agent/task/trunk/queue fields — those are fixed on the endpoint.
- Context merge: `{ ...defaultContext, ...request.context, phoneNumber, externalId? }` (request wins on key conflict).

### Outbound dial queue (API-owned)

**API owns the queue dialer.** LiveKit worker stays voice-only (no Postgres, no SIP dial).

```
POST /users/calls (enqueue) → call_batches + pending calls
API QueueDialerService (@Interval) → atomic QueueAdmissionService admission → fenced beginDial → room + dispatch + CreateSIPParticipant
Worker voice session → POST /internal/calls/:id/complete → complete or requeue
```

**Config hierarchy (most specific wins):** platform env defaults → `organization_queue_settings` → `call_batches` overrides → per-call `max_attempts` / `priority` / `next_attempt_at`.

Concurrency intersects organization and batch ceilings rather than replacing the organization ceiling. Under `READ COMMITTED`, admission locks the existing settings row, reads the database clock after that lock, rechecks organization activity/settings/quiet hours, reclaims expired unstarted claims, counts outbound SIP `creating`/`dialing`/`ready`, and locks eligible same-org running batches in ID order before selecting calls. Candidates must be due, below their attempt ceiling, and unbatched or linked to a locked same-org running batch. Selection preserves priority, due time, creation time, and ID order; saturated batches are skipped. Each `pending → creating` reservation increments attempts and inserts its admission record in the same transaction. Results leave the module only after commit; missing settings grant nothing.

The rate limit counts **committed admissions**, not the timing of upstream SIP requests. Every record consumes budget for 60 seconds even after failure, retry, manual retry-now, lease reclamation, or call deletion. Failed transactions consume nothing. Observed outbound SIP timestamps without matching admission records also consume budget for legacy/immediate compatibility; matching queued timestamps are counted once. `dialsLastMinute` retains its wire field name and reports this budget usage. Immediate outbound routes retain their bypass, so guarantees cover competing queue admissions rather than every outbound route. Cleanup deletes at most 1,000 records older than 24 hours per API minute, outside admission transactions.

Settings updates and batch pause/resume/cancel use settings → batch → call locking order. Lazy default creation uses insert-on-conflict-ignore to preserve concurrent pause/limit changes. Pending cancel/retry/prioritize use conditional field-only writes, so a stale pending view cannot overwrite admission. Pause/cancel prevents subsequent admissions; already admitted calls may proceed. `beginDial` locks the recorded call, verifies its same-org matching lease and expiry using the database clock after the lock, and commits `creating → dialing` before any preparation/provider work. Replaced/expired claims do no upstream work. No locks span provider HTTP; later dispatch-id persistence leaves that transition intact. This does not provide exactly-once external dialing or introduce provider retries.

Quiet hours apply to every admission as well as retry scheduling: inclusive start, exclusive end, overnight support, and equal endpoints meaning all-day quiet. Invalid enabled configurations block admission with a configuration warning. Due rows remain pending during quiet hours.

**Retries (practical):** on dial failure or worker `failed` complete, classify `failure_code` (`no_answer` \| `busy` \| `sip_error` \| `timeout` \| `agent_error` \| `cancelled` \| `unknown`). If code ∈ `retry_on` and `attempt_count < max_attempts`, requeue to `pending` with backoff (`fixed` or exponential, optional quiet-hours push). Else terminal `failed`.

**Controls:** org pause/resume, batch pause/resume/cancel, per-call cancel / retry-now / prioritize. Live stats via REST poll (`GET …/queue/stats`). Multi-instance queue admission safety comes from the settings-row lock plus transactional reservations/rate charges; `SKIP LOCKED` avoids conflicting candidate writes. The guarantee requires all API replicas to run the new admission path. Release only the API through the runbook after schema/Erflow verification; retain the additive ledger on rollback.

**Stale in-flight sweeper:** each dialer tick also reaps global `dialing` / `ready` rows that never received worker complete (worker hang/death). Age clocks: dialing from `dial_started_at` (default 180s); ready from `answered_at` (default 900s). Action: `timeout` → fail or requeue under org `retry_on` / `max_attempts`, best-effort LiveKit room delete. Frees `max_concurrent` slots held by zombies.

### Agent architecture (persona / workflow / capabilities)

Aligned with LiveKit’s separation of **Instructions**, **Tasks**, **Tools**, and runtime metadata:

| Concern | Where it lives | What it is |
|---------|----------------|------------|
| **Persona** | `agents.system_prompt` / `organization_agents.system_prompt` → metadata `prompt.systemPrompt` | Who the agent is, company, tone, policies, safety. **No** call-specific workflow steps. Portal edits this only. Worker `buildPersonaPrompt` **appends** a platform runtime layer (voice rules, direction, **current date/time/day** from the worker clock, safety) that is **not** in the portal. LiveKit `AgentTask.run()` **replaces** the parent agent, so tasks copy this via `composeTaskInstructions` (persona + workflow). Do not rely on the parent prompt surviving the handoff. |
| **Call open / close** | `on_enter_instructions` / `on_exit_instructions` → metadata `prompt.onEnterInstructions` / `onExitInstructions` | Pipeline parent `onEnter` uses exact `sayCached` for nonempty configured text with Prepared sentences On; otherwise `generateReply`. Task sentence/silent opening takes priority. `onExit` → verbatim `session.say(text)`. `null` = built-in default; `""` = skip speech. Native realtime tasks generate the opening after handoff. |
| **Workflow** | Worker `TaskRegistry` (LiveKit `AgentTask`) selected by metadata `task` | Objective, completion conditions, structured result (e.g. appointment CONFIRMED). **Inbound:** org agent `default_task_key` (required). **Outbound:** call / integration `task` (not on the agent). |
| **Capabilities** | Worker `ToolRegistry` hard-coded implementations; enabled by `tool_profiles` → metadata `enabledTools`, **intersected with `organizations.allowed_tool_ids`** | Executable actions (`endCall`, `booking`, …). Admin assigns which ids an org may use. New orgs: `endCall` only. Existing orgs stay `null` (full catalog) until an admin saves Tools. Orgs create/select profiles of those **ids** (not implementations). |
| **Runtime context** | Call request `context` + ids in metadata | CRM fields, bookingId, phoneNumber, etc. Never executable code. |

**Worker stays stateless** — never queries Postgres. API packs metadata; worker builds runtime via builders:

```
Parse metadata → PromptBuilder → ToolBuilder (registry) → TaskBuilder → AgentSession
```

Known task keys: `general`, `demo_booking` (schedule calendar demo then short product discovery), `interview_booking` (confirm callee name, congratulate they were selected, then book an interview; calendar tools come from the agent tool profile, not the task), `personal_loan_outreach` (present pre-filled personal-loan amount / interest rate / term, ask if they want the loan; result `INTERESTED` / `NOT_INTERESTED` / `CALLBACK`), `loan_collection` (confirm name, state EMI/loan due date + CIBIL impact, ask when they will pay and why delayed; result `PROMISED` / `REFUSED` / `ALREADY_PAID` / `CALLBACK` / `WRONG_PERSON`), `real_estate_outreach` (confirm name, present pre-filled location + budget, ask if they are interested in the property opportunity; result `INTERESTED` / `NOT_INTERESTED` / `CALLBACK`), `real_estate_visit_confirmation` (confirm name, present pre-filled location + visit time + optional notes, ask if they will come to the property visit; result `CONFIRMED` / `NOT_COMING` / `CALLBACK`, optional notes).
Known tool ids: `endCall`, `booking`, `cancelBooking`, `transferCall`, `lookupCustomer`, `confirmAppointment`, `checkCalendarAvailability`, `listCalendarEvents`, `createCalendarEvent`, `cancelCalendarEvent`, `checkGhlFreeSlots`, `lookupGhlContact`, `upsertGhlContact`, `scheduleGhlMeeting`.

**Calendar tools (Nylas):** org stores API key + grant on `organization_integrations` (`provider=nylas`); link via `organization_agents.calendar_integration_id`; enable Nylas tool ids on a tool profile. Worker tools call `POST /api/internal/calls/:callId/calendar/*` with `X-Worker-Secret` — API holds secrets (never in LiveKit metadata).

**Calendar tools (GHL):** org stores a **v3 Private Integration Token** + location (sub-account) id + calendar id on `organization_integrations` (`provider=ghl`); link via the same `calendar_integration_id`; enable `checkGhlFreeSlots` / `lookupGhlContact` / `upsertGhlContact` / `scheduleGhlMeeting`. Token scopes: `calendars.readonly` (View Calendars), `calendars/events.readonly` (View Calendar Events), `calendars/events.write` (Edit Calendar Events). Lookup needs `contacts.readonly`; upsert needs `contacts.write`. Calendar book (`scheduleGhlMeeting`) does **not** create contacts — it uses `ghlContactId` / `contactId` on the call (get-demo CRM upsert, `lookupGhlContact`, or `upsertGhlContact`; both persist `ghlContactId` onto `calls.context`). Phone-like `contactId` values are ignored. GHL “contact not found” on book is `missing_contact`, not a busy slot. Portal can preview calendars via `POST /api/users/integrations/ghl/calendars` (`GET /calendars/?locationId=`). Worker tools call `POST /api/internal/calls/:callId/ghl-calendar/*`. Free slots return **open times only** (never existing appointments). No platform-env fallback — missing/inactive/wrong-provider link fails the tool. `GhlService` is the only GHL HTTP client. Worker/API treat naive or `Z` ISO **plus IANA `timezone`** as local wall-clock (LLMs often tag IST times with `Z`); numeric offsets (`+05:30`) stay absolute. Short free-slot windows (< 4h) expand to the local calendar day(s) before calling GHL.

### Durable WhatsApp execution

The [harness](src/whatsapp-harness/whatsapp-harness.module.ts) is the sole execution path for org replies, platform replies, and OTP delivery. Separate one-second API ticker dispatch/sender loops have independent overlap guards, replica-safe claims, HTTP model dispatch, lease recovery, and durable outbox sending. Startup requires `WHATSAPP_WORKER_URL` and `WORKER_CALLBACK_SECRET`; there are no current execution switches, API model runners, broker/Redis, or worker DB access.

The API stores and authorizes org task sessions, immutable secret-free configuration snapshots, turns, leases, checkpoints, tool operations, and outbox rows. Active org connections take precedence over platform routing even with an empty persona. Org auto-replies require persona, task, assigned schedule/free-slot/contact tools, and an active linked GHL calendar source. Platform replies have no tools. Exact case-insensitive `/new` cancels/fences the old generation and sends a canned reply without the model.

Only an API-persisted successful booking receipt with appointment id completes an org task. Refusal is API-validated cancelled/declined, reset is cancelled/reset. Closed memory is retained for audit and never reused; only the completing turn can finish its final response. Unknown external writes are never repeated automatically. Final-send retry is independent of task closure and does not rerun booking/model execution.

The [WhatsApp worker README](../whatsapp-worker/README.md) owns detailed limits, transport, recovery, and platform/OTP execution. [TASK-SESSIONS](../whatsapp-worker/TASK-SESSIONS.md) owns lifecycle, final-response, compatibility, and rollout behavior. [Deployment runbook](../../railway/README.md) owns environment/upgrade instructions, including historical switch-based releases.

OTP uses the API's priority outbox; no model dispatch/history is involved. HMAC challenges have five-minute expiry and five attempts; proofs have ten-minute expiry and are single-use/same-phone. API-only AES-256-GCM delivery ciphertext is bound to challenge/expiry, erased on terminal outcome/expiry, and requires a stable dedicated key. Per-phone transactional fencing covers issuance/send/verify/proof. Send returns challenge id only after Meta acceptance (30s wait plus possible final locked 15s send reconciliation); ambiguous sends burn the code, only definite 429s retry three attempts with 1s/2s backoff. OTP sending is independent of model-worker availability. Missing configuration returns 503.

### Naming note

| Term | Meaning |
|------|---------|
| `agents` table | AI call-agent **templates** (persona + default task/tool profile) |
| `organization_agents` | Per-org **named** AI agent configs (persona + hooks + tool profile); inbound also requires a default task; many per template |
| LiveKit **Task** | Code-defined workflow unit in the worker (`apps/worker/src/tasks`) |
| `tool_profiles` | Capability bundles of worker tool ids (platform + org custom) |
| `calls` table | A single voice session / room lifecycle row |
| User role `agent` | Human org member role on `users` |

## Auth conventions

- **Platform admins** and **org users** are different principals (`JWT.typ`: `admin` | `user`).
- Access control: `JwtAuthGuard` + `AdminGuard` or `UserGuard`. Org-user controllers take org id from JWT via `orgIdFrom` (`apps/api/src/auth/org-id.ts`) — do not copy a private `orgIdFrom` onto each controller.
- Passwords: bcrypt only; **never** return `passwordHash` / `password_hash` in API responses.
- Org login requires `organizationSlug` or `organizationId` (email uniqueness is per-org).
- Tokens: Bearer access JWT only (no refresh/session store yet).
- **Live revalidation:** after signature/expiry checks, `JwtStrategy` reloads admin/user from Postgres on every authenticated request. Reject if admin/user is missing or `isActive=false`. For users, also reject if the org is missing or `organization.isActive=false`. Principal `orgId` / `role` / `email` / `name` come from the DB row (not stale JWT claims). `/me` profile endpoints re-check the same rules.
- **Login rate limits:** `POST /api/auth/login` and `POST /api/auth/admin/login` use an in-process fixed window keyed by `route + client IP + email` (`LoginRateLimitGuard`). Defaults: 10 attempts / 60s (`AUTH_LOGIN_MAX_ATTEMPTS`, `AUTH_LOGIN_WINDOW_MS`). Counters are **per API process** (not shared across Railway replicas). API sets Express `trust proxy` so `X-Forwarded-For` yields the real client IP behind a reverse proxy. Client IP is `clientIp()` (`apps/api/src/common/client-ip.ts`). Window math lives in `FixedWindowRateLimit` (`apps/api/src/common/fixed-window-rate-limit.ts`); 429 bodies go through `throwTooManyRequests`. Over limit → **429**.
- **Get-demo abuse limits:** `POST /api/demo/request` uses `DemoAbuseGuard`. When `CORS_ORIGIN` is set, `Origin` (or `Referer` origin) must match that allowlist (403). Parse `CORS_ORIGIN` with `parseCorsOriginAllowlist` (`apps/api/src/common/cors-origin.ts`) — same helper as Nest `enableCors` (trim, lowercase, strip trailing slash). Then in-process fixed windows (same `FixedWindowRateLimit` helper as login): IP (default 5 / 15 min), phone (1 / hour), email (2 / hour), global (30 / hour). Over limit → **429**. Counters are **per API process**. Country / team size / calls-per-day / integrations are allowlisted to the marketing form. **Lead quality:** first/last name must look like a real person (`isDemoPersonName` / `isDemoFullName` — placeholder tokens like `test` and pairs like John Doe rejected). Email must be a company work domain (`isDemoWorkEmail` — consumer/free inboxes, disposable/temp mail, and reserved `example.com` / `.test` rejected). Shared helpers live in `@call-agent/contracts`; the marketing form and `RequestDemoDto` both use them. Google Workspace / Microsoft 365 on a custom domain still pass.
- **Integration API keys** are separate from JWT: one secret per `integration_endpoints` row (`ca_live_…`), hashed with SHA-256. Full key returned only on create/rotate. Public CRM routes authenticate with Bearer or `X-Api-Key`, not org-user login.

### HTTP error responses

Every error goes through `HttpExceptionFilter` and returns:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "code": "NOT_FOUND",
  "message": "Call not found"
}
```

`code` is from `@call-agent/contracts` `ErrorCode` (`VALIDATION_FAILED` \| `UNAUTHORIZED` \| `FORBIDDEN` \| `NOT_FOUND` \| `CONFLICT` \| `RATE_LIMITED` \| `BAD_GATEWAY` \| `UNAVAILABLE` \| `INTERNAL`). Swagger documents these with `ErrorResponseDto` (`ApiJwtErrors` / `ApiNotFoundError` / `ApiConflictError` / …).

**Path ids:** `ParseResourceIdPipe('Call')` (not bare `ParseUUIDPipe`). A non-UUID in `/calls/:id` is **404** `Call not found`, not 400 `Validation failed (uuid is expected)`. Request-body validation stays **400**. Portal detail pages render `ResourceNotFound` on 404; unknown dashboard routes do the same (do not bounce logged-in users to `/login`).

**POST status:** Nest POST defaults to 201. Use `@HttpCode(200)` + `@ApiOkResponse` for actions (login, pause, worker complete). Keep 201 + `@ApiCreatedResponse` for real creates.

### Seeded admin

On API boot, if `ADMIN_EMAIL` does not exist in `admins`, create it from env (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`). Do not overwrite an existing admin password.

### Seeded tool profiles + agent templates

On API boot (idempotent):

1. Ensure tool profiles `default` (`endCall`) and `outbound` (`endCall` + booking/lookup/transfer/confirm tools).
2. Ensure platform agents `inbound` / `outbound` with **persona-only** system prompts, `default_task_key=general`, and linked default tool profiles.

Template PATCH does **not** retro-update existing `organization_agents` rows.

### Test inbound / outbound (web)

1. Start API + worker; wait until worker logs show registration with LiveKit.
2. Admin login → `POST /api/admin/calls/test` with `{ "agentKey": "inbound" }` (or `outbound`).
3. Open `meetUrl` from the response; allow microphone; talk to the agent.
4. Repeat with the other `agentKey` to verify the other persona.
5. Optionally `GET /api/admin/calls/:id` to inspect the persisted call row.

SIP trunks are **not** required for this web path.

### Outbound SIP call (API-owned dial)

**Who dials:** the **API** (`CreateSIPParticipant`). The worker is voice-only (no SIP dial).

1. Create org → assign platform **outbound** agent → link/create SIP trunk (`livekitTrunkId` + numbers).
2. Start API + worker (`API_BASE_URL` + `WORKER_CALLBACK_SECRET` set).
3. `POST /api/admin/calls/outbound` with `organizationId`, `organizationAgentId`, `context.phoneNumber` (or `toNumber`).
4. Flow: create `calls` row → LiveKit room → agent dispatch → **CreateSIPParticipant** → status `dialing` (or `ready` if `waitUntilAnswered: true`).
5. Worker waits for the SIP participant, greets, converses; on end POSTs transcript/usage to internal complete.
6. `GET /api/admin/calls/:id` for transcript, usage, timestamps.

Continuous dialing: fire many `POST /outbound` requests; each call is independent. Default `waitUntilAnswered: false` so the HTTP response returns quickly.

## API layout

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/admin/login` | public |
| GET | `/api/auth/admin/me` | admin JWT |
| PATCH | `/api/auth/admin/me` | admin JWT — update display name |
| POST | `/api/auth/login` | public (org user) |
| GET | `/api/auth/me` | user JWT — profile includes `createdAt` / `updatedAt` |
| PATCH | `/api/auth/me` | user JWT — update display name |
| POST | `/api/auth/password` | user JWT — change password (current + new); confirmation email |
| POST | `/api/auth/admin/password` | admin JWT — change password |
| POST | `/api/auth/set-password` | public — complete invite (`email` + `organizationSlug` + token + newPassword) |
| POST | `/api/auth/forgot-password` | public — always `{ ok: true }`; reset email if password set, invite if not |
| POST | `/api/auth/reset-password` | public — complete user reset |
| POST | `/api/auth/admin/forgot-password` | public — always `{ ok: true }` |
| POST | `/api/auth/admin/reset-password` | public — complete admin reset |
| POST | `/api/otp/send` | public — get-demo WhatsApp code (`OtpAbuseGuard`); returns `challengeId` only. Template `speeko_ai` via `WHATSAPP_URL` |
| POST | `/api/otp/verify` | public — checks the code server-side; returns a single-use `verificationToken` bound to that phone. Wrong/expired/locked share one error |
| POST | `/api/demo/request` | public — marketing get-demo; requires `verificationToken` from `/otp/verify` for the same phone; `DemoAbuseGuard` (origin + rate limits); real person name + work email (`isDemoPersonName` / `isDemoWorkEmail`); best-effort GHL contact upsert, then proxy to `ENDPOINT_URL` with `SPEEKO_API` (integration enqueue → queue dial) |
| POST | `/api/admin/organizations` | admin JWT |
| GET | `/api/admin/organizations` | admin JWT |
| GET | `/api/admin/organizations/:id` | admin JWT |
| POST | `/api/admin/organizations/:orgId/users` | admin JWT — create member **without** a password; emails set-password invite |
| GET | `/api/admin/organizations/:orgId/users` | admin JWT — list (includes `hasPassword`, never the hash) |
| POST | `/api/admin/organizations/:orgId/users/:userId/invite` | admin JWT — re-send invite; 409 if password already set |
| GET | `/api/admin/tool-profiles` | admin JWT |
| GET | `/api/admin/tool-profiles/:id` | admin JWT |
| GET | `/api/admin/agents` | admin JWT |
| GET | `/api/admin/agents/:id` | admin JWT |
| PATCH | `/api/admin/agents/:id` | admin JWT |
| GET | `/api/admin/organizations/:orgId/agents` | admin JWT — list org agent configs |
| POST | `/api/admin/organizations/:orgId/agents` | admin JWT — create from template (`agentId`, optional `name`/`slug`/profile; inbound requires task, outbound must omit); multiple per template OK |
| POST | `/api/admin/organizations/:orgId/agents/:id/clone` | admin JWT — clone config (`name`, optional `slug`) |
| GET | `/api/admin/organizations/:orgId/agents/:id` | admin JWT |
| PATCH | `/api/admin/organizations/:orgId/agents/:id` | admin JWT — name/slug, persona, hooks, tools, inbound task (required), active. Outbound must not send `defaultTaskKey` |
| DELETE | `/api/admin/organizations/:orgId/agents/:id` | admin JWT — blocked if referenced (integrations / FK RESTRICT) |
| GET | `/api/users/agent-templates` | user JWT — list platform templates (starters for create) |
| GET | `/api/users/agents` | user JWT — list org agent configs (many per template allowed) |
| POST | `/api/users/agents` | user JWT — create org agent from template (`agentId`, optional `name`/`slug`/`toolProfileId`; inbound requires `defaultTaskKey`, outbound must omit it) |
| POST | `/api/users/agents/:id/clone` | user JWT — clone config (`name`, optional `slug`) |
| GET | `/api/users/agents/:id` | user JWT — get one org agent |
| PATCH | `/api/users/agents/:id` | user JWT — update name/slug, system prompt, onEnter/onExit, inbound task (required) / profile / active. Outbound PATCH must not send `defaultTaskKey` |
| DELETE | `/api/users/agents/:id` | user JWT — delete org agent config (blocked if referenced by integrations / dispatch rules) |
| GET | `/api/users/tool-profiles` | user JWT — list tool profiles (platform + own org custom) |
| GET | `/api/users/tool-profiles/known-tools` | user JWT — org allowlist (admin-assigned; `null` row = full catalog, new orgs `endCall` only) for profile create |
| GET | `/api/users/tool-profiles/:id` | user JWT — get one tool profile (platform or own org) |
| POST | `/api/users/tool-profiles` | user JWT — create custom org profile (`name`, optional `key`, `toolIds` ⊆ allowlist) |
| PATCH | `/api/users/tool-profiles/:id` | user JWT — update own custom profile (not platform seeds; `toolIds` ⊆ allowlist) |
| DELETE | `/api/users/tool-profiles/:id` | user JWT — delete own custom profile if unused by agents |
| GET | `/api/users/integration-endpoints` | user JWT — list CRM dial endpoints (no secrets) |
| POST | `/api/users/integration-endpoints` | user JWT — create endpoint; returns full `apiKey` once + `endpointPath` |
| GET | `/api/users/integration-endpoints/:id` | user JWT — get one (no secret) |
| PATCH | `/api/users/integration-endpoints/:id` | user JWT — update agent/task/trunk/queue/defaultContext/isActive |
| POST | `/api/users/integration-endpoints/:id/rotate-key` | user JWT — new secret once; invalidates old |
| DELETE | `/api/users/integration-endpoints/:id` | user JWT — delete endpoint (revokes access) |
| GET | `/api/users/integrations` | user JWT — list org connections (nylas / ghl / ghl_contacts / ghl_crm / whatsapp; no api_key) |
| POST | `/api/users/integrations` | user JWT — add a provider-specific connection; calendar, contacts, CRM, and Meta fields follow the provider DTO |
| POST | `/api/users/integrations/ghl/calendars` | user JWT — unsaved GHL v3 list calendars (`apiKey` + `locationId`; does not persist) |
| GET | `/api/users/integrations/:id` | user JWT — get one (no secret) |
| PATCH | `/api/users/integrations/:id` | user JWT — update fields / optional new apiKey / isActive |
| DELETE | `/api/users/integrations/:id` | user JWT — delete connection (agent FKs SET NULL) |
| POST | `/api/users/integrations/:id/test` | user JWT — provider-specific connection smoke test; a contacts-access test does not prove all CRM scopes |
| GET | `/api/users/whatsapp/webhook-config` | user JWT — current WhatsApp webhook config (callback URL + token prefix; no raw token) |
| GET | `/api/users/whatsapp/webhook-events` | user JWT — latest 50 webhook posts for the caller org, plus unmatched (`organization_id` null) posts; other orgs omitted |
| POST | `/api/users/whatsapp/webhook-config` | user JWT — generate/rotate verify token (or store optional `verifyToken` from Meta) + `phoneNumberId` / `wabaId` (at least one); raw token once |
| GET | `/api/users/whatsapp/outbound/templates` | user JWT — live Meta templates for the org `whatsapp` connection (`GET /{waba_id}/message_templates`); each has `sendable` + `unsendableReason` (only APPROVED, non-AUTH, text-only header/body, supported buttons) |
| GET | `/api/users/whatsapp/outbound/contacts` | user JWT — GHL contacts via the org ghl_contacts or explicitly selected ghl_crm connection (`?query=&cursor=`, 25/page, opaque `nextCursor`) |
| POST | `/api/users/whatsapp/outbound/send` | user JWT — send an approved template to 1–50 selected contacts from the org `phone_number_id` (200). Per-recipient results; DND / invalid / duplicate / empty-variable contacts are `skipped`, Meta errors are `failed` (never aborts the batch). Variables map to contact fields or custom text |
| GET | `/api/users/whatsapp/outbound/messages` | user JWT — latest 100 outbound rows for the caller org |
| GET | `/api/users/whatsapp/agent` | user JWT — org WhatsApp persona, taskKey, bookingVoiceAgentId, whatsappToolProfileId, and read-only platformPrompt example; available before an org connection is added |
| PATCH | `/api/users/whatsapp/agent` | user JWT — set/clear systemPrompt (max 20000), optional taskKey, bookingVoiceAgentId, whatsappToolProfileId; task/tool/source requirements gate auto-replies |
| GET | `/api/webhooks/whatsapp` | public (no JWT) — Meta `hub.mode` / `hub.verify_token` / `hub.challenge` parsed from the raw query string; 200 `text/plain` challenge (org hash or `WHATSAPP_VERIFY_TOKEN`) or 403 |
| POST | `/api/webhooks/whatsapp` | public — persist raw JSON (empty → `{ raw: null }`) and eligible org/platform text turns before 200; ingestion errors allow Meta retry. The durable worker/outbox produces replies asynchronously. Exact `/new` fences stale work and resets durable memory. |
| POST | `/api/internal/calls/:callId/calendar/free-busy` | worker secret — free/busy for call’s agent calendar |
| POST | `/api/internal/calls/:callId/calendar/events/list` | worker secret — list events |
| POST | `/api/internal/calls/:callId/calendar/events` | worker secret — create event |
| POST | `/api/internal/calls/:callId/calendar/events/cancel` | worker secret — cancel/delete event |
| POST | `/api/internal/calls/:callId/ghl-calendar/free-slots` | worker secret — org GHL open slots only |
| POST | `/api/internal/calls/:callId/ghl-calendar/contacts/lookup` | worker secret — org GHL lookup contact by email/phone; persists `ghlContactId` when found |
| POST | `/api/internal/calls/:callId/ghl-calendar/contacts` | worker secret — org GHL upsert contact; persists `ghlContactId` on the call |
| POST | `/api/internal/calls/:callId/ghl-calendar/appointments` | worker secret — org GHL book appointment |
| POST | `/api/integrations/:publicId/calls` | integration API key — thin enqueue (`phoneNumber` + optional `context` / `externalId`) |
| GET | `/api/admin/tool-profiles` | admin JWT — list platform tool profiles |
| GET | `/api/admin/tool-profiles/known-tools` | admin JWT — known worker tool ids |
| POST | `/api/admin/tool-profiles` | admin JWT — create platform profile (`name`, optional `key`, `toolIds`) |
| PATCH | `/api/admin/tool-profiles/:id` | admin JWT — update platform profile |
| DELETE | `/api/admin/tool-profiles/:id` | admin JWT — delete platform profile if unused by agents/templates |
| GET | `/api/admin/organizations/:orgId/tool-profiles` | admin JWT — platform + that org’s custom profiles (for assign) |
| GET | `/api/admin/organizations/:orgId/tools` | admin JWT — org worker-tool allowlist (`{ toolIds }`; `null` row returns the full registry so existing tenants keep tools) |
| PATCH | `/api/admin/organizations/:orgId/tools` | admin JWT — replace allowlist; unknown ids 400; `endCall` always included |
| GET | `/api/users/sip-trunks` | user JWT — list all SIP trunks for caller's org (password redacted) |
| GET | `/api/users/sip-trunks/:id` | user JWT — get one SIP trunk for caller's org |
| GET | `/api/users/sip-trunks/outbound` | user JWT — list outbound trunks |
| GET | `/api/users/sip-trunks/outbound/:id` | user JWT — get one outbound trunk |
| POST | `/api/users/sip-trunks/outbound` | user JWT — link existing LiveKit `ST_…` **or** provision outbound trunk (`direction=outbound`, status `live`) |
| PATCH | `/api/users/sip-trunks/outbound/:id` | user JWT — update local outbound fields (name/numbers/active/auth; no LiveKit re-sync) |
| DELETE | `/api/users/sip-trunks/outbound/:id` | user JWT — local row only (does not delete LiveKit trunk) |
| GET | `/api/users/sip-trunks/inbound` | user JWT — list inbound trunks |
| GET | `/api/users/sip-trunks/inbound/:id` | user JWT — get one inbound trunk |
| POST | `/api/users/sip-trunks/inbound` | user JWT — save inbound trunk **draft** (or link existing LiveKit id) |
| PATCH | `/api/users/sip-trunks/inbound/:id` | user JWT — update local inbound draft (no LiveKit auto-sync) |
| DELETE | `/api/users/sip-trunks/inbound/:id` | user JWT — if live, delete LiveKit trunk (`ST_…`) then local row; drafts local-only |
| POST | `/api/users/sip-trunks/inbound/:id/publish` | user JWT — `CreateSIPInboundTrunk`; 409 if already live |
| GET | `/api/users/sip-dispatch-rules` | user JWT — list dispatch rules |
| GET | `/api/users/sip-dispatch-rules/:id` | user JWT — get one dispatch rule |
| POST | `/api/users/sip-dispatch-rules` | user JWT — save dispatch rule **draft** |
| PATCH | `/api/users/sip-dispatch-rules/:id` | user JWT — update local draft (no LiveKit auto-sync) |
| DELETE | `/api/users/sip-dispatch-rules/:id` | user JWT — local row only |
| POST | `/api/users/sip-dispatch-rules/:id/publish` | user JWT — `CreateSIPDispatchRule` (trunks must be live first); 409 if already live |
| POST | `/api/users/inbound/publish` | user JWT — publish selected or all draft inbound trunks then dispatch rules |
| POST | `/api/users/calls` | user JWT — bulk enqueue 1–50 **pending** outbound SIP calls (creates `call_batches` + rows; API dialer claims) |
| POST | `/api/users/calls/:id/cancel` | user JWT — cancel one **pending** call |
| POST | `/api/users/calls/:id/retry` | user JWT — force `next_attempt_at=now` (pending/failed) |
| POST | `/api/users/calls/:id/prioritize` | user JWT — bump pending call priority |
| POST | `/api/users/calls/outbound` | user JWT — immediate SIP outbound for caller's org (org id from JWT, not body) |
| POST | `/api/users/calls/test` | user JWT — web test for an **organization agent** (Meet URL) |
| GET | `/api/users/calls` | user JWT — list calls for caller's org (`?bucket=pending\|in_progress\|done`, `?status=`, `?batchId=`; includes `cost`) |
| GET | `/api/users/calls/:id` | user JWT — get call by id (same org only; else 404; includes `cost`) |
| GET | `/api/users/costs/summary` | user JWT — LiveKit list-price totals for caller org (`from`/`to`); org from JWT, no markup. Recompute stays admin-only |
| GET | `/api/users/queue/settings` | user JWT — org dial queue settings |
| PATCH | `/api/users/queue/settings` | user JWT — update concurrency/retries/quiet hours |
| POST | `/api/users/queue/pause` | user JWT — pause org dialer claims |
| POST | `/api/users/queue/resume` | user JWT — resume org dialer |
| GET | `/api/users/queue/stats` | user JWT — live pollable queue stats + last 14 UTC days of call volume (`daily`) |
| GET | `/api/users/queue/batches` | user JWT — list call batches |
| GET | `/api/users/queue/batches/:id` | user JWT — batch + per-status counts |
| POST | `/api/users/queue/batches/:id/pause` | user JWT |
| POST | `/api/users/queue/batches/:id/resume` | user JWT |
| POST | `/api/users/queue/batches/:id/cancel` | user JWT — cancel batch; pending calls → cancelled |
| GET | `/api/admin/queue/stats` | admin JWT — platform + per-org queue stats |
| GET/PATCH | `/api/admin/organizations/:orgId/queue/settings` | admin JWT |
| POST | `/api/admin/organizations/:orgId/queue/pause\|resume` | admin JWT |
| GET | `/api/admin/organizations/:orgId/queue/stats` | admin JWT |
| GET | `/api/admin/organizations/:orgId/sip-trunks` | admin JWT |
| POST | `/api/admin/organizations/:orgId/sip-trunks` | admin JWT — link or provision outbound trunk |
| GET | `/api/admin/organizations/:orgId/sip-trunks/:id` | admin JWT |
| PATCH | `/api/admin/organizations/:orgId/sip-trunks/:id` | admin JWT |
| DELETE | `/api/admin/organizations/:orgId/sip-trunks/:id` | admin JWT — local row only |
| POST | `/api/admin/calls/test` | admin JWT — web test: platform template + Meet token |
| POST | `/api/admin/calls/outbound` | admin JWT — SIP outbound: room + dispatch + CreateSIPParticipant |
| GET | `/api/admin/calls` | admin JWT — list recent calls (all orgs) |
| GET | `/api/admin/calls/:id` | admin JWT — get call by id (includes transcript/usage/`cost` when present) |
| GET | `/api/admin/costs/summary` | admin JWT — LiveKit list-price totals (`from`/`to`/`organizationId`); no markup |
| POST | `/api/admin/costs/recompute` | admin JWT — backfill `calls.cost` from stored usage + timestamps |
| POST | `/api/internal/calls/inbound` | worker secret (`X-Worker-Secret`) — upsert inbound SIP `calls` row by `roomName` (job start; returns `id` for complete). Idempotent; terminal rows are not reopened. |
| POST | `/api/internal/organization-agents/:id/job-metadata` | worker secret — live inbound pack of persona / tools / voice / realtime vs pipeline. Body `{ organizationId }`. Dispatch-rule metadata is a pointer; each ring re-reads the current org agent so Voice-tab saves apply without republish. |
| POST | `/api/internal/calls/:id/complete` | worker secret (`X-Worker-Secret`) — persist transcript/usage/status + cost snapshot. Idempotent on terminal rows (fill missing). Ignored when the row is `pending` / `creating` (late callback after requeue/claim). |

**User vs admin call/SIP notes:** Org user routes always scope by JWT `orgId` (never accept client `organizationId`). **Outbound** trunks: org users may create/link/update/delete local rows under `/api/users/sip-trunks/outbound` (same shape as admin; always `direction=outbound`). **Inbound** trunks + dispatch rules: draft then publish under `/api/users/sip-trunks/inbound` and dispatch-rule routes. Platform admin retains full `/api/admin/organizations/:orgId/sip-trunks` (any direction list + outbound create). Within-org roles (`org_admin` etc.) are stored but **not enforced** yet. User web test uses an assigned org agent (effective persona/tools/task); admin web test uses a platform template key/id. **`POST /api/users/calls`** enqueues pending rows + `call_batches`; the **API queue dialer** claims and dials under org settings. Use **`POST …/calls/outbound`** for immediate single dial (bypasses queue concurrency).
### Inbound save → publish flow

1. `POST /api/users/sip-trunks/inbound` — draft with `numbers` (+ optional auth / allowed callers).
2. `POST /api/users/sip-dispatch-rules` — draft with `ruleType` (default `individual`), `roomPrefix` (default `call-`), `sipTrunkIds`, optional `organizationAgentId`.
3. `POST /api/users/inbound/publish` (or per-resource `…/publish`) — creates LiveKit inbound trunk(s) then dispatch rule(s). Dispatch rule `roomConfig.agents` uses `LIVEKIT_AGENT_NAME` (or `agentName`) and packs org-agent ids + a snapshot of persona/tools/task when `organizationAgentId` is set. **The worker re-fetches live job metadata on each inbound ring** (`POST /api/internal/organization-agents/:id/job-metadata`) so changing Voice (realtime vs Inworld) or the persona does **not** require republishing the dispatch rule.
4. Point the SIP provider at the LiveKit SIP endpoint for those numbers.

### Agent response shape

Agent APIs return persona + capability profile (not JSON tool schemas):

```json
{
  "id": "...",
  "key": "inbound",
  "name": "Booking confirmations",
  "slug": "booking-confirmations",
  "direction": "inbound",
  "prompt": {
    "systemPrompt": "...",
    "onEnterInstructions": null,
    "onExitInstructions": null
  },
  "defaultTaskKey": "general",
  "toolProfileId": "...",
  "calendarIntegrationId": null,
  "enabledTools": ["endCall"],
  "voice": null,
  "model": null,
  "ttsModel": null,
  "sttModel": null,
  "speechLanguage": null,
  "temperature": null,
  "speakingRate": null,
  "deliveryMode": null
}
```

- Platform templates: `key` is the template key; no `slug` / `organizationId` / `calendarIntegrationId`.
- Org-owned rows: `name` + `slug` are org-owned; `key` / `templateKey` are the platform template key; also `organizationId` + `agentId` (template id) + optional `calendarIntegrationId` (Nylas or GHL). Multiple org rows may share the same template. **`defaultTaskKey` is required on inbound org agents; outbound org agents return `null`** (set task on the call or integration).
- Hook fields: `null` = worker default opening/closing; `""` = silent for that hook; non-empty onEnter = exact `sayCached` text on pipeline jobs with Prepared sentences On, otherwise custom `generateReply` instructions; non-empty onExit = verbatim `session.say` line. Task-defined sentence/silent opening takes priority.

### Job metadata shape (API → worker)

Canonical TypeScript type: `AgentJobMetadata` in `@call-agent/contracts`. Inbound SIP dispatch omits `callId` (static at publish) and includes `organizationAgentId`.

```json
{
  "callId": "...",
  "organizationId": "...",
  "organizationAgentId": "...",
  "agentKey": "outbound",
  "direction": "outbound",
  "medium": "sip",
  "task": "demo_booking",
  "prompt": {
    "systemPrompt": "...",
    "onEnterInstructions": null,
    "onExitInstructions": null
  },
  "enabledTools": ["endCall", "confirmAppointment", "lookupCustomer"],
  "context": { "firstName": "Ada", "email": "ada@example.com", "company": "Acme" },
  "participantIdentity": "+91...",
  "voice": null,
  "model": null,
  "ttsModel": null,
  "sttModel": null,
  "speechLanguage": null,
  "temperature": null,
  "speakingRate": null,
  "deliveryMode": null
}
```

Model, speech language, voice and delivery semantics are defined in [contracts catalogs](../../packages/contracts/AGENTS.md) and the [voice runtime reference](../worker/docs/runtime.md). API packers resolve template fallbacks and validate catalog compatibility; credentials never enter metadata. Price catalog remains API-owned.

Outbound: `POST /api/admin/calls/outbound` (and user enqueue / dial / integration) accepts optional `task` (defaults to platform template `default_task_key` → `general` — **not** the org agent). Inbound SIP dispatch packs the org agent’s required `default_task_key`.
Test: `POST /api/admin/calls/test` accepts optional `task` + `context`. Org web test for outbound also sends an explicit task (not stored on the agent).

### Calls vs LiveKit modules

| Module | Role |
|--------|------|
| `calls` | Domain: persist `calls`, resolve agents/tool profiles/task key, pack **runtime** job metadata. Nest surface stays at module root (module, entity, repo, controllers). Split services in `calls/services/`: `CallWebTestService` (Meet test), `CallDialService` (enqueue + immediate/claimed SIP), `CallWorkerService` (inbound ensure + complete), `CallFailureService` (fail/requeue + stale reap), `CallsService` (tape list/get + cancel/retry/prioritize). Pure helpers in `calls/lib/` (state machine, row factory, phone, task key, price wrapper). Job metadata type lives in `@call-agent/contracts`. |
| `queue` | Org queue settings, call batches, atomic admission repository/service + immutable rate ledger, claim ownership/recovery, retry policy, in-process **QueueDialerService**, live stats, user/admin queue controllers |
| `price` | LiveKit **list-price** call cost (STT/LLM/TTS + WebRTC/SIP room). No markup. Catalog in `price.catalog.ts`; `PriceService` prices each worker-complete attempt onto `calls.cost` / `cost_usd`. Org-user summary is JWT-org scoped; admin summary + recompute |
| `tools` | Tool profiles list/seed + org custom CRUD; org tool allowlist (`organizations.allowed_tool_ids`); resolve `enabledTools` ids for metadata (profile ∩ allowlist when org-scoped) |
| `integration-endpoints` | Org CRM dial-in: preconfigured agent/task/trunk/queue + API key; public thin `POST …/calls` enqueue |
| `organization-integrations` | Org credential CRUD/test for nylas, ghl, ghl_contacts, ghl_crm, whatsapp. Calendar linking accepts only nylas/ghl; credentials remain API-side. |
| `crm` | Live org HighLevel workspace through fixed CRM_ACTIONS + strict Zod params; tenant/location/child membership authorization; calls GhlService.crmRequest without env fallback or automatic write retry. |
| `whatsapp` | Hashed webhook configuration and public Meta GET verification/POST persistence. Persist raw events and eligible durable turns before 200; ingestion failure permits retry. |
| `whatsapp-agent` | Agent configuration APIs, booking authorization/helpers, inbound parsing/reset/clock helpers. No model execution or direct reply sending. |
| `whatsapp-harness` | Always-active durable org/platform execution and OTP priority delivery; task sessions, ticker/claims, leases/checkpoints, tool receipts, recovery, and Meta outbox. Dispatches ADK work to the separate worker. |
| `whatsapp-outbound` | Portal approved-template sends from per-org Meta credentials, contacts from ghl_contacts or explicitly selected ghl_crm, per-recipient logs/results. Separate from platform OTP and inbound task turns. |
| `meta-whatsapp` | Thin Graph API adapter only (`MetaWhatsAppClient`: `listTemplates`, `getPhoneNumber`, `sendTemplate`, `sendText`) — no controllers; token passed per call, never logged; fixed origin, `redirect: manual`, 15s timeout, never throws |
| `sip-trunks` | Org SIP trunk CRUD: admin outbound; **user outbound** create/link/update/delete; user inbound draft + publish; combined inbound publish orchestrator |
| `sip-dispatch-rules` | Org dispatch-rule draft CRUD + publish to LiveKit (`CreateSIPDispatchRule` + agent `roomConfig`) |
| `livekit` | Thin adapter only: rooms, dispatch, tokens, **SIP** (`createSipOutboundTrunk`, `createSipInboundTrunk`, `createSipDispatchRule`, `createSipParticipant`, `deleteSipTrunk`, `deleteSipDispatchRule`) — **no** controllers or agent business logic |
| `email` | Thin Plunk adapter only: `EmailService.send()` / `sendText()` — **no** controllers; soft-disabled without `PLUNK_API_KEY`; never throws |

## Code structure (API modules)

Layering per feature module:

```
controller → service → repository → TypeORM entity → Postgres
```

| Layer | Responsibility |
|-------|----------------|
| Controller | HTTP routes, guards, Swagger |
| Service | Business rules, validation errors (`NotFound` / `Conflict`), DTO mapping, password hashing |
| Repository (`*.repository.ts`) | All TypeORM access for that entity (`find` / `save` / `create` / `remove`) |
| Entity | Schema mapping |

- Inject custom repositories into services — **do not** put `@InjectRepository` in services.
- Keep `@InjectRepository(Entity)` only inside the matching `*.repository.ts`.
- Register repositories in the module `providers` alongside services.
- Examples: `admins.repository.ts`, `organizations.repository.ts`, `users.repository.ts`, `agents.repository.ts`, `organization-agents.repository.ts`, `sip-trunks.repository.ts`, `sip-dispatch-rules.repository.ts`, `calls.repository.ts`, `organization-queue-settings.repository.ts`, `call-batches.repository.ts`, `integration-endpoints.repository.ts`, `whatsapp-webhook-configs.repository.ts`, `whatsapp-webhook-events.repository.ts`.
- `users` HTTP is org **members** only (admin create/list/invite). Org-user agent CRUD (`/api/users/agents`, `/api/users/agent-templates`) lives in `agents/user-organization-agents.controller.ts` next to the admin org-agent controller. Do not put agent routes back on `UsersController`.
- URL slugs (`organizations.slug`, org-agent `slug`, tool-profile `key`) use `slugify` / `SLUG_PATTERN` in `apps/api/src/common/slug.ts`. Org-agent empty input falls back to `agent` via `agents/slug.util.ts`. Voice/TTS override fields on template vs org-agent PATCH live in `agents/dto/voice-settings.dto.ts`.
- Pack org-agent LiveKit job metadata with `packOrgAgentJobMetadata` (`apps/api/src/agents/job-metadata.ts`) — inbound SIP dispatch, outbound dial, and org web test. Do not copy prompt/voice/tools assembly. Inbound draft publish batch uses `runPublishBatch` (`sip-trunks/lib/publish-batch.ts`).
- Load an active org agent + template with `requireActiveOrgAgent` (`calls/lib/require-org-agent.ts`) before enqueue, immediate outbound, or org web test. Claimed-queue dial keeps its own failure path. Map call rows with `toCallResponse` (includes `cost` by default).
- Queue env ints parse with `queuePositiveInt` (`queue.defaults.ts`). Dialer tick is `@Interval(QUEUE_DEFAULTS.dialerIntervalMs)`.
- `livekit` is an infrastructure adapter (service only), not a repository-backed domain module.
- `email` is an infrastructure adapter (global `EmailService` only), not a repository-backed domain module. Uses Plunk `POST /v1/send`.
- `ghl` is the infrastructure adapter for GHL HTTP (get-demo lead upsert, tenant calendars/contacts, and live CRM). Worker-secret calendar controllers authorize proxied tools; crm owns the org-JWT workspace. Tenant operations resolve explicit connections; only get-demo uses platform env.
- `otp` owns public phone verification. Delivery always uses encrypted transactional priority outbox work in whatsapp-harness; there is no legacy execution switch. Demo proof consumption is fenced per phone before CRM/dial. Never log codes, proofs, or ciphertext; send never returns codes and verify returns only its documented verification proof.
- `demo` is a thin public proxy (no repository): `DemoAbuseGuard` (origin + rate limits) → consume OTP verification token → GHL upsert (best-effort) → `ENDPOINT_URL` + `SPEEKO_API` → integration enqueue.
- `whatsapp` owns persisted webhook ingest; whatsapp-agent owns configuration/helpers, and the separate worker runs ADK. Harness owns durable execution, source authorization, generation fencing, task closure and outbox sends. Org auto-replies require persona/task/tools/source; empty active org config never falls through to platform. See the durable execution section and worker lifecycle references.
- `queue` uses `QueueAdmissionRepository` transactions for settings-row serialization, capacity/rate/batch decisions, `FOR UPDATE SKIP LOCKED` candidate selection, and lease ownership. Settings/batch controls use their repositories with the same locking order; `QueueClaimService` retains observational counts and stale in-flight discovery only.
- `price` is a catalog + calculator (`PriceService`). Inject it; do not inline LiveKit rates in `calls`. Worker complete appends one cost attempt (including requeue). Call DTOs include `cost` (`null` until priced). Portal shows the snapshot on the org calls tape / dossier and admin all-calls / overview. `GET /api/users/costs/summary` is JWT-org only; `POST /api/admin/costs/recompute` stays admin.

### CRM and durable WhatsApp endpoint families

- `POST /api/users/crm/:integrationId/execute { action, params? }` uses org JWT and the fixed CRM action catalog; read [CRM README](src/crm/README.md) for coverage/scopes and live-account checks.
- Org inspection: `GET /api/users/whatsapp/harness/health`, `/conversations`, `/conversations/:id`. Recovery actions: `POST /api/users/whatsapp/turns/:id/retry`, `/messages/:id/retry`, `/messages/:id/resolve { outcome: accepted|failed }`, HTTP 200. Foreign/platform/OTP records are inaccessible to org users.
- Admin inspection/recovery has the same suffixes under `/api/admin/whatsapp` for platform conversations. `GET /api/admin/whatsapp/otp-deliveries` exposes status metadata only, no code/ciphertext/recipient/credentials; OTP has no manual retry.
- Worker callbacks: `POST /api/internal/whatsapp/turns/:id/heartbeat`, `/checkpoint`, `/complete`, `/fail`, `/tools`, HTTP 200, worker secret plus live UUID lease/generation. Completion/checkpoint shapes use shared WhatsApp contracts and API DTO validation.
- Model dispatch is the private worker's `POST /turns` (202 accepted); health is `GET /health` with taskProtocolVersion 1. These are worker surfaces, not product API endpoints. See [worker instructions](../whatsapp-worker/AGENTS.md).

### Demo request flow

Web form → OTP send → verify → demo request → same-phone proof consumption → best-effort GHL lead upsert → configured integration enqueue → API dialer → voice worker. Origin/rate/validation rejection never enqueues. Successful CRM upsert supplies ghlContactId for calendar booking; CRM failure is nonfatal. Agent/task/trunk are configured on the endpoint, not chosen by the form. Server-only ENDPOINT_URL/SPEEKO_API and get-demo GHL settings are described in [deployment environment reference](../../railway/README.md).

## Testing reference

## Testing

API unit tests use Jest/ts-jest and @nestjs/testing from the monorepo root. API specs live under src/<module>/test, voice specs under src/test/<subsystem>, and the portal currently has pure .spec.ts helpers included by the root Jest config. WhatsApp uses its separate Node runner; Python uses pytest.

### Commands

```bash
# Root Jest suite (all matching .spec.ts files under apps/)
npm test

# One module
npx jest --testPathPatterns=auth/test --no-coverage
npx jest --testPathPatterns=admins/test --no-coverage
npx jest --testPathPatterns=demo/test --no-coverage
npx jest --testPathPatterns=otp/test --no-coverage
npx jest --testPathPatterns=users/test --no-coverage
npx jest --testPathPatterns=organizations/test --no-coverage
npx jest --testPathPatterns=organization-integrations/test --no-coverage
npx jest --testPathPatterns=whatsapp/test --no-coverage
npx jest --testPathPatterns=agents/test --no-coverage
npx jest --testPathPatterns=sip-trunks/test --no-coverage
npx jest --testPathPatterns=sip-dispatch-rules/test --no-coverage
npx jest --testPathPatterns=price/test --no-coverage
npx jest --testPathPatterns=common/test --no-coverage

# Watch / coverage
npm run test:watch
npm run test:cov

# API e2e scaffold (separate config; not the main unit suite)
npm run test:e2e
```

Jest 30 path filter flag: **`--testPathPatterns`** (plural), not `--testPathPattern`.

### Isolated password, calendar, and queue security integration tests

[Password concurrency](src/auth/test/password-lifecycle.postgres.spec.ts), [live calendar authorization](src/call-capabilities/test/call-capabilities.postgres.spec.ts), and [atomic queue admission](src/queue/test/queue-admission.postgres.spec.ts) use real PostgreSQL with mocked mail/provider HTTP. Configure `API_SECURITY_TEST_DATABASE_URL` only for a dedicated disposable database named **`api_security_test`** on **`127.0.0.1:55445`**. The fixture rejects any other host, port, database, or URL options before mutation, and never falls back to the application database. It synchronizes entities and truncates fixture rows only in separate `auth_security_test`, `call_capability_test`, and `queue_admission_test` schemas. Password/queue races use independent connections and barriers based on actual PostgreSQL lock waiters, rather than timing-dependent sleeps. Long ORM SQL may be truncated in `pg_stat_activity`; queue barriers identify waiting queries by their entity/table name and lock wait state.

Run from the monorepo root with the dedicated fixture configured:

```powershell
# Set API_SECURITY_TEST_DATABASE_URL to the dedicated fixture connection URL.
npx jest --testPathPatterns='auth/test|ghl/test|organization-integrations/test|calls/test/configured-dispatch' --runInBand --no-coverage
npx jest --testPathPatterns='password-lifecycle.postgres|call-capabilities.postgres|common/test/api-security-database' --runInBand --no-coverage
npx jest --testPathPatterns='queue/test|calls/test|integration-endpoints/test' --runInBand --no-coverage
npx jest --testPathPatterns='queue/test/queue-admission.postgres' --runInBand --no-coverage
npm run build:api
```

The PostgreSQL suites skip when the variable is unset; a skipped suite does not establish atomicity. Coverage includes same/sibling-token consumption, issuance races, stale verified credentials, expiry after lock acquisition, forced rollback, post-commit email behavior, all eight calendar operation mappings, live revocation/reassignment, tenant/activity checks, pinned task capabilities, current calendar changes, worker authentication, and construction of the actual auth/calendar Nest module graph. The password/calendar refactor added no schema changes; queue admission adds `queue_admissions` and requires schema/Erflow verification. Its suite covers competing organization/rate/batch admissions, retries retaining rate history, quiet hours, inbound/web exclusion, lease ownership/expiry, pause/cancel ordering, stale controls, rollback, independent organizations, lazy settings races, and construction of the actual queue/calls module graph. Release affects only API; the concurrency guarantees require every API replica to run the new paths. Use the normal deployment runbook and smoke-test test principals/provider fixtures before release.

### Layout & conventions

```
apps/api/src/<module>/test/
  <name>.spec.ts
  helpers/                 # optional shared mocks
```

| Rule | Detail |
|------|--------|
| **Target** | Services, guards, strategies, pure utils — where business rules live |
| **Skip by default** | Thin controllers (one-line pass-through), TypeORM repositories (pass-through), entities, Swagger DTOs |
| **Dependencies** | Mock repositories / sibling services / `ConfigService` / external I/O (`fetch`, LiveKit, Plunk) — **no real Postgres** in mocked unit tests; separately gated harness and password/calendar/queue security integration suites use their documented isolated fixtures |
| **Nest wiring** | `Test.createTestingModule` with `{ provide: X, useValue: mock }` **or** `new Service(mockDeps)` for simple constructors |
| **Assertions** | Exception **types** + important user-facing messages; call args to mocks; return shapes |
| **Security** | Prefer explicit cases for authz, tenant isolation, secret redaction, inactive principal rejection |
| **IDE noise** | `apps/api/tsconfig.app.json` excludes `**/*spec.ts` from Nest build. Red squiggles in the editor are often ESLint type-checked rules on mocks, not failed tests — trust `npm test` |

### What to test per layer

| Layer | Unit-test? | Focus |
|-------|------------|--------|
| Service | **Yes** | Happy path, not-found/conflict, normalization, org scoping, status gates |
| Guard / strategy | **Yes** | Allow/deny matrix, principal shape from DB, worker secret, rate limit |
| Controller | Optional | Only if non-trivial orchestration; else covered via service + thin guard tests |
| Repository | Integration where necessary | Atomic state changes and joined authorization require the isolated PostgreSQL suites; omit unit tests that only mirror TypeORM calls |
| Voice worker | Yes, existing src/test suites | Mock sessions/providers; lifecycle, builders, workflows, pure helpers and callback contracts |
| Portal / web SPA | Limited | Root Jest includes portal pure helper specs; no dedicated Vitest/Playwright script currently exists |

### Checklist when adding a module suite

1. Create `apps/api/src/<module>/test/<focus>.spec.ts`.
2. Mock all I/O (repo, `fetch`, ConfigService, LivekitService, EmailService).
3. Cover success + primary failure paths (404/409/401/403/503 as applicable).
4. For multi-tenant code: assert **org A cannot read/mutate org B**.
5. For secrets: assert response mappers / services never return hashes or full keys (except documented create/rotate once).
6. Run `npx jest --testPathPatterns=<module>/test --no-coverage` and fix failures before commit.
7. Update coverage references when suites move/add/remove; do not label a suite passing without running it.

### Not in unit tests (use manual / deploy smoke)

- LiveKit room/SIP against real cloud
- End-to-end inbound ring against LiveKit Cloud (unit tests cover ensure + complete; not a real SIP INVITE)
- Railway production DB / `synchronize` side effects
- Marketing get-demo against real `ENDPOINT_URL` (unit suite mocks `fetch`)

## Existing coverage references

These are inspected checked-in suites, not a run report. Prefer security → money/dial side effects → tenant data → adapters. Concrete references identify actual suites; the original scenarios are retained below without historical Done/Todo claims. Suite presence does not establish exhaustive coverage.

- auth: [auth.service.spec.ts](src/auth/test/auth.service.spec.ts); inspect sibling specs for further cases.
- admins: [admins.service.spec.ts](src/admins/test/admins.service.spec.ts); inspect sibling specs for further cases.
- organizations: [organizations.service.spec.ts](src/organizations/test/organizations.service.spec.ts); inspect sibling specs for further cases.
- users: [users.service.spec.ts](src/users/test/users.service.spec.ts); inspect sibling specs for further cases.
- agents: [organization-agents.service.spec.ts](src/agents/test/organization-agents.service.spec.ts); inspect sibling specs for further cases.
- tools: [tool-profiles.service.spec.ts](src/tools/test/tool-profiles.service.spec.ts); inspect sibling specs for further cases.
- common: [http-exception.filter.spec.ts](src/common/test/http-exception.filter.spec.ts); inspect sibling specs for further cases.
- demo: [demo.service.spec.ts](src/demo/test/demo.service.spec.ts); inspect sibling specs for further cases.
- otp: [otp.service.spec.ts](src/otp/test/otp.service.spec.ts); inspect sibling specs for further cases.
- calls: [call-state-machine.spec.ts](src/calls/test/call-state-machine.spec.ts); inspect sibling specs for further cases.
- queue: [queue-claim.service.spec.ts](src/queue/test/queue-claim.service.spec.ts); inspect sibling specs for further cases.
- price: [price.calculator.spec.ts](src/price/test/price.calculator.spec.ts); inspect sibling specs for further cases.
- sip-trunks: [sip-trunks.service.spec.ts](src/sip-trunks/test/sip-trunks.service.spec.ts); inspect sibling specs for further cases.
- sip-dispatch-rules: [sip-dispatch-rules.service.spec.ts](src/sip-dispatch-rules/test/sip-dispatch-rules.service.spec.ts); inspect sibling specs for further cases.
- organization-integrations: [organization-integrations.service.spec.ts](src/organization-integrations/test/organization-integrations.service.spec.ts); inspect sibling specs for further cases.
- crm: [crm.service.spec.ts](src/crm/test/crm.service.spec.ts); inspect sibling specs for further cases.
- whatsapp: [extract-whatsapp-webhook.spec.ts](src/whatsapp/test/extract-whatsapp-webhook.spec.ts); inspect sibling specs for further cases.
- whatsapp-agent: [whatsapp-booking.service.spec.ts](src/whatsapp-agent/test/whatsapp-booking.service.spec.ts); inspect sibling specs for further cases.
- whatsapp-harness: [whatsapp-harness.service.spec.ts](src/whatsapp-harness/test/whatsapp-harness.service.spec.ts); inspect sibling specs for further cases.
- whatsapp-outbound: [whatsapp-outbound.service.spec.ts](src/whatsapp-outbound/test/whatsapp-outbound.service.spec.ts); inspect sibling specs for further cases.
- meta-whatsapp: [meta-whatsapp.client.spec.ts](src/meta-whatsapp/test/meta-whatsapp.client.spec.ts); inspect sibling specs for further cases.
- email: [email.service.spec.ts](src/email/test/email.service.spec.ts); inspect sibling specs for further cases.
- ghl: [ghl-calendar.service.spec.ts](src/ghl/test/ghl-calendar.service.spec.ts); inspect sibling specs for further cases.
- livekit: [livekit.service.spec.ts](src/livekit/test/livekit.service.spec.ts); inspect sibling specs for further cases.

- Voice lifecycle/metadata/builders/workflows/speech: [worker test tree](../worker/src/test); command `npx jest --testPathPatterns=worker/src/test --no-coverage`.
- WhatsApp execution/recovery: [runner.test.mjs](../whatsapp-worker/test/runner.test.mjs); command `npm run test:whatsapp-worker` builds ESM then runs Node tests.
- Sarvam sidecar protocol/server: [Python tests](../stt-sarvam/tests); command `npm run test:stt-sarvam`.
- Portal outcome mapping: [call-outcome.spec.ts](../portal/src/lib/call-outcome.spec.ts); command `npx jest --testPathPatterns=portal/src/lib/call-outcome --no-coverage`.
- Integration-endpoints currently has no dedicated module test folder; do not interpret the absence of a coverage table status as completed coverage.

## Isolated harness PostgreSQL integration suite

[whatsapp-harness.postgres.spec.ts](src/whatsapp-harness/test/whatsapp-harness.postgres.spec.ts) skips when WHATSAPP_TEST_DATABASE_URL is unset. When enabled it requires exactly host 127.0.0.1, port 55439, database whatsapp_harness_test; it mutates that isolated fixture. Never point it at another DB, shared local data, or production. Supply fixture credentials through local environment, not documentation/commits. Run it deliberately using `npx jest --testPathPatterns=whatsapp-harness/test/whatsapp-harness.postgres --runInBand --no-coverage` after preparing the isolated cluster.

The suite covers real transactional concurrency/reset/lease/OTP/task-session fences and restart/recovery scenarios, while upstream Meta/GHL/model calls remain mocked. See [TASK-SESSIONS](../whatsapp-worker/TASK-SESSIONS.md) for acceptance scenarios. Root Jest without this environment does not validate real PostgreSQL concurrency.

## Regression scenarios retained from the original guide

These are the original risk-based scenarios, preserved as a change checklist rather than a claim that every scenario has passed on this revision. The linked suites above identify actual checked-in tests. Inspect those suites before deciding which cases remain; historical Done/Todo labels are not current test results.

| Module | Scenarios and remaining work noted in the original guide |
| --- | --- |
| `auth` | Login isolation, inactive admin/user/org, JWT live revalidation, Admin/User/WorkerSecret guards, login rate limit, protected routes, self-service display-name PATCH |
| `admins` | Email normalize, findById/email, create defaults (`isActive`, name) |
| `demo` | Config gate (503), body shaping, `fetch` proxy, 401/403 vs generic 502, GHL upsert before enqueue (CRM fail does not block dial), origin + IP/phone/email/global rate limits, lead quality (real person name + work email; `test` / `test@example.com` rejected), unverified phone does not enqueue |
| `otp` | HMAC code never returned, wrong/expired/locked codes, resend burns the previous code, Graph template body (mocked `fetch`), token single-use and phone mismatch, origin + send/verify rate limits |
| `whatsapp-harness` platform / OTP | Platform/org routing isolation + durable reset fencing, independent sender tick, encryption/AAD/tamper tests, original OTP template/version, priority dispatch, expiry/ambiguous sends/429 retry, real PostgreSQL concurrent issuance/send/verify/proof fencing + restart recovery, admin-only diagnostics (no ciphertext) |
| `users` | Create user, org scope, password hash, unique email per org, toSafeUser redaction |
| `organizations` | Create org, slug uniqueness/lowercase, name trim, `isActive` default, `allowedToolIds: ['endCall']` seed, findById/Slug/IdOrSlug |
| `common` (HTTP errors) | Exception filter body (`code` + `statusCode`), unknown throws do not leak, `ParseResourceIdPipe` 404 on non-UUID path ids |
| `integration-endpoints` | API key hash/prefix, rotate, public enqueue merge context, inactive key reject, never leak secrets |
| `queue` | Real PostgreSQL competing admissions enforce organization/rate/batch ceilings, eligibility, lease ownership, control ordering and rollback; unit coverage retains retry classification/backoff, quiet hours, stale in-flight discovery and dialer orchestration. Inbound/web rows never consume outbound SIP capacity/rate budget. |
| `calls` | Enqueue vs immediate outbound, metadata pack, complete + requeue, org scoping on list/get, **state machine** (`taskCompleted` → completed vs incomplete), cost snapshot on complete (append / fill / requeue-before-reset), late complete on pending/creating ignored, **inbound SIP ensure** (upsert by room, never requeue, stale inbound terminal-fail) |
| `agents` / org agents | Create/clone/slug collision, persona vs template isolation, hook null/empty/whitespace, calendar same-org FK, FK-blocked delete, voice/speakingRate/deliveryMode copy + template fallback |
| `tools` (profiles) | Org allowlist lazy-repair / replace / unknown-id reject; org custom create blocked when tool not assigned; `resolveEnabledToolIds` intersects with org allowlist (platform templates unfiltered); org A vs B isolation. Remaining: platform vs org custom CRUD, delete-if-unused |
| `price` | Gemma/Nova-3/Inworld list-price math, web vs SIP room lines, self-hosted vs Cloud agent session, 10s min, unknown models, attempt rollup, admin summary SQL, recompute skip/404, org-user summary JWT-org scoped, Sarvam Saaras/Bulbul INR list converted to USD |
| `sip-trunks` / `sip-dispatch-rules` | Draft vs publish, password redaction, inbound LiveKit delete (404 ignore), dispatch metadata pack, LiveKit adapter mocked |
| `organization-integrations` | Secrets never returned (mapper + CRUD), Nylas + GHL create/test, calendar resolve/freeBusy matrix (Nylas mocked) |
| `whatsapp` | Hashed verify-token generate/rotate, routing/preview, durable ingestion before acknowledgement with retryable persistence failures, public GET/POST HTTP + Swagger/no JWT, org scoping; harness covers durable `/new` fencing and asynchronous replies. |
| `email` | Soft-disable without key, never throws, Plunk `send` / `sendText`, never log API key |
| `ghl` | Soft-disable without key/location, upsert + tags/note, org calendar creds + listCalendars, never throws, never log token, free-slots map + ms query, `lookupGhlContact` / `upsertGhlContact` persist `ghlContactId`, phone-like `contactId` ignored, contact-not-found ≠ busy slot, book does not create contacts, hide existing events |
| `livekit` | URL helper; adapter with mocked SDK (rooms, dispatch, token/meet, SIP trunks/rules/participant, hasRemoteCallee) |
| `whatsapp-outbound` / `meta-whatsapp` | Template parse (positional/named/URL button, unsendable reasons), component build + phone normalize, service (approved-only, skip DND/invalid/duplicate/empty, per-recipient failures do not abort, org scoping, no token in results/logs), Graph client payloads/paging/redirect refusal/error redaction/`sendText`, `ghl_contacts` + `whatsapp` integration create/update/test/redaction/singleton + `system_prompt` agent GET/PATCH, `GhlService.listContacts` (limit clamp, cursor, errors), calendar link rejects non-calendar providers |

## Local runtime environment

Names/defaults below are documented configuration, never real credential values. Commands run from the monorepo root. Deployment selection and secret references belong to Railway AGENTS.md.

| Variable | Used by | Behavior/default |
| --- | --- | --- |
| `LIVEKIT_URL` | API + worker | `wss://…livekit.cloud` |
| `LIVEKIT_API_KEY` | API + worker | Project API key |
| `LIVEKIT_API_SECRET` | API + worker | Project API secret |
| `LIVEKIT_AGENT_NAME` | API + worker | Explicit dispatch name (default `call-agent`) |
| `LIVEKIT_PRICING_PLAN` | API | LiveKit list-price catalog: `build` \| `ship` (default) \| `scale`. Overage rates for personal call-cost analysis (no markup, ignores included monthly credits). |
| `LIVEKIT_AGENT_DEPLOYED` | API | `true` only if the worker is a LiveKit Cloud hosted agent (charges $0.01/min agent-session). Default off — Railway self-hosted worker counts as WebRTC minutes instead. |
| `LIVEKIT_SIP_VENDOR_USD_PER_MIN` | API | Optional SIP carrier estimate (Telnyx/Twilio) in USD/min. Default `0` = LiveKit charges only. |
| `API_BASE_URL` | worker + API | Worker → API origin (may be `http://api.railway.internal:3000` in production). Local default `http://localhost:3000`. |
| `API_PUBLIC_URL` | API | Optional public HTTPS origin for Meta WhatsApp callback URLs (e.g. `https://api-production-4df4.up.railway.app`). No trailing slash, no `/api` suffix. When unset, a public `API_BASE_URL` is used; private/internal hosts fall back to `https://{RAILWAY_PUBLIC_DOMAIN}`. |
| `META_GRAPH_API_VERSION` | API | Optional Graph API version for **org outbound WhatsApp** (default `v25.0`, pattern `v<major>.<minor>`). Origin is fixed to `https://graph.facebook.com`. |
| `WHATSAPP_VERIFY_TOKEN` | API | Optional platform-wide Meta `hub.verify_token`. GET verify succeeds if this matches, even when no org hash matches. Per-org tokens still work. |
| `WHATSAPP_URL` | API | Full platform WhatsApp Cloud messages URL (`https://graph.facebook.com/vN.N/<numeric-id>/messages`) for get-demo OTP and platform receptionist. |
| `WHATSAPP_API_KEY` | API | Bearer token for that messages URL. Never logged, never in Vite. Also used by the WhatsApp receptionist text replies. |
| `OTP_HASH_SECRET` | API | HMAC pepper for OTP codes and verification tokens. Not the WhatsApp key. |
| `WHATSAPP_OTP_TEMPLATE_NAME` | API | Template name (default `speeko_ai`). |
| `WHATSAPP_WORKER_URL` | API | Required HTTP(S) origin of the dedicated WhatsApp worker. The durable harness is always active. |
| `WHATSAPP_TICKER_MAX_CONCURRENT` | API | Global text-turn capacity across replicas (default 4); each sender tick is capped at four sends. |
| `OTP_DELIVERY_ENCRYPTION_KEY` | API only | Dedicated random 32-byte key (64 hex chars); optional at startup, required for OTP. Malformed supplied keys fail validation. Never send to worker, log or commit. Drain OTP before key rotation. |
| `LIVEKIT_SIP_DEFAULT_COUNTRY_CODE` | API | Optional; prepended when dial numbers lack `+` (default `91`) |
| `QUEUE_DIALER_ENABLED` | API | Global kill switch for in-process dialer (`true`/`false`, default on) |
| `QUEUE_CLAIM_LEASE_SECONDS` | API | Stale `creating` reclaim lease (default `120`) |
| `QUEUE_STALE_DIALING_SECONDS` | API | Fail/requeue `dialing` rows with no worker complete after this many seconds (default `180`) |
| `QUEUE_STALE_READY_SECONDS` | API | Fail/requeue `ready` rows with no worker complete after this many seconds (default `900`; raise for long live calls) |
| `QUEUE_DEFAULT_MAX_CONCURRENT` | API | Default org max concurrent in-flight SIP legs (default `1`; set to trunk channel limit) |
| `QUEUE_DEFAULT_MAX_DIALS_PER_MINUTE` | API | Default org dial rate (default `30`) |
| `QUEUE_DEFAULT_MAX_ATTEMPTS` | API | Default max attempts when enqueue omits it (default `3`) |
| `PLUNK_API_KEY` | API | Plunk secret key (`sk_…`); empty/unset soft-disables email (invite/reset send no-ops). Required on the **api** service in production for mail to leave the box |
| `PLUNK_API_BASE` | API | Optional Plunk API origin (default `https://next-api.useplunk.com`). Origin only — do not include `/v1/send`. Legacy hosted Plunk is `https://api.useplunk.com` |
| `EMAIL_FROM` | API | Default From header (must be a domain verified in Plunk) |
| `EMAIL_NOTIFY_TO` | API | Reserved optional platform inbox; currently unused |
| `PORTAL_PUBLIC_URL` | API | Public portal origin for invite/reset links (e.g. `https://portal.speeko.ai`) |
| `PASSWORD_INVITE_TTL_MS` | API | Set-password invite TTL (default 7 days) |
| `PASSWORD_RESET_TTL_MS` | API | Forgot-password reset TTL (default 1 hour) |
| `ENDPOINT_URL` | API | Full integration enqueue URL for marketing get-demo (`…/api/integrations/:publicId/calls`). Soft-required: demo submit returns 503 if unset |
| `SPEEKO_API` | API | Integration API key (`ca_live_…`) used only server-side by `POST /api/demo/request`. **Never** put in Vite / browser env |
| `GHL_API_KEY` | API | GoHighLevel PIT (`pit-…`) for **get-demo CRM** `upsertLead` only. Soft-disabled when empty |
| `GHL_LOCATION_ID` | API | GHL sub-account id for get-demo CRM. Soft-disabled when empty |
| `GHL_CALENDAR` | API | Unused by org GHL tools (optional leftover). Tools use portal-linked connections |
| `GHL_CALENDAR_ID` | API | Unused by org GHL tools (optional leftover) |
| `AUTH_LOGIN_MAX_ATTEMPTS` | API | Max login attempts per IP+email window (default `10`) |
| `AUTH_LOGIN_WINDOW_MS` | API | Login rate-limit window in ms (default `60000`) |
| `DEMO_MAX_PER_IP` | API | Get-demo max submits per client IP (default `5`) |
| `DEMO_IP_WINDOW_MS` | API | Get-demo IP window in ms (default `900000` = 15 min) |
| `DEMO_MAX_PER_PHONE` | API | Get-demo max submits per phone digits (default `1`) |
| `DEMO_PHONE_WINDOW_MS` | API | Get-demo phone window in ms (default `3600000`) |
| `DEMO_MAX_PER_EMAIL` | API | Get-demo max submits per email (default `2`) |
| `DEMO_EMAIL_WINDOW_MS` | API | Get-demo email window in ms (default `3600000`) |
| `DEMO_MAX_GLOBAL` | API | Get-demo max submits across all clients on this process (default `30`) |
| `DEMO_GLOBAL_WINDOW_MS` | API | Get-demo global window in ms (default `3600000`) |
| `CORS_ORIGIN` | API | Comma-separated browser origins; shared normalization also governs demo/OTP abuse guards. |
| `JWT_SECRET` | API | Access-token signing secret; server-only, never exposed to Vite/workers. |

## CRM and durable WhatsApp route catalog

These extend the table above. Action POSTs return 200; internal callbacks also require the current UUID lease/generation.

| Method | Path | Auth / purpose |
| --- | --- | --- |
| POST | `/api/users/crm/:integrationId/execute` | User JWT; strict action/params, same-org CRM, location/membership checks |
| GET | `/api/users/whatsapp/harness/health` | User JWT; ticker diagnostics |
| GET | `/api/users/whatsapp/conversations` | User JWT; latest 50 own-org conversations |
| GET | `/api/users/whatsapp/conversations/:id` | User JWT; latest 100 turns/sends, task sessions, no leases |
| POST | `/api/users/whatsapp/turns/:id/retry` | User JWT; failed current-generation turn |
| POST | `/api/users/whatsapp/messages/:id/retry` | User JWT; definitely failed send, no model/tool rerun |
| POST | `/api/users/whatsapp/messages/:id/resolve` | User JWT; confirmed accepted/failed uncertain outcome |
| GET | `/api/admin/whatsapp/harness/health` | Admin JWT; ticker diagnostics |
| GET | `/api/admin/whatsapp/conversations` | Admin JWT; platform conversations |
| GET | `/api/admin/whatsapp/conversations/:id` | Admin JWT; platform detail |
| GET | `/api/admin/whatsapp/otp-deliveries` | Admin JWT; status-only, no recipient/code/ciphertext/manual retry |
| POST | `/api/admin/whatsapp/turns/:id/retry` | Admin JWT; failed platform turn |
| POST | `/api/admin/whatsapp/messages/:id/retry` | Admin JWT; definitely failed platform send |
| POST | `/api/admin/whatsapp/messages/:id/resolve` | Admin JWT; confirmed uncertain outcome |
| POST | `/api/internal/whatsapp/turns/:id/heartbeat` | Worker secret + lease; renew |
| POST | `/api/internal/whatsapp/turns/:id/checkpoint` | Worker secret + lease; persist validated session/reply/decline |
| POST | `/api/internal/whatsapp/turns/:id/complete` | Worker secret + lease; commit state/outbox atomically |
| POST | `/api/internal/whatsapp/turns/:id/fail` | Worker secret + lease; failure/backoff |
| POST | `/api/internal/whatsapp/turns/:id/tools` | Worker secret + lease; reauthorize API GHL capabilities |

Worker POST /turns (202 acceptance) and GET /health are private worker interfaces. Generated text cannot prove booking success or delivery.

## Shared callback secret and adapter details

WORKER_CALLBACK_SECRET is required, at least eight characters, and matches API plus both workers. API may store OPENROUTER_API_KEY for Railway referencing but never executes models. Database/admin/JWT names remain in .env.example.

Email uses global EmailService.send/sendText through Plunk POST /v1/send. Missing PLUNK_API_KEY soft-disables mail. Failures return ok false without throwing; invite/reset warn and may still return nondisclosing HTTP success. Production needs a verified EMAIL_FROM domain and PLUNK_API_BASE origin (new hosted projects use https://next-api.useplunk.com).

Get-demo GhlService.upsertLead is best-effort: platform PIT/location, source Speeko Get Demo, tags speeko-get-demo and direction, note with team/volume/integrations. Missing config/upstream failure does not block dial. Org tools/CRM never inherit these credentials.

GHL lookup uses PIT-friendly GET /contacts/search/duplicate; upsert uses POST /contacts/upsert, source Speeko Voice Agent; both persist ghlContactId in calls.context. Free slots use Unix milliseconds, only open startIso/endIso times, capped at 12. Short windows expand to calendar days; naive/Z times plus IANA timezone are wall-clock, numeric offsets stay absolute. Booking needs a real contact id and never upserts; phone-like contactId is ignored. Missing contact differs from unavailable slot. Authorize before every upstream operation.

## Configurable voice tasks

VoiceTasksModule owns `voice_tasks` (nullable organization owner, draft JSONB, optimistic draft_revision, nullable published_version pointer, archive state and unique platform starter_key) and `voice_task_versions` (immutable definition JSONB keyed by task_id/version with published_at). Platform templates `agents` and tenant `organization_agents` have nullable default_voice_task_id FKs; `integration_endpoints` has nullable voice_task_id. These FKs restrict deletion. Calls store the resolved voice_task_snapshot JSONB independently of future edits. The organization owner FK cascades; task versions restrict deletion so published history is retained. An organization-id index supports task scoping.

Entities remain the local schema authority under synchronize:true. The new schema was synchronized and verified in the isolated local voice_tasks_test database. **Erflow synchronization for this configurable voice-task change was explicitly deferred by the user (“leave er flow”).** Existing deferrals and the normal workflow for other changes remain in force.

Task APIs share these routes under `/api/users/voice-tasks`, `/api/admin/voice-tasks`, and `/api/admin/organizations/:orgId/voice-tasks`:
- GET list, GET :id, GET :id/versions.
- POST create {definition}, POST :id/clone, PATCH :id/draft {revision,definition}.
- POST :id/publish {revision}, POST :id/archive, POST :id/preview {revision}.
- POST :id/test {revision,organizationAgentId,context?}; platform tests also require organizationId.

User task scope comes only from the authenticated principal. Organization users can read published platform definitions, clone them and manage their own drafts. They cannot edit platform or foreign-tenant tasks. Platform-admin routes have AdminGuard. Draft updates use revision predicates; publishing locks the task and creates an immutable version transactionally. Tests use an exact revision/version-zero snapshot without publishing. Eight deterministic platform starters seed idempotently without rewriting existing templates.

Call/test/batch and endpoint selectors accept voiceTaskId or a legacy task key, never both nonempty selectors. Organization and platform agent PATCH/assignment accepts defaultVoiceTaskId. Resolution is explicit operation or endpoint selection, then saved organization default, platform default, general. A saved legacy inbound default takes precedence over a platform configured default; existing legacy assignments remain intact. Outbound default_task_key retains its legacy null rule; default_voice_task_id supports both directions.

Outbound creation and enqueue resolve once and store snapshots on calls, including retries. All calls in a batch use one version. Dispatch rechecks current tool-profile/organization allowlist and calendar compatibility without resolving a newer task version. Required input context is typed and defaults applied before execution. Inbound live metadata resolves the published version; ensure receives its {taskId,version} and persists that exact historical version even if publication changes between requests. Archived tasks cannot be newly assigned; in-flight snapshots and historical calls remain readable.

Configured calls require taskCompleted:true. Explicit false always wins; taskResult never proves completion. A successful complete_* tool is a compatibility fallback only for legacy callbacks that omit the flag. A session ending without task completion remains incomplete and does not trigger an automatic dial retry.

Verification: `VOICE_TASK_TEST_DATABASE_URL=postgresql://voice_test@127.0.0.1:55441/voice_tasks_test` enables `voice-tasks/test/voice-tasks.postgres.spec.ts`. The suite refuses other hosts/ports/database names, uses the voice_task_test schema, and exercises real publishing locks, revision conflicts, immutable history, starters, guards and tenant isolation. Calls `configured-dispatch.spec.ts` checks queued snapshots, permission revocation, draft isolation, inbound version races and callback flags; provider/LiveKit I/O is mocked. Never point this suite at a shared or production database.

## Configurable WhatsApp tasks

WhatsAppTasksModule owns whatsapp_tasks (nullable organization owner, draft JSONB, optimistic draft_revision, published_version pointer, archived and unique platform starter_key) and immutable whatsapp_task_versions keyed by task_id/version. OrganizationIntegration adds nullable whatsapp_task_id (RESTRICT FK) and whatsapp_task_context JSONB. Task-session outcome length is 64 for configured outcome keys. Existing legacy task keys and JSONB snapshots remain supported; published configurable adoption is explicit.

The isolated sandbox owns whatsapp_task_tests (task FK RESTRICT, owner organization nullable for admin platform tests, execution organization FK CASCADE, exact version-zero snapshot/draft revision, persona/context, failure tools, durable session/tool state and terminal result) and whatsapp_task_test_turns (test FK CASCADE, client-message UUID uniqueness, one-running-turn partial index, lease/deadline, initial session, checkpoint/reply and simulated tool activity). Sandbox records never create Meta outbox rows or invoke GHL adapters.

Schema was synchronized and verified using the isolated local whatsapp_tasks_test database on 127.0.0.1:55443. Canonical Erflow synchronization for this feature was explicitly deferred by the user on 2026-10-06 ("Defer Erflow for this release and deploy"); no connector was available. It remains outstanding and does not waive synchronization for future changes.

Before deploying this release to an existing database, run `apps/api/scripts/widen-whatsapp-task-outcome.cjs` with the API database environment: inspection is the default and `--apply` widens outcome from varchar(30) to varchar(64) transactionally. The installed TypeORM Postgres runner drops/recreates a column when its length changes, so startup synchronization alone would erase historical outcomes. This script uses bounded locks/timeouts and verifies counts and an internal fingerprint before committing; no row contents or credentials are logged. New databases start directly at length 64.

Task CRUD/history/preview APIs mirror voice routes under /api/users/whatsapp-tasks, /api/admin/whatsapp-tasks and /api/admin/organizations/:orgId/whatsapp-tasks. Users only manage their own drafts and read/clone published platform templates. Test APIs: POST :id/tests {revision,persona,context?,organizationId?,simulatedFailureTools?}, GET :id/tests/:testId, POST :id/tests/:testId/messages {body,clientMessageId}, POST :id/tests/:testId/reset. Admin platform tests require an execution organization for the live allowlist. Reset cancels pending/running test work and fences leases; the portal creates a fresh test.

WhatsApp Agent GET/PATCH adds whatsappTaskId and taskContext. Configured and legacy selectors cannot both be set. UI switching explicitly clears the other selector. Only published, active tasks can be assigned; archived definitions remain readable in existing session snapshots. Tasks without external tools require no profile/calendar. Tasks selecting GHL tools require a same-org profile/allowlist and active existing voice-agent calendar source. Snapshot creation applies typed context defaults and validates required inputs.

New sessions pin the definition, persona, context, capabilities and credential references without copying secrets. Configured booking writes persist receipts without task closure. complete_whatsapp_task requests are validated against the pinned definition, required typed results, current-message refusal evidence, unresolved writes and API-persisted booking receipts; closure, result, final session, turn and one reply outbox row commit together. Legacy tasks keep immediate booking closure. /new, receipt deduplication, permission checks and uncertain-send recovery remain authoritative. Unknown contact writes also block unsafe task completion/repetition.

Configured jobs carry taskProtocolVersion:2 and a snapshot; the ticker requires worker supportedTaskProtocolVersions containing 2. Legacy taskProtocolVersion:1 health remains supported. Sandbox dispatch uses private /test-turns and worker-secret/lease protected /api/internal/whatsapp/test-turns/:id callbacks. Production callbacks add validate-completion and checkpoint completion requests. Both tickers share the global claim advisory lock and running capacity; sandbox waits behind pending production work.

Verification: WHATSAPP_TASK_TEST_DATABASE_URL=postgresql://whatsapp_test@127.0.0.1:55443/whatsapp_tasks_test enables whatsapp-tasks/test/whatsapp-tasks.postgres.spec.ts; the suite rejects all other hosts/ports/database names and uses the whatsapp_task_test schema. It covers guards, tenant isolation, revision locks/history, sandbox isolation/reset, pinned production sessions, receipts, atomic closure/outbox and /new fencing. Providers and model execution are mocked; never use a shared database. Regular task-definition and harness suites plus deterministic ADK worker tests cover runtime validation and protocol compatibility.

### Task-managed saved speech

VoiceTaskDefinition optionally stores savedSpeech inside existing draft/version/call-snapshot JSONB: up to 20 fixed sentences with safe unique keys, 1–500 character text, up to 1,000 character whenToUse descriptions, boolean prepare flags, and agent/sentence/silent opening/closing choices. Phases optionally reference sentenceKeys. Structural validation rejects unknown properties, placeholders, duplicates and dangling references; snapshots retain their exact published wording. Existing tasks without savedSpeech keep their behavior. No additional tables, columns, sentence CRUD routes, or provider credentials are introduced for this extension. Existing revision/publish/clone/history/test/tenant guards apply. The additive Prepared sentences preference columns from the preceding implementation still require canonical Erflow synchronization before deployment.

The real_estate_receptionist platform starter is an opt-in eighth example with the existing 11 Gurugram questions/clarifications and usage guidance. Seeding never rewrites existing tasks or changes agent assignments/personas. This example collects requirements and does not claim bookings, saved leads, or scheduled callbacks without configured real tools. User-selected tasks make saved speech available to any compatible agent; clone tasks for per-agent wording.

Local verification on 2026-10-08: all eight isolated voice_tasks_test PostgreSQL scenarios passed, including draft/published/historical speech isolation, cloning, tenant protection, immutable snapshots and HTTP rejection of oversized/broken-reference speech. All 15 isolated api_security_test shared-cache scenarios passed, including independent prepared authorization and existing tenant/storage/policy guards. Test clusters were stopped after verification. API build and affected regression suites passed; production preferences and schema remain unchanged.

Subsequent authorized production rollout on 2026-10-08 deployed source `99e7b4b` with DATABASE_SYNCHRONIZE=false after adding only the two reviewed nullable Prepared sentences columns. Existing agent data/preferences were preserved and new preferences remain null. API deployment `9871b2bd-5121-42a3-a212-bbba1c07f346` reached SUCCESS/RUNNING. Seeding published task `f292a3ac-b928-464f-87c9-b928b0e9bde4`, version 1, with all 11 original receptionist sentences; both draft and published JSON exactly matched the shipped starter. No agents were reassigned. Erflow was explicitly deferred for this release; see [rollout record](../../railway/AGENTS.md#task-saved-speech-production-rollout).
