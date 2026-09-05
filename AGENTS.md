# AGENTS.md — Call Agent Platform

Instructions for humans and coding agents working in this repository.

## Project overview

Multi-tenant inbound/outbound **call agent platform**:

| App | Path | Role |
|-----|------|------|
| API | `apps/api` | NestJS HTTP API, JWT auth, Swagger UI, calls domain + LiveKit adapter |
| Worker | `apps/worker` | LiveKit Agents server (`@livekit/agents`) for inbound/outbound voice |
| Web (marketing) | `apps/web` | Public marketing Vite + React SPA (`/`, `/get-demo`, `/how-it-works`, `/voice`, `/solutions`, `/solutions/customer-service`, `/solutions/marketing-sales`, `/ai-voice-agent`, `/appointment-confirmation-calls`, `/ai-receptionist`, `/outbound-ai-calling`, `/ai-calling-for-clinics`) |
| Portal | `apps/portal` | Authenticated Vite + React SPA (login + org/admin dashboards) |
| UI kit | `packages/ui` | Reusable design-system primitives (`@call-agent/ui`) — buttons, forms, badges, motion |
| Contracts | `packages/contracts` | Shared wire types + catalogs (`@call-agent/contracts`) imported by API, worker, portal, and web |

Stack: NestJS monorepo, TypeORM, PostgreSQL, JWT Bearer auth, Swagger, LiveKit Agents + Inference, two Vite React frontends.

**UI:** Marketing is `apps/web`; ops/admin portal is `apps/portal` (both use `@call-agent/ui`). Swagger (`/docs`) + LiveKit Meet remain for API/call testing. Typical deploy: marketing on the public host, portal on an app host (same path URLs). Cross-links via `VITE_PORTAL_URL` / `VITE_MARKETING_URL`. Solution pages (`/solutions`, `/solutions/customer-service`, `/solutions/marketing-sales`) catalog worker tools, custom tool profiles, and what those stacks can finish. Unknown `/solutions/*` redirects to `/solutions`. How it works (`/how-it-works`) is the first-user setup runway (virtual number → agents → tools/voice → persona → CRM integration or inbound dispatch). Voice (`/voice`) is the hang-up problem page: neural speech, barge-in, and editing talent / pace / delivery on the agent Voice tab. Keyword landers (`/ai-voice-agent`, `/appointment-confirmation-calls`, `/ai-receptionist`, `/outbound-ai-calling`, `/ai-calling-for-clinics`) are search-intent pages; `vite build` emits a unique `index.html` (title, description, canonical) per marketing route so crawlers do not collapse them to `/`. GEO files `/llms.txt` (canonical) and `/llm.txt` (alias, same Markdown) live in `apps/web/public/` and are copied into `dist/`; HTML shells include `rel="describedby"` pointing at `https://speeko.ai/llms.txt`. GA4 (`G-5XRJR460G9`) is the gtag snippet immediately after `<head>` in `apps/web/index.html` (copied into every route shell); client-side route changes send `page_view` via `useGtagPageView`. Portal does not load this tag. The **web** service is served with `serve dist` (**not** `serve -s`) so those shells are returned instead of the homepage HTML. Portal keeps `serve -s` (authenticated SPA, no public SEO shells).

| Surface | App | URL | Auth |
|---------|-----|-----|------|
| Marketing site | `apps/web` | `/`, `/get-demo`, `/how-it-works`, `/voice`, `/solutions`, `/solutions/customer-service`, `/solutions/marketing-sales`, `/ai-voice-agent`, `/appointment-confirmation-calls`, `/ai-receptionist`, `/outbound-ai-calling`, `/ai-calling-for-clinics`, `/llms.txt`, `/llm.txt` | public |
| Org-user ops desk | `apps/portal` | `/login` → `/dashboard` | `POST /api/auth/login` (email + password + org slug) |
| Platform admin | `apps/portal` | `/admin-login` → `/admin-dashboard` | `POST /api/auth/admin/login` |

Org dashboard focuses on **running agents** (enqueue, dial now, queue, batches, SIP outbound, agent persona/test, **integrations** for CRM API keys) and **LiveKit list-price cost** on the calls tape / call dossier (no markup, not an invoice). Admin dashboard focuses on **tenants** (orgs, members, assign agents, **assign tools**, platform templates) plus the same cost snapshot platform-wide.

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
4. Update DTOs, Swagger decorators, and this file if conventions changed.

Do **not** leave entities and Erflow out of sync.

### Organization hub

`organizations` is the **tenant hub**. Call-stack resources hang off it:

```
organizations
├── users                              (org members; password set via invite email)
├── password_reset_tokens              (invite + reset hashes; hang off users/admins)
├── organization_agents                (named org AI configs; many per template → tool_profiles)
├── organization_queue_settings        (1:1 outbound dial queue config)
├── call_batches                       (bulk enqueue groups + pause/cancel)
├── calls                              (voice sessions; org nullable for platform web tests)
├── sip_trunks                         (org SIP trunks: outbound + inbound drafts → LiveKit ST_… ids)
├── sip_dispatch_rules                 (inbound routing drafts → LiveKit SDR_… ids)
├── integration_endpoints              (CRM dial-in: preconfigured agent/task/queue + API key)
├── organization_integrations          (org BYO third-party keys; Nylas + GoHighLevel calendar)
├── allowed_tool_ids                   (JSONB worker tool allowlist; `null` = existing tenant keeps full catalog, new orgs `["endCall"]`)
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
- `agents` — **platform AI agent templates** (seeded: `inbound`, `outbound`). **Persona** via `system_prompt` (identity, tone, policies). Optional LiveKit hook instructions: `on_enter_instructions` / `on_exit_instructions` (`null` = worker default, empty string = silent). Also: `default_task_key`, `default_tool_profile_id`, optional `voice` / **`tts_model`** (speech catalog; `null` = Inworld TTS-2) / **`model`** (LLM / realtime catalog; `null` = Gemma; realtime ids are speech-to-speech) / `temperature` (LLM), `speaking_rate` (0.5–1.5 when the selected TTS supports it), `delivery_mode` (`STABLE` \| `BALANCED` \| `CREATIVE`, Inworld only). Not the same as user role `agent`.
- `organization_agents` — org-owned **named** agent configs: FK to org + platform template (`agent_id`); display `name` + unique-per-org `slug`; effective persona `system_prompt`, optional `on_enter_instructions` / `on_exit_instructions`, `tool_profile_id`, optional `voice` / **`tts_model`** / `model` / `temperature` / `speaking_rate` / `delivery_mode`. **`default_task_key` is inbound-only (required)** — packed into SIP dispatch metadata. Outbound configs store `null`; task is chosen on the call, batch, or integration endpoint (fallback: platform template → `general`). Unique `(organization_id, slug)` — **not** unique on template, so an org may have many inbound/outbound configs (different prompts/hooks/tools). Create/clone copies template or source config (outbound clone clears task). Org null voice fields fall back to the template at response/metadata time. Switching `tts_model` (or a realtime `model`) requires a `voice` from that catalog.
- `organization_queue_settings` — 1:1 with org. Outbound dial queue: `enabled`, `paused`, `max_concurrent`, `max_dials_per_minute`, `default_max_attempts`, backoff (`fixed` \| `exponential`, base/max seconds), `retry_on` JSONB failure codes, optional quiet hours + timezone, `claim_batch_size`. Lazy-created on first access / seeded on org create.
- `call_batches` — bulk enqueue groups: `status` `running` \| `paused` \| `cancelled` \| `completed`, optional overrides (`max_attempts`, `max_concurrent`, `priority`), `total_count`, agent/trunk/task snapshot.
- `sip_trunks` — org SIP trunks (`direction` `outbound` \| `inbound`). Outbound: provider fields + `livekit_trunk_id` (`ST_…`) set on create (link or provision) via admin **or** org user; always `live` after create. Inbound: draft-first (`livekit_trunk_id` null until publish); also `allowed_numbers`, `allowed_addresses`, `krisp_enabled`, `published_at`. Never return `auth_password` in responses. Response `status`: `draft` \| `live` (derived from whether LiveKit id is set).
- `sip_dispatch_rules` — org inbound routing configs. Local draft of LiveKit dispatch rule: `rule_type` (`individual` \| `direct` \| `callee`), room fields, `sip_trunk_ids` (local inbound trunk UUIDs), optional `organization_agent_id` (persona packed into agent job metadata on publish), `agent_name`, `livekit_dispatch_rule_id` (`SDR_…`, null until publish), `published_at`. Default for agent telephony: `individual` + `room_prefix=call-`.
- `calls` — voice call records (queued pending, web test, or SIP outbound). Links optional `organization_id` / `organization_agent_id` / `agent_id` / `sip_trunk_id` / `batch_id` (→ `call_batches`); LiveKit `room_name` (null while pending), dispatch id, optional `livekit_sip_call_id`, numbers, **`context` JSONB** (request payload: CRM/demo fields, phoneNumber, externalId — what was asked of this call), `task_key` / `task_result` / **`task_status`** (`pending` \| `completed` \| `incomplete`), transcript/usage/`session_report` (includes **`toolEvents`**: worker tool invocations with args/result/ok/duration), **`cost` JSONB** + **`cost_usd`** (LiveKit list-price snapshot, **markup 0**, frozen on worker complete; retries append attempts), queue fields (`attempt_count`, `max_attempts`, `next_attempt_at`, `priority`, `last_failure_code`, `last_failure_at`, `dial_started_at`, `queue_locked_at`), timestamps. Status: `pending` \| `creating` \| `dialing` \| `ready` \| `failed` \| **`completed`** (session ended **and** `task.complete()` ran) \| **`incomplete`** (conversation ended without `task.complete()`) \| `cancelled`. Do **not** infer task done from `task_result` JSON (unanswered/crash paths also write one). Transitions go through `call-state-machine.ts`. Buckets: **pending** / **in_progress** / **done** (`completed` \| `incomplete` \| `failed` \| `cancelled`). Medium: `web` \| `sip`. **Inbound SIP rings** are upserted by the worker on job start (`POST /api/internal/calls/inbound` by LiveKit `room_name`) then completed on the existing complete callback; dispatch-rule metadata stays static (no per-ring `callId`). Inbound rows use `max_attempts=1` and are never requeued as outbound dials. Call APIs also expose derived top-level `toolEvents` from `session_report.toolEvents` for portal history, and **`cost`** (list-price snapshot, markup 0) on both admin and org-user call DTOs (`null` until worker complete).
- `integration_endpoints` — org CRM / external dial-in configs. Baked-in `organization_agent_id`, `task_key`, optional `sip_trunk_id`, queue overrides (`max_attempts`, `priority`, `max_concurrent`), optional `default_context` JSONB. Auth: opaque `public_id` in the URL path + per-endpoint API key (`key_prefix` display + `key_hash` SHA-256; full secret shown only on create/rotate). Soft `is_active`; `last_used_at` on successful public enqueue. Never return `key_hash` or full secret on list/get.
- `organization_integrations` — org-owned third-party credentials (`provider=nylas` \| `ghl`): `name`, `api_key` (secret, never returned), `api_key_prefix`, `grant_id` (Nylas; null for GHL), `location_id` (GHL; null for Nylas), `calendar_id` (Nylas default `primary`, or GHL calendar id), `api_uri` / `email` (Nylas-only), `is_active`. Used by calendar tools via agent link.
- `organization_agents.calendar_integration_id` — optional FK → `organization_integrations` (SET NULL). Which calendar powers calendar tools for that agent (Nylas **or** GHL); tool enablement stays on the tool profile.

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
API QueueDialerService (@Interval) → FOR UPDATE SKIP LOCKED claim → dial (room + dispatch + CreateSIPParticipant)
Worker voice session → POST /internal/calls/:id/complete → complete or requeue
```

**Config hierarchy (most specific wins):** platform env defaults → `organization_queue_settings` → `call_batches` overrides → per-call `max_attempts` / `priority` / `next_attempt_at`.

**Retries (practical):** on dial failure or worker `failed` complete, classify `failure_code` (`no_answer` \| `busy` \| `sip_error` \| `timeout` \| `agent_error` \| `cancelled` \| `unknown`). If code ∈ `retry_on` and `attempt_count < max_attempts`, requeue to `pending` with backoff (`fixed` or exponential, optional quiet-hours push). Else terminal `failed`.

**Controls:** org pause/resume, batch pause/resume/cancel, per-call cancel / retry-now / prioritize. Live stats via REST poll (`GET …/queue/stats`). Multi-instance safe via `SKIP LOCKED` + claim lease reclaim.

**Stale in-flight sweeper:** each dialer tick also reaps global `dialing` / `ready` rows that never received worker complete (worker hang/death). Age clocks: dialing from `dial_started_at` (default 180s); ready from `answered_at` (default 900s). Action: `timeout` → fail or requeue under org `retry_on` / `max_attempts`, best-effort LiveKit room delete. Frees `max_concurrent` slots held by zombies.

### Agent architecture (persona / workflow / capabilities)

Aligned with LiveKit’s separation of **Instructions**, **Tasks**, **Tools**, and runtime metadata:

| Concern | Where it lives | What it is |
|---------|----------------|------------|
| **Persona** | `agents.system_prompt` / `organization_agents.system_prompt` → metadata `prompt.systemPrompt` | Who the agent is, company, tone, policies, safety. **No** call-specific workflow steps. Portal edits this only. Worker `buildPersonaPrompt` **appends** a platform runtime layer (voice rules, direction, **current date/time/day** from the worker clock, safety) that is **not** in the portal. LiveKit `AgentTask.run()` **replaces** the parent agent, so tasks copy this via `composeTaskInstructions` (persona + workflow). Do not rely on the parent prompt surviving the handoff. |
| **Call open / close** | `on_enter_instructions` / `on_exit_instructions` → metadata `prompt.onEnterInstructions` / `onExitInstructions` | LiveKit parent **Agent** hooks: `onEnter` → `session.generateReply({ instructions })`; `onExit` → `session.say(text)` (verbatim, no second LLM turn). `null` = built-in default; `""` = skip speech. Tasks do **not** own opening speech. |
| **Workflow** | Worker `TaskRegistry` (LiveKit `AgentTask`) selected by metadata `task` | Objective, completion conditions, structured result (e.g. appointment CONFIRMED). **Inbound:** org agent `default_task_key` (required). **Outbound:** call / integration `task` (not on the agent). |
| **Capabilities** | Worker `ToolRegistry` hard-coded implementations; enabled by `tool_profiles` → metadata `enabledTools`, **intersected with `organizations.allowed_tool_ids`** | Executable actions (`endCall`, `booking`, …). Admin assigns which ids an org may use. New orgs: `endCall` only. Existing orgs stay `null` (full catalog) until an admin saves Tools. Orgs create/select profiles of those **ids** (not implementations). |
| **Runtime context** | Call request `context` + ids in metadata | CRM fields, bookingId, phoneNumber, etc. Never executable code. |

**Worker stays stateless** — never queries Postgres. API packs metadata; worker builds runtime via builders:

```
Parse metadata → PromptBuilder → ToolBuilder (registry) → TaskBuilder → AgentSession
```

Known task keys: `general`, `demo_booking` (schedule calendar demo then short product discovery), `interview_booking` (confirm callee name, congratulate they were selected, then book an interview; calendar tools come from the agent tool profile, not the task).  
Known tool ids: `endCall`, `booking`, `cancelBooking`, `transferCall`, `lookupCustomer`, `confirmAppointment`, `checkCalendarAvailability`, `listCalendarEvents`, `createCalendarEvent`, `cancelCalendarEvent`, `checkGhlFreeSlots`, `lookupGhlContact`, `upsertGhlContact`, `scheduleGhlMeeting`.

**Calendar tools (Nylas):** org stores API key + grant on `organization_integrations` (`provider=nylas`); link via `organization_agents.calendar_integration_id`; enable Nylas tool ids on a tool profile. Worker tools call `POST /api/internal/calls/:callId/calendar/*` with `X-Worker-Secret` — API holds secrets (never in LiveKit metadata).

**Calendar tools (GHL):** org stores a **v3 Private Integration Token** + location (sub-account) id + calendar id on `organization_integrations` (`provider=ghl`); link via the same `calendar_integration_id`; enable `checkGhlFreeSlots` / `lookupGhlContact` / `upsertGhlContact` / `scheduleGhlMeeting`. Token scopes: `calendars.readonly` (View Calendars), `calendars/events.readonly` (View Calendar Events), `calendars/events.write` (Edit Calendar Events). Lookup needs `contacts.readonly`; upsert needs `contacts.write`. Calendar book (`scheduleGhlMeeting`) does **not** create contacts — it uses `ghlContactId` / `contactId` on the call (get-demo CRM upsert, `lookupGhlContact`, or `upsertGhlContact`; both persist `ghlContactId` onto `calls.context`). Phone-like `contactId` values are ignored. GHL “contact not found” on book is `missing_contact`, not a busy slot. Portal can preview calendars via `POST /api/users/integrations/ghl/calendars` (`GET /calendars/?locationId=`). Worker tools call `POST /api/internal/calls/:callId/ghl-calendar/*`. Free slots return **open times only** (never existing appointments). No platform-env fallback — missing/inactive/wrong-provider link fails the tool. `GhlService` is the only GHL HTTP client. Worker/API treat naive or `Z` ISO **plus IANA `timezone`** as local wall-clock (LLMs often tag IST times with `Z`); numeric offsets (`+05:30`) stay absolute. Short free-slot windows (< 4h) expand to the local calendar day(s) before calling GHL.

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
- **Get-demo abuse limits:** `POST /api/demo/request` uses `DemoAbuseGuard`. When `CORS_ORIGIN` is set, `Origin` (or `Referer` origin) must match that allowlist (403). Parse `CORS_ORIGIN` with `parseCorsOriginAllowlist` (`apps/api/src/common/cors-origin.ts`) — same helper as Nest `enableCors` (trim, lowercase, strip trailing slash). Then in-process fixed windows (same `FixedWindowRateLimit` helper as login): IP (default 5 / 15 min), phone (1 / hour), email (2 / hour), global (30 / hour). Over limit → **429**. Counters are **per API process**. Country / team size / calls-per-day / integrations are allowlisted to the marketing form.
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

## Local development

```bash
# 1. Postgres (prefer Docker when available)
docker compose up -d
# Or use local PostgreSQL with the same credentials as .env.example

# 2. Env
cp .env.example .env   # fill LIVEKIT_* from LiveKit Cloud project settings

# 3. Install & run API + LiveKit worker (two terminals)
npm install
npm run build:contracts   # ESM emit for the worker; Vite aliases source
npm run start:api:dev
npm run start:worker:dev

# 4. Marketing site + portal (separate installs / terminals)
npm install --prefix apps/web
npm install --prefix apps/portal
npm run start:web:dev       # marketing http://localhost:5173
npm run start:portal:dev    # portal    http://localhost:5174  (proxies /api → :3000)
# Swagger: http://localhost:3000/docs
```

Optional frontend env (Vite, build-time):

| Variable | App | Notes |
|----------|-----|--------|
| `VITE_API_URL` | portal, web | API base (default `/api` via Vite proxy in local dev; used by portal + get-demo form) |
| `VITE_MARKETING_URL` | portal | Public marketing origin for login brand/home links |
| `VITE_PORTAL_URL` | web | Portal origin for “Sign in” and other app deep links |

Default local DB credentials (see `.env.example`):

- user/password/db: `callagent` / `callagent` / `callagent`
- host/port: `localhost` / `5432`

### LiveKit env

| Variable | Used by | Notes |
|----------|---------|--------|
| `LIVEKIT_URL` | API + worker | `wss://…livekit.cloud` |
| `LIVEKIT_API_KEY` | API + worker | Project API key |
| `LIVEKIT_API_SECRET` | API + worker | Project API secret |
| `LIVEKIT_AGENT_NAME` | API + worker | Explicit dispatch name (default `call-agent`) |
| `LIVEKIT_PRICING_PLAN` | API | LiveKit list-price catalog: `build` \| `ship` (default) \| `scale`. Overage rates for personal call-cost analysis (no markup, ignores included monthly credits). |
| `LIVEKIT_AGENT_DEPLOYED` | API | `true` only if the worker is a LiveKit Cloud hosted agent (charges $0.01/min agent-session). Default off — Railway self-hosted worker counts as WebRTC minutes instead. |
| `LIVEKIT_SIP_VENDOR_USD_PER_MIN` | API | Optional SIP carrier estimate (Telnyx/Twilio) in USD/min. Default `0` = LiveKit charges only. |
| `LIVEKIT_NUM_IDLE_PROCESSES` | worker | Pre-warmed job child processes (default `1` in code; min effective `1` — SDK treats `0` as unset and would restore multi-process default). Main RAM lever after cloud turn-detect + compiled `node` prod start. |
| `OPENAI_API_KEY` | worker | Optional. Required when an agent uses OpenAI plugin models (pipeline LLM, `openai/gpt-4o-mini-tts`, or `openai/gpt-realtime-2.1*`). Never in LiveKit metadata or Vite. Missing key **fails** those jobs (no silent Gemma/Inworld fallback). |
| `XAI_API_KEY` | worker | Optional. Required when an agent uses xAI plugin models (Grok LLM, `xai/tts-1`, or `xai/grok-voice-think-fast-2.0`). Never in LiveKit metadata or Vite. Missing key **fails** those jobs. |
| `WORKER_CALLBACK_SECRET` | API + worker | Shared secret for `POST /api/internal/calls/:id/complete` (`X-Worker-Secret`) |
| `API_BASE_URL` | worker | Base URL for callbacks (e.g. `http://localhost:3000`) |
| `COMPLETE_CALLBACK_TIMEOUT_MS` | worker | Per-attempt timeout for the complete POST (default `8000`). Prevents hung `fetch` from pinning the job process. |
| `COMPLETE_CALLBACK_MAX_ATTEMPTS` | worker | Complete POST attempts (default `5`). Retries 408/429/5xx, network, and abort. Never throws after exhaustion. |
| `COMPLETE_CALLBACK_BACKOFF_MS` | worker | Base backoff between complete retries (default `500`, exponential cap 4s, ~20% jitter). |
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
| `EMAIL_NOTIFY_TO` | API | Optional platform inbox for product notify mail; read via `EmailService.getNotifyTo()` |
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

Models use **LiveKit Inference** (STT/LLM/TTS + **cloud turn detector v1**) — no separate OpenAI/Deepgram keys. Pins live in `apps/worker/src/models.ts`. Local EOT mini model is **not** loaded (saves ~138 MB idle); in-process Silero VAD remains for barge-in.

**Email (Plunk):** inject global `EmailService` and call `send()` / `sendText()`. Never throws — failures return `{ ok: false }` and are logged (invite/reset also warn at the auth layer). `from` must use a domain verified in Plunk. Soft-disabled without `PLUNK_API_KEY` — production **api** must set this or invites/resets succeed in HTTP but no mail is sent. New hosted Plunk projects use `PLUNK_API_BASE=https://next-api.useplunk.com`.

**GoHighLevel (get-demo leads):** inject global `GhlService` and call `upsertLead()`. Never throws — missing `GHL_API_KEY` / `GHL_LOCATION_ID` or API errors return `{ ok: false }` and are logged (token never logged). Upserts a contact (`source=Speeko Get Demo`), then adds tags `speeko-get-demo` + `direction:…` and a note with team/calls/integrations.

**GoHighLevel (org calendar tools):** `GhlService.getFreeSlots()` / `lookupContact()` / `upsertContact()` / `createAppointment()` / `listCalendars()` with per-request org creds from the linked `organization_integrations` row. `lookupGhlContact` uses PIT-friendly `GET /contacts/search/duplicate` (not OAuth-only `/contacts/lookup`) and writes `ghlContactId` onto `calls.context` when found. `upsertGhlContact` uses the same PIT + location (`POST /contacts/upsert`, source `Speeko Voice Agent`) and writes `ghlContactId` onto `calls.context`. `createAppointment` still needs that contact id — it does not upsert. Phone-like `contactId` is ignored; GHL “contact not found” on book is `missing_contact`, not `slot_unavailable`. Free-slots `startDate`/`endDate` are unix **milliseconds**. Response to the worker is open `{ startIso, endIso }` only (cap 12) — never `GET /calendars/events`. Tokens never logged. Env `GHL_API_KEY` is get-demo CRM only, not org tools. Env `GHL_CALENDAR` is not used by tools.

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

## Production deploy (Railway CLI)

Production runs on **Railway** (project `practical-spontaneity`, environment `production`). Deploys are **CLI uploads from the monorepo root** (`railway up`), not GitHub autodeploy (unless reconfigured later). The working tree need not be a git repo for `railway up`.

### Services

| Service | Dockerfile | Config | Public URL (approx.) | Redeploy when |
|---------|------------|--------|----------------------|---------------|
| `api` | `Dockerfile.api` | `railway/api.toml` | `https://api-production-4df4.up.railway.app` | Nest API, entities, env-driven server config |
| `worker` | `Dockerfile.worker` | `railway/worker.toml` | `https://worker-production-fdde.up.railway.app` | LiveKit agent, tasks/tools, models |
| `web` | `Dockerfile.web` | `railway/web.toml` | `https://speeko.ai` | Marketing SPA (`apps/web`) or `VITE_*` build args |
| `portal` | `Dockerfile.portal` | `railway/portal.toml` | `https://portal.speeko.ai` | Ops SPA (`apps/portal`) or `VITE_*` build args |
| `Postgres` | Railway Postgres | — | **private only** (`*.railway.internal`) | Never app code; data only |

- Dockerfiles live at the **repo root**; each service’s Railway build settings point at the matching file (see `railway/*.toml` for intended builder + start command).
- **Region:** typically `sfo`. Confirm with `railway service list`.
- **Vite apps bake env at image build time.** Changing `VITE_API_URL` / `VITE_PORTAL_URL` / `VITE_MARKETING_URL` on Railway requires a **rebuild** of `web` and/or `portal`, not just a restart.
- API talks to Postgres over the private network (`DATABASE_HOST=postgres.railway.internal`). There is usually **no public TCP proxy** on Postgres — run SQL via Railway dashboard query / `railway ssh` into a service that has DB env, not from a random laptop without a tunnel.

### CLI setup

```bash
# Install CLI (once), then from monorepo root:
railway login
railway link          # select project practical-spontaneity + environment production
railway whoami
railway status        # linked service (often worker) + all resources
railway service list
```

Prefer explicit `-s <service>` on every command so you do not deploy the wrong linked service.

### Deploy commands

```bash
# One service (from monorepo root — upload whole context; Dockerfile decides build)
railway up -s api -e production -m "short reason" -d -y
railway up -s worker -e production -m "short reason" -d -y
railway up -s web -e production -m "short reason" -d -y
railway up -s portal -e production -m "short reason" -d -y

# Stream build logs until the deploy finishes (can time out on flaky networks)
railway up -s api -e production -m "…" -c

# Status / logs
railway deployment list --service api --json
railway logs -s api
railway logs -s api --build
```

| Flag | Meaning |
|------|---------|
| `-s` / `--service` | Target service name (`api`, `portal`, `web`, `worker`) |
| `-e production` | Environment (default is linked env) |
| `-m "…"` | Deployment message (shows in history) |
| `-d` / `--detach` | Upload and return; do not stream logs |
| `-y` | Non-interactive defaults (good for agents/scripts) |
| `-c` / `--ci` | Stream build logs then exit |

**What to redeploy for a change**

| Change | Deploy |
|--------|--------|
| API routes, entities, queue, SIP, integrations | `api` |
| Worker agent/tasks/tools/models | `worker` |
| Admin/org portal UI | `portal` |
| Marketing site / get-demo UI | `web` |
| Shared `@call-agent/ui` used by a SPA | that SPA (`portal` and/or `web`) |
| Only worker env vars (runtime) | variable change + `railway restart -s worker` (no rebuild if code unchanged) |
| Only SPA `VITE_*` | variable change + **rebuild** that SPA |
| `ENDPOINT_URL` / `SPEEKO_API` (get-demo dial) | set on **api** only (runtime); restart/redeploy `api` |
| `GHL_API_KEY` / `GHL_LOCATION_ID` (get-demo CRM) | set on **api** only (runtime); restart/redeploy `api` |
| `GHL_CALENDAR` / `GHL_CALENDAR_ID` | unused by tools after org GHL connections; leave set or drop later |

Do **not** redeploy every service by default — match the surface you changed.

### Marketing get-demo → dial + CRM

```
Web form → POST /api/demo/request → DemoAbuseGuard (origin + rate limits)
  → API DemoService
  1. GhlService.upsertLead (best-effort contact in GoHighLevel)
  2. POST ENDPOINT_URL + Bearer SPEEKO_API
  → integration enqueue → queue dialer → agent SIP call
```

Form fields go in integration `context` (`source: get_demo`, name, company, email, etc.) and, when GHL env is set, onto a GHL contact. Successful CRM upsert also sets `ghlContactId` so the calendar tool can book without `contacts.write` on the calendar PIT. Agent/task/trunk are fixed on the integration endpoint in the portal — not on the form. CRM failure does not fail the HTTP request. Abuse 403/429 never enqueue.

### Schema / DB after deploys

- TypeORM `synchronize: true` **creates/updates** columns from entities; it does **not** drop removed tables or columns.
- After deleting an entity (e.g. dropped domain table), deploy `api` **and** run an explicit SQL drop on production when the data is disposable:

```sql
DROP TABLE IF EXISTS <table_name> CASCADE;
```

- Also update the **Erflow** model in the same change set (see schema workflow above).
- Local DB drop does not affect Railway Postgres.

### Smoke checks after deploy

```bash
# API OpenAPI should match removed/added routes
curl -sS https://api-production-4df4.up.railway.app/docs-json | head

# SPAs
curl -sS -o /dev/null -w "%{http_code}\n" https://speeko.ai/
curl -sS -o /dev/null -w "%{http_code}\n" https://portal.speeko.ai/
```

Worker health is “registered with LiveKit” in service logs, not a public HTML page. API needs `API_BASE_URL` (worker → public API origin) + shared `WORKER_CALLBACK_SECRET` on **both** api and worker.

### Useful Railway CLI map

| Command | Use |
|---------|-----|
| `railway up -s …` | Build + deploy current directory |
| `railway redeploy -s …` | Redeploy last successful image (no new upload) |
| `railway restart -s …` | Restart running deployment (no rebuild) |
| `railway variables -s …` | List/set service env vars |
| `railway logs -s …` | Runtime logs |
| `railway ssh -s …` | Shell/command on a running instance (needs working SSH keys; can hang in some agent environments) |
| `railway status` / `service list` | Project link + health/URLs |

### Agent notes

- Confirm with the user before destructive prod actions (`railway down`, force redeploys that drop traffic, SQL `DROP`/`TRUNCATE` on shared data).
- Prefer `-d -y` + poll `railway deployment list --service X --json` when log streaming times out.
- Never put production secrets into this file or commit them; use Railway variables / local `.env` (gitignored).

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
| POST | `/api/demo/request` | public — marketing get-demo; `DemoAbuseGuard` (origin + rate limits); best-effort GHL contact upsert, then proxy to `ENDPOINT_URL` with `SPEEKO_API` (integration enqueue → queue dial) |
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
| GET | `/api/users/integrations` | user JWT — list org third-party connections (Nylas / GHL; no api_key) |
| POST | `/api/users/integrations` | user JWT — add Nylas (`apiKey`, `grantId`) or GHL (`apiKey` v3 PIT, `locationId`, `calendarId`) |
| POST | `/api/users/integrations/ghl/calendars` | user JWT — unsaved GHL v3 list calendars (`apiKey` + `locationId`; does not persist) |
| GET | `/api/users/integrations/:id` | user JWT — get one (no secret) |
| PATCH | `/api/users/integrations/:id` | user JWT — update fields / optional new apiKey / isActive |
| DELETE | `/api/users/integrations/:id` | user JWT — delete connection (agent FKs SET NULL) |
| POST | `/api/users/integrations/:id/test` | user JWT — smoke-test (Nylas or GHL list calendars) |
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
  "temperature": null,
  "speakingRate": null,
  "deliveryMode": null
}
```

- Platform templates: `key` is the template key; no `slug` / `organizationId` / `calendarIntegrationId`.
- Org-owned rows: `name` + `slug` are org-owned; `key` / `templateKey` are the platform template key; also `organizationId` + `agentId` (template id) + optional `calendarIntegrationId` (Nylas). Multiple org rows may share the same template. **`defaultTaskKey` is required on inbound org agents; outbound org agents return `null`** (set task on the call or integration).
- Hook fields: `null` = worker default opening/closing; `""` = silent for that hook; non-empty onEnter = custom `generateReply` instructions; non-empty onExit = verbatim `session.say` line.

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
  "temperature": null,
  "speakingRate": null,
  "deliveryMode": null
}
```

`model` is the **LLM / realtime** catalog id (`google/gemma-4-31b-it`, `openai/gpt-4.1-mini`, `xai/grok-4.6`, `openai/gpt-realtime-2.1-mini`, `xai/grok-voice-think-fast-2.0`; `null` = Gemma via LiveKit Inference). Realtime ids run speech-to-speech (no STT/TTS; the realtime API owns VAD). `ttsModel` is the **speech** catalog id (`inworld/inworld-tts-2`, `fishaudio/s2.1-pro-free`, `openai/gpt-4o-mini-tts`, `xai/tts-1`; `null` = Inworld) and is ignored on realtime jobs. Switching `ttsModel` (or a realtime `model`) changes the allowed `voice` set (catalogs in `@call-agent/contracts` `tts.ts` / `llm.ts`). OpenAI plugin models need `OPENAI_API_KEY` on the worker; xAI plugin models need `XAI_API_KEY`. Inworld + Fish stay on LiveKit Inference. `temperature` is **LLM** reply randomness (not used on native realtime). `speakingRate` maps to Inworld `speaking_rate` or Fish/OpenAI/Grok `speed`; `deliveryMode` is Inworld-only. BYO OpenAI/xAI usage is billed by those providers and is **not** on the LiveKit list-price call snapshot.

Outbound: `POST /api/admin/calls/outbound` (and user enqueue / dial / integration) accepts optional `task` (defaults to platform template `default_task_key` → `general` — **not** the org agent). Inbound SIP dispatch packs the org agent’s required `default_task_key`.  
Test: `POST /api/admin/calls/test` accepts optional `task` + `context`. Org web test for outbound also sends an explicit task (not stored on the agent).

### Calls vs LiveKit modules

| Module | Role |
|--------|------|
| `calls` | Domain: persist `calls`, resolve agents/tool profiles/task key, pack **runtime** job metadata. Nest surface stays at module root (module, entity, repo, controllers). Split services in `calls/services/`: `CallWebTestService` (Meet test), `CallDialService` (enqueue + immediate/claimed SIP), `CallWorkerService` (inbound ensure + complete), `CallFailureService` (fail/requeue + stale reap), `CallsService` (tape list/get + cancel/retry/prioritize). Pure helpers in `calls/lib/` (state machine, row factory, phone, task key, price wrapper). Job metadata type lives in `@call-agent/contracts`. |
| `queue` | Org queue settings, call batches, claim (`SKIP LOCKED`), retry policy, in-process **QueueDialerService**, live stats, user/admin queue controllers |
| `price` | LiveKit **list-price** call cost (STT/LLM/TTS + WebRTC/SIP room). No markup. Catalog in `price.catalog.ts`; `PriceService` prices each worker-complete attempt onto `calls.cost` / `cost_usd`. Org-user summary is JWT-org scoped; admin summary + recompute |
| `tools` | Tool profiles list/seed + org custom CRUD; org tool allowlist (`organizations.allowed_tool_ids`); resolve `enabledTools` ids for metadata (profile ∩ allowlist when org-scoped) |
| `integration-endpoints` | Org CRM dial-in: preconfigured agent/task/trunk/queue + API key; public thin `POST …/calls` enqueue |
| `organization-integrations` | Org BYO third-party keys (Nylas + GHL calendar); user CRUD + test; worker Nylas proxy via `CalendarToolsService` |
| `sip-trunks` | Org SIP trunk CRUD: admin outbound; **user outbound** create/link/update/delete; user inbound draft + publish; combined inbound publish orchestrator |
| `sip-dispatch-rules` | Org dispatch-rule draft CRUD + publish to LiveKit (`CreateSIPDispatchRule` + agent `roomConfig`) |
| `livekit` | Thin adapter only: rooms, dispatch, tokens, **SIP** (`createSipOutboundTrunk`, `createSipInboundTrunk`, `createSipDispatchRule`, `createSipParticipant`, `deleteSipTrunk`, `deleteSipDispatchRule`) — **no** controllers or agent business logic |
| `email` | Thin Plunk adapter only: `EmailService.send()` / `sendText()` — **no** controllers; soft-disabled without `PLUNK_API_KEY`; never throws |

### LiveKit worker

- Entry: `apps/worker/src/main.ts` → `cli.runApp` with `agentName` = `LIVEKIT_AGENT_NAME` (default `call-agent`) and `numIdleProcesses` from `LIVEKIT_NUM_IDLE_PROCESSES` (default `1`) to limit idle RAM on small hosts.
- Job entry: `apps/worker/src/agent.ts` parses metadata → **inbound + `organizationAgentId` re-fetches live pack** → `buildAgentRuntime` (builders) → voice-only `AgentSession`.
- **Builders:** `prompt-builder` (persona + onEnter instructions + onExit spoken line; **skips `session.say` closings when `model` is realtime**), `model-builder` (pipeline STT/LLM/TTS **or** OpenAI/xAI `RealtimeModel`; OpenAI via `@livekit/agents-plugin-openai`, xAI LLM via `openai.LLM.withXAI`, xAI TTS/realtime via `@livekit/agents-plugin-xai` wrapped so AgentTask `agent_config_update` / `agent_handoff` items are stripped before `livekitItemToOpenAIItem`; Inworld + Fish + Gemma via LiveKit Inference), `voice-builder` (session; realtime omits STT/TTS/turn-detector), `tool-builder` → `ToolRegistry`, `task-builder` → `TaskRegistry`, orchestrated by `agent-builder`.
- **Turn detection / memory:** `model-builder` uses `inference.TurnDetector({ version: 'v1' })` (cloud). Main skips registering local EOT (`lk_eot_audio`) so the shared InferenceProcExecutor (~138 MB) is not started. Bundled Silero VAD still auto-provisions in job processes.
- **Tasks:** LiveKit `voice.AgentTask` under `apps/worker/src/tasks/*`. Parent agent **onEnter** speaks opening (configurable), then runs `task.run()`; task owns workflow + completion tools (no opening `generateReply`). `composeTaskInstructions` copies `buildPersonaPrompt` into the task system prompt so company facts survive the handoff (`excludeInstructions: true` plus `excludeConfigUpdate` / `excludeHandoff` on copied history so it is not duplicated and realtime plugins do not throw `Unsupported item type: agent_config_update`). Structured result in `userData.taskResult`. `userData.taskCompleted = true` only after `task.run()` **resolves** (not because `taskResult` is set).
- **Tools:** hard-coded in `apps/worker/src/tools/*`; metadata only lists ids. Always includes hangup (`endCall` / `createEndCallTool`).
- **Hangup:** successful task completion auto-ends the session and deletes the LiveKit room (SIP drops). Mid-call hangup uses the `end_call` tool. Shared helper: `apps/worker/src/hangup.ts`.
- **Does not dial SIP** — API owns `CreateSIPParticipant`. For `medium=sip`, worker connects and `waitForParticipant` (SIP party joins while still ringing). **Outbound** then **`waitForSipAnswer`** until `sip.callStatus` is `active`/`automation` (or published audio) **before constructing models** (`buildAgentRuntime`) and before `session.start` / opening speech. Realtime S2S (Grok Voice / GPT Realtime) must not open a provider session while the INVITE is in flight. Hangup / disconnect / 60s timeout before answer POSTs `failed` + `no_answer` (retryable). Fire-and-forget CreateSIPParticipant (`waitUntilAnswered=false`, the queue path) must **not** send `ringingTimeout` / `SIPMediaConfig` — extra media fields on the INVITE are enough for Frejun to drop the call without logging it. `waitUntilAnswered=true` still sets **`ringingTimeout=60s`** and **`media.mediaTimeout=90s`**. **Do not auto-pin LiveKit `destinationCountry=in` on +91 dials.** Frejun allowlists US LiveKit SIP egress; India-origin INVITEs never appear in their CDR and come back `USER_UNAVAILABLE` (~30s) while still `dialing`. Set `destinationCountry` only when the provider requires it. Outbound Frejun trunks must use **SIP TCP** (`SIP_TRANSPORT_TCP`); `AUTO` falls through to UDP and Frejun never replies (`0 intermediate responses`, ~34s `USER_UNAVAILABLE`). Job shutdown never reports `completed` unless the callee answered. **Inbound** must **not** wait for `active` — LiveKit keeps inbound at `ringing` until the SIP caller subscribes to remote audio, which only happens after `session.start`. Waiting first deadlocks (caller hears ringing, agent never greets, hangup → `no_answer`). Inbound: ensure the `calls` row, skip `waitForSipAnswer` unless already `hangup`, then `session.start` immediately so LiveKit can 200 OK.
- **Inbound SIP tape:** dispatch-rule job metadata has no unique `callId`. Before building models, inbound jobs with `organizationAgentId` POST `POST /api/internal/organization-agents/:id/job-metadata` and merge the live persona/tools/voice (so a realtime Voice-tab save is used on the next ring without republish). When `direction=inbound`, `medium=sip`, and `callId` is missing, the worker then POSTs `POST /api/internal/calls/inbound` (upsert by room name + SIP attrs) after the SIP participant is present, then uses the returned id on the existing complete path. Calendar tools need that `userData.callId`.
- **Opening / goodbye:** parent agent LiveKit hooks — `onEnter` via `buildOpeningInstructions` + `generateReply`; `onExit` via `buildClosingSpeech` + `session.say` (verbatim canned or custom line; not a second LLM turn). `createEndCallTool` uses `endInstructions: null` so hangup does not double-speak.
- On shutdown, POSTs transcript + usage + **taskResult** + **`taskCompleted`** to `POST /api/internal/calls/:id/complete` when `API_BASE_URL` + `WORKER_CALLBACK_SECRET` are set. Each attempt has an `AbortSignal` timeout (default 8s) and retries up to 5 times on **408 / 429 / 5xx / network / abort** (exponential backoff). **Never throws** after exhaustion so `failedEarly` still reaches `ctx.shutdown`. Duplicate POSTs are idempotent (terminal rows fill missing transcript/usage/cost). Late complete on `pending` / `creating` is ignored so a sweeper requeue is not clobbered. Unanswered SIP → `status=failed` `failureCode=no_answer`. Answered session + `taskCompleted=true` → API `completed`. Answered session without `taskCompleted` (or omitted, conservative) → API `incomplete`. Do **not** invent `answeredAt` on the API when the worker omitted it. `DECLINED` / `NOT_BOOKED` after `complete_*` stay `completed` (workflow finished). `incomplete` is not retried by the dialer. Stale sweeper remains the last-resort safety net if every attempt fails.
- **Run:**
  - **Dev:** `npm run start:worker:dev` → `tsx apps/worker/src/main.ts dev` (real TS entry for LiveKit job forks).
  - **Prod:** `npm run build:worker` (`tsc` ESM emit + `dist/apps/worker/package.json` type module) then `npm run start:worker:prod` → `node dist/apps/worker/main.js start`. Docker/Railway use the same (`Dockerfile.worker` multi-stage).
  - **Do not** use Nest webpack (`nest build worker` / `nest start worker`) for the LiveKit agent — that path is a deprecated stub.
- One LiveKit dispatch name serves both directions; persona + task come from job metadata.

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
- Examples: `admins.repository.ts`, `organizations.repository.ts`, `users.repository.ts`, `agents.repository.ts`, `organization-agents.repository.ts`, `sip-trunks.repository.ts`, `sip-dispatch-rules.repository.ts`, `calls.repository.ts`, `organization-queue-settings.repository.ts`, `call-batches.repository.ts`, `integration-endpoints.repository.ts`.
- `users` HTTP is org **members** only (admin create/list/invite). Org-user agent CRUD (`/api/users/agents`, `/api/users/agent-templates`) lives in `agents/user-organization-agents.controller.ts` next to the admin org-agent controller. Do not put agent routes back on `UsersController`.
- URL slugs (`organizations.slug`, org-agent `slug`, tool-profile `key`) use `slugify` / `SLUG_PATTERN` in `apps/api/src/common/slug.ts`. Org-agent empty input falls back to `agent` via `agents/slug.util.ts`. Voice/TTS override fields on template vs org-agent PATCH live in `agents/dto/voice-settings.dto.ts`.
- Pack org-agent LiveKit job metadata with `packOrgAgentJobMetadata` (`apps/api/src/agents/job-metadata.ts`) — inbound SIP dispatch, outbound dial, and org web test. Do not copy prompt/voice/tools assembly. Inbound draft publish batch uses `runPublishBatch` (`sip-trunks/lib/publish-batch.ts`).
- Load an active org agent + template with `requireActiveOrgAgent` (`calls/lib/require-org-agent.ts`) before enqueue, immediate outbound, or org web test. Claimed-queue dial keeps its own failure path. Map call rows with `toCallResponse` (includes `cost` by default).
- Queue env ints parse with `queuePositiveInt` (`queue.defaults.ts`). Dialer tick is `@Interval(QUEUE_DEFAULTS.dialerIntervalMs)`.
- `livekit` is an infrastructure adapter (service only), not a repository-backed domain module.
- `email` is an infrastructure adapter (global `EmailService` only), not a repository-backed domain module. Uses Plunk `POST /v1/send`.
- `ghl` is an infrastructure adapter (`GhlService` + worker-secret calendar controller). Calendar tools resolve org GHL connections; get-demo CRM stays env. Not a repository-backed domain module.
- `demo` is a thin public proxy (no repository): `DemoAbuseGuard` (origin + rate limits) → GHL upsert (best-effort) → `ENDPOINT_URL` + `SPEEKO_API` → integration enqueue.
- `queue` uses raw SQL for atomic claim (`FOR UPDATE SKIP LOCKED`) via TypeORM `DataSource`; settings/batches use repositories.
- `price` is a catalog + calculator (`PriceService`). Inject it; do not inline LiveKit rates in `calls`. Worker complete appends one cost attempt (including requeue). Call DTOs include `cost` (`null` until priced). Portal shows the snapshot on the org calls tape / dossier and admin all-calls / overview. `GET /api/users/costs/summary` is JWT-org only; `POST /api/admin/costs/recompute` stays admin.

## Coding guidelines

1. Put HTTP surface area only in `apps/api`.
2. Put LiveKit agent job work in `apps/worker` (tsx + `@livekit/agents`, not Nest webpack).
3. Validate all inputs with `class-validator` DTOs; document with `@nestjs/swagger`. Success **and** error HTTP codes belong on the route (`ApiJwtErrors`, `ApiNotFoundError`, `ApiConflictError`, …) using `ErrorResponseDto`.
4. Never commit real secrets; use `.env` (gitignored) + `.env.example`.
5. Prefer clear module boundaries: `auth`, `admins`, `organizations`, `users`, `agents`, `tools` (profiles), `integration-endpoints`, `organization-integrations` (Nylas + GHL calendar keys + worker Nylas proxy), `demo` (get-demo proxy), `sip-trunks`, `sip-dispatch-rules`, `calls`, `queue`, `price` (LiveKit list-price cost analysis, no markup), `livekit` (adapter), `email` (Plunk adapter), `ghl` (GoHighLevel adapter + worker GHL calendar proxy).
6. Persistence: one custom repository per entity; services own business logic only.
7. When adding telephony (numbers, trunks, dispatch rules) or schema for calls/queue, update Erflow + this file in the same change set.
8. **Update this AGENTS.md** when project conventions, scripts, schema ownership, or Railway deploy layout change.
9. Treat `organizations` as the hub for users, AI agents, calls, queue settings, batches, SIP trunks, dispatch rules, and future phone numbers.
10. Keep LiveKit Inference model pins in `apps/worker/src/models.ts`.
11. Keep LiveKit SDK usage inside `livekit/`; calls, sip-trunks, and sip-dispatch-rules orchestrate via `LivekitService`.
12. **API owns outbound SIP dial** (`CreateSIPParticipant`) **and the outbound dial queue**; worker stays voice-only + inbound-ensure + complete callback.
13. Never return SIP `auth_password`, integration `key_hash` / full API keys (except once on create/rotate), or `organization_integrations.api_key` in API responses.
14. **System prompts = persona only**; workflows live in LiveKit Tasks; tools are worker registry code enabled by tool profiles. **Org users only enable tools the admin assigned** (`organizations.allowed_tool_ids`). New orgs get `["endCall"]`. **Existing orgs stay `null` on deploy** (full catalog) until an admin saves the Tools tab. Pack `enabledTools` through `resolveEnabledToolIds(profileId, organizationId)` so job metadata is the allowlist ∩ profile (`null` does not strip). Do not hardcode the full worker catalog in the org portal — fetch `GET /users/tool-profiles/known-tools`.
15. Metadata is the single runtime config source for the worker — no DB access from the worker.
16. Never put executable code or full JSON tool schemas in metadata / Postgres tool profiles (ids only).
17. Inbound config is **draft-then-publish**: local rows first; LiveKit ids set only on publish (409 if already live). **Inbound trunk delete** removes the LiveKit trunk when live, then the local row (not-found on LiveKit is ignored). Outbound trunk delete and dispatch-rule delete remain local-only unless updated.
18. Queue dialer runs in the Nest API process (`@nestjs/schedule`); do not move dial ownership into the LiveKit worker.
19. **Product UI** lives in `apps/web` (marketing) and `apps/portal` (auth + dashboards). Both reuse `@call-agent/ui` (`packages/ui`) for buttons, forms, badges, cards, chips, alerts, and motion primitives. Import `@call-agent/ui/styles.css` once per app. Do not re-duplicate design tokens or keyframes in page-local styles. Do not put dashboard/auth code in marketing or marketing landing pages in portal.
20. All outbound email goes through `EmailService` (Plunk); do not call the Plunk API from other modules. Treat send failures as non-fatal for product flows.
21. All GoHighLevel CRM and calendar HTTP goes through `GhlService`; do not call `services.leadconnectorhq.com` from other modules. Treat upsert failures as non-fatal for get-demo. Never log `GHL_API_KEY` or `GHL_CALENDAR`. Never return existing GHL appointments to the agent (free slots only).
22. **Add or update unit tests** when changing service business rules, guards, or security-sensitive paths (see **Testing**). Prefer service-level unit tests over full e2e unless the flow is HTTP-guard integration.
23. **Call status writes go through `applyCallEvent` / `initializeCallStatus`** (`apps/api/src/calls/lib/call-state-machine.ts`). Do not assign `call.status = …` in services. SQL claim/release must keep the same pending↔creating pair. `completed` requires worker `taskCompleted: true`; answered hangup without `complete_*` is `incomplete`.
24. **Call cost analysis goes through `PriceService`** (published LiveKit list prices, `markup: 0`). Do not add Speeko margin. Org-user cost APIs must scope by JWT `orgId` (never a client `organizationId`). Recompute stays admin-only. Bump `PRICE_CATALOG_AS_OF` in `price.catalog.ts` when LiveKit rates change.
25. **Shared wire types and catalogs live in `packages/contracts` (`@call-agent/contracts`).** Add a new tool id, task key, call status, failure code, delivery mode, TTS/LLM/realtime model/voice, or job-metadata field there first. API Nest DTO **classes** stay in `apps/api` (class-validator / Swagger); they import enums/consts from the package. Portal and worker import the same types — do not copy catalogs into `apps/portal/src/lib/api.ts` or worker `tool-ids.ts`. Build with `npm run build:contracts` (also run by `build:api` / `build:worker`). Vite apps alias the package to source.
26. **HTTP errors use one JSON shape** (`statusCode`, `error`, `code`, `message`) from `HttpExceptionFilter`. Path-param UUIDs use `ParseResourceIdPipe(resource)` so invalid ids are **404**, not 400. Do not assign `res.status` ad hoc; throw Nest HTTP exceptions. Portal resource pages must show `ResourceNotFound` on 404, not `ErrorBlock` + Retry.

## Testing

Unit tests use **Jest** + **ts-jest** + **`@nestjs/testing`** from the monorepo root. Specs live next to the module under a `test/` folder (not colocated `*.service.spec.ts` in the module root).

### Commands

```bash
# All unit tests (any **/*.spec.ts under apps/)
npm test

# One module
npx jest --testPathPatterns=auth/test --no-coverage
npx jest --testPathPatterns=admins/test --no-coverage
npx jest --testPathPatterns=demo/test --no-coverage
npx jest --testPathPatterns=users/test --no-coverage
npx jest --testPathPatterns=organizations/test --no-coverage
npx jest --testPathPatterns=organization-integrations/test --no-coverage
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
| **Dependencies** | Mock repositories / sibling services / `ConfigService` / external I/O (`fetch`, LiveKit, Plunk) — **no real Postgres** in unit tests |
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
| Repository | No | TypeORM only; integration tests later if needed |
| Worker tasks/tools | Later | Pure helpers first; LiveKit session code is integration-heavy |
| Portal / web SPA | Later | Not in the Jest API suite today |

### Coverage plan (API modules)

Work **top-down by risk**: security → money/dial side effects → multi-tenant data → thin adapters.

| Priority | Module | Status | Primary cases |
|----------|--------|--------|----------------|
| P0 | `auth` | **Done** | Login isolation, inactive admin/user/org, JWT live revalidation, Admin/User/WorkerSecret guards, login rate limit, protected routes, self-service display-name PATCH |
| P0 | `admins` | **Done** | Email normalize, findById/email, create defaults (`isActive`, name) |
| P0 | `demo` | **Done** | Config gate (503), body shaping, `fetch` proxy, 401/403 vs generic 502, GHL upsert before enqueue (CRM fail does not block dial), origin + IP/phone/email/global rate limits |
| P0 | `users` | **Done** | Create user, org scope, password hash, unique email per org, toSafeUser redaction |
| P0 | `organizations` | **Done** | Create org, slug uniqueness/lowercase, name trim, `isActive` default, `allowedToolIds: ['endCall']` seed, findById/Slug/IdOrSlug |
| P0 | `common` (HTTP errors) | **Done** | Exception filter body (`code` + `statusCode`), unknown throws do not leak, `ParseResourceIdPipe` 404 on non-UUID path ids |
| P1 | `integration-endpoints` | Todo | API key hash/prefix, rotate, public enqueue merge context, inactive key reject, never leak secrets |
| P1 | `queue` | **Done** | Claim/retry classification, backoff, quiet hours, batch pause/cancel, stale dialing/ready sweeper (mock `DataSource` / time), outbound-only in-progress / dial-rate counts (inbound rings do not occupy dial slots) |
| P1 | `calls` | **Done** | Enqueue vs immediate outbound, metadata pack, complete + requeue, org scoping on list/get, **state machine** (`taskCompleted` → completed vs incomplete), cost snapshot on complete (append / fill / requeue-before-reset), late complete on pending/creating ignored, **inbound SIP ensure** (upsert by room, never requeue, stale inbound terminal-fail) |
| P1 | `agents` / org agents | **Done** | Create/clone/slug collision, persona vs template isolation, hook null/empty/whitespace, calendar same-org FK, FK-blocked delete, voice/speakingRate/deliveryMode copy + template fallback |
| P1 | `tools` (profiles) | **Partial** | Org allowlist lazy-repair / replace / unknown-id reject; org custom create blocked when tool not assigned; `resolveEnabledToolIds` intersects with org allowlist (platform templates unfiltered); org A vs B isolation. Remaining: platform vs org custom CRUD, delete-if-unused |
| P2 | `price` | **Done** | Gemma/Nova-3/Inworld list-price math, web vs SIP room lines, self-hosted vs Cloud agent session, 10s min, unknown models, attempt rollup, admin summary SQL, recompute skip/404, org-user summary JWT-org scoped |
| P2 | `sip-trunks` / `sip-dispatch-rules` | **Done** | Draft vs publish, password redaction, inbound LiveKit delete (404 ignore), dispatch metadata pack, LiveKit adapter mocked |
| P2 | `organization-integrations` | **Done** | Secrets never returned (mapper + CRUD), Nylas + GHL create/test, calendar resolve/freeBusy matrix (Nylas mocked) |
| P2 | `email` | **Done** | Soft-disable without key, never throws, Plunk `send` / `sendText`, never log API key |
| P2 | `ghl` | **Done** | Soft-disable without key/location, upsert + tags/note, org calendar creds + listCalendars, never throws, never log token, free-slots map + ms query, `lookupGhlContact` / `upsertGhlContact` persist `ghlContactId`, phone-like `contactId` ignored, contact-not-found ≠ busy slot, book does not create contacts, hide existing events |
| P2 | `livekit` | **Done** | URL helper; adapter with mocked SDK (rooms, dispatch, token/meet, SIP trunks/rules/participant, hasRemoteCallee) |
| P3 | Worker (`apps/worker`) | Partial | SIP answer wait + unanswered shutdown (`sip-answer` polls `sip.callStatus` + logs disconnect reason, `shutdown-status` including `taskCompleted`); job entry `runAgentJob` (web skips SIP wait, **outbound** waits for SIP answer, **inbound ringing skips `waitForSipAnswer` then `session.start`**, unanswered `failedEarly` skips shutdown complete, 30-job sequential feed with timeout instead of real dial/session, **inbound live job-metadata refresh then ensure then complete**); `buildClosingSpeech` (silent/custom/default; **realtime skips `session.say`**); **`composeTaskInstructions` copies persona into every task prompt**; realtime chat-ctx strip of `agent_config_update` / `agent_handoff` (OpenAI/xAI `livekitItemToOpenAIItem` throws otherwise); `interview_booking` identity-then-congratulate-then-book instructions (tool-agnostic); job metadata `speakingRate`/`deliveryMode`/`ttsModel`/`model`; TTS/LLM option helpers + OpenAI/xAI plugin constructors (missing key throws); **complete callback timeout + retry** (`call-callback`) + **inbound ensure** + **inbound job-metadata**. Remaining: other prompt/tool/task builders, hangup helpers — no LiveKit cloud in unit tests |
| P3 | Portal / web | Todo | Separate tooling later (Vitest/Playwright); not part of root `npm test` yet |

Update the **Status** column when a module suite lands or expands.

### Checklist when adding a module suite

1. Create `apps/api/src/<module>/test/<focus>.spec.ts`.
2. Mock all I/O (repo, `fetch`, ConfigService, LivekitService, EmailService).
3. Cover success + primary failure paths (404/409/401/403/503 as applicable).
4. For multi-tenant code: assert **org A cannot read/mutate org B**.
5. For secrets: assert response mappers / services never return hashes or full keys (except documented create/rotate once).
6. Run `npx jest --testPathPatterns=<module>/test --no-coverage` and fix failures before commit.
7. Tick status in this section when the first solid suite exists.

### Not in unit tests (use manual / deploy smoke)

- LiveKit room/SIP against real cloud
- End-to-end inbound ring against LiveKit Cloud (unit tests cover ensure + complete; not a real SIP INVITE)
- Railway production DB / `synchronize` side effects
- Marketing get-demo against real `ENDPOINT_URL` (unit suite mocks `fetch`)

## What not to do

- Do not mix platform admin and org-user identity tables or JWT `typ` checks.
- Do not log passwords, JWT secrets, SIP auth passwords, integration API keys, `GHL_API_KEY`, or `GHL_CALENDAR`.
- Do not skip Erflow updates after schema edits.
- Do not confuse user role `agent` with the `agents` / `organization_agents` AI tables.
- Do not put agent resolution or call lifecycle into `LivekitService` — keep it a thin adapter.
- Do not call Plunk (or any mail SDK) outside `email/`; inject `EmailService` instead.
- Do not call the GoHighLevel API outside `ghl/`; inject `GhlService` instead.
- Do not dial SIP from the worker — keep dialing + queue claim/retry in the API for continuous/outbound orchestration.
- Do not skip org queue settings when adding bulk outbound paths — enqueue should create `call_batches` and respect concurrency/rate limits via the dialer.
- Do not encode workflow steps (“call John…”, “ask these questions…”) in the system prompt — use a Task.
- Do not mark a call `completed` just because the session ended. `completed` means `task.complete()` ran. Conversation-without-task is `incomplete`. Do not retry `incomplete` through the dial queue.
- Do not load tool implementations from the database — only tool **ids** via profiles.
- Do not let org users pick worker tools the admin has not assigned. Do not pack unassigned tools into org job metadata (intersect with `allowed_tool_ids`). Do not hardcode `KNOWN_TOOL_IDS` as the org-user profile catalog.
- Do not let the worker query Postgres.
- Do not add a product UI until endpoints are solid in Swagger (unless explicitly requested).
- Do not run the LiveKit worker via Nest webpack (`nest start worker`). Dev: `tsx apps/worker/src/main.ts`; prod: `node dist/apps/worker/main.js start` after `npm run build:worker`.
- Do not pack a unique `callId` into SIP dispatch-rule metadata (it is a pointer at publish). Inbound jobs re-fetch live org-agent metadata via `POST /api/internal/organization-agents/:id/job-metadata` before building models, then upsert the tape via `POST /api/internal/calls/inbound` and complete on `POST /api/internal/calls/:id/complete`. Do not requeue inbound rows through the outbound dialer. Do not require a dispatch-rule republish for Voice-tab model/TTS changes.
- Do not invent a second design system — extend `packages/ui` (`@call-agent/ui`) for shared primitives; keep page layouts in `apps/web` (marketing) and `apps/portal` (ops).
- Do not duplicate tool ids, task keys, call statuses, or job metadata in portal/API/worker — change `@call-agent/contracts` first.
- Do not inline LiveKit STT/LLM/TTS/room rates in `calls` — use `PriceService` / `price.catalog.ts`. Do not treat cost snapshots as tenant invoices (no markup).
- Do not assume GitHub autodeploy — production is Railway CLI `railway up` from the monorepo root unless that is reconfigured. Do not redeploy every service for a single-app change; match the table under **Production deploy (Railway CLI)**.
- Do not rely on TypeORM synchronize to drop removed tables in production — deploy code, then run explicit SQL when intentional.


