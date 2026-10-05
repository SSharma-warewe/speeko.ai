# Deployment instructions

Scope: `railway` configs; root Dockerfiles and deployment work must also consult this guide as directed by [root instructions](../AGENTS.md). The complete runbook and environment ownership catalog are included below; [README](README.md) is a section index.

## Services and deployment boundaries

- Recorded project/environment: `practical-spontaneity` / `production`; confirm live selection before any production command. CLI uploads from monorepo root are the documented deployment path, not assumed GitHub autodeploy.
- Services: api, worker, whatsapp-worker, web, portal, Postgres. Each app service has a root `Dockerfile.<service>` and intended `railway/<service>.toml`; Postgres is managed separately. Confirm selected config/Dockerfile in live service settings; files are not proof of dashboard configuration.
- Voice worker image includes the loopback Sarvam Python sidecar. WhatsApp worker is a separate private dual-stack service on 8082; Postgres is private. API public callbacks and web/portal domains have different networking requirements.
- Web serves `dist` without `-s` for route SEO shells; portal uses `serve -s dist`. Public edge target ports must match listeners. Vite values are build-time inputs: variable changes require SPA rebuild, not restart.
- Match deployment to changed consumers: API domain → api; voice/tasks/Sarvam → worker; ADK runtime → whatsapp-worker; marketing → web; ops UI → portal; shared contracts/UI → affected consumers only.
- Runtime key ownership and references are in the runbook. Never print/commit real Railway secrets, copy API Meta/GHL/OTP encryption values to workers, or bake secrets into Vite.
- WhatsApp task protocol rollout drains executing turns, deploys compatible workers first, verifies health/version, then API and portal when affected. Preserve pending/uncertain sends and OTP encryption key. Rollback must keep compatible API/worker contracts paired.

## Naming, commands, and changes

- Keep existing service/config/Dockerfile names and root build context. Use explicit service/environment flags rather than the linked-service default. Use descriptive deployment messages.
- Confirm state with `railway whoami`, `railway status`, `railway service list`; deploy with `railway up -s <service> -e production -m "reason" -d -y`. Detached success means queued; verify deployment status/logs afterward.
- Restart reuses the image; redeploy uses the last uploaded source and may rebuild; up uploads current source. See runbook for environment selection, status/logs, variables, SSH, smoke checks, and official CLI references. Do not print variable lists in shared logs.
- Confirm with the user before destructive production actions such as down, data DROP/TRUNCATE, or operations that intentionally drop shared traffic/data. Do not infer permission from this guide.
- Schema changes belong to API's [schema workflow](../apps/api/docs/schema.md); TypeORM synchronization is not a reviewed production removal/migration plan. Do not execute example SQL automatically.
- For config changes, update the corresponding Dockerfile/config/runbook and app instructions together. Mark account-specific URLs/regions as recorded context and reconfirm before use.

## Verification

- Check Docker build context, copied packages, script names, entrypoints, runtime/build env ownership, bind addresses, ports, health checks, and selected service/config.
- After an authorized deploy, verify terminal deployment status, API Swagger, affected SPA deep links/HTML, voice registration plus sidecar health, or WhatsApp readiness/protocol as applicable. Upload completion alone is not rollout success.
- Documentation-only changes need link/command/config review, not production deploys or service restarts.

## Deployment runbook

## Services and build context

Recorded project is `practical-spontaneity`, environment `production`; recorded region was typically `sfo` (reconfirm current Railway region/settings). CLI uploads use the monorepo root and service-specific root Dockerfiles. Do not assume GitHub autodeploy. Config files below express intended settings; confirm the config selection in each live service.

| Service | Dockerfile / config | Recorded access | Entrypoint / port |
| --- | --- | --- | --- |
| api | [Dockerfile.api](../Dockerfile.api), [api.toml](api.toml) | https://api-production-4df4.up.railway.app | node dist/apps/api/main.js; 0.0.0.0, PORT default 3000 |
| worker | [Dockerfile.worker](../Dockerfile.worker), [worker.toml](worker.toml) | recorded health domain https://worker-production-fdde.up.railway.app; voice connects outbound to LiveKit | /app/start-with-stt.sh; SDK production health 8081, sidecar loopback 8091 |
| whatsapp-worker | [Dockerfile.whatsapp-worker](../Dockerfile.whatsapp-worker), [whatsapp-worker.toml](whatsapp-worker.toml) | private http://whatsapp-worker.railway.internal:8082 | node dist/apps/whatsapp-worker/main.js; dual-stack, PORT default 8082; /health |
| web | [Dockerfile.web](../Dockerfile.web), [web.toml](web.toml) | https://speeko.ai | serve dist, no -s; 0.0.0.0, PORT default 3000 |
| portal | [Dockerfile.portal](../Dockerfile.portal), [portal.toml](portal.toml) | https://portal.speeko.ai | serve -s dist; 0.0.0.0, PORT default 8080 |
| Postgres | managed Railway PostgreSQL | private; recorded host postgres.railway.internal | PostgreSQL; inspect live service variables |

- Root upload context must include shared packages and app files copied by the selected Dockerfile. Node images currently use Node 22; voice image also installs the pinned Python plugin requirements and CA certificates.
- Voice starts the Python sidecar, waits for loopback health, then runs compiled Node. Sarvam code changes deploy worker, not a separate service.
- CLI-created WhatsApp service may select its Dockerfile through `RAILWAY_DOCKERFILE_PATH=Dockerfile.whatsapp-worker`; confirm actual config/start/health settings, not only the intended TOML.
- Public domain targetPort must match the actual PORT listener. Static web must preserve per-route shells; portal needs SPA fallback.
- Railway private DNS can resolve IPv6. WhatsApp is dual-stack; API currently binds IPv4. Test worker callback reachability; use the API's public HTTPS origin if the private API address is unreachable. Do not expose WhatsApp worker publicly to fix callback networking.
- Postgres has no assumed public TCP proxy. Use an authorized dashboard query or service-side connection/tunnel when needed; never assume a random laptop can reach its internal address.

## CLI setup, deployment, and inspection

Examples run in PowerShell from `C:/call-agent`. Install/login/link the CLI when needed, then verify the intended existing project. Do not let a missing link silently create a new project. CLI availability/version must be checked on the machine performing the operation.

```powershell
railway login
railway link
railway environment production
railway whoami
railway status
railway service list
```

Select service/environment explicitly where supported. Restart/redeploy use the verified linked environment, so select production and inspect status immediately before them. Commands/flags below were checked against official [up](https://docs.railway.com/cli/up), [deployment](https://docs.railway.com/cli/deployment), [logs](https://docs.railway.com/cli/logs), [variable](https://docs.railway.com/cli/variable), [environment](https://docs.railway.com/cli/environment), [restart](https://docs.railway.com/cli/restart), and [redeploy](https://docs.railway.com/cli/redeploy) documentation on 2026-10-05; check installed help if it differs.

```powershell
# Upload/build one affected service; choose the applicable line
railway up -s api -e production -m "API change" -d -y
railway up -s worker -e production -m "Voice change" -d -y
railway up -s whatsapp-worker -e production -m "WhatsApp runtime change" -d -y
railway up -s web -e production -m "Marketing change" -d -y
railway up -s portal -e production -m "Portal change" -d -y

# Bounded status/log inspection after detached upload
railway deployment list -s api -e production --json
railway logs -s api -e production --latest --lines 100
railway logs -s api -e production --build --latest --lines 100

# Optional build log stream (not proof that runtime is healthy)
railway up -s api -e production -m "API change" -c

# Existing-source operations: verify linked environment first
railway environment production
railway status
railway restart -s worker -y
railway redeploy -s api -y

# Variable list can display secrets: use a private terminal, not shared logs
railway variable list -s api -e production
# Example non-secret runtime value; changes can trigger deployment
railway variable set -s worker -e production LIVEKIT_NUM_IDLE_PROCESSES=1 --skip-deploys
```

`up` uploads current source; detached return confirms queuing, not successful rollout. Inspect the target deployment until terminal success/failure and verify runtime. `--ci` streams build output; a completed build does not prove external dependencies or product flows. Restart reuses the existing image without a build; redeploy uses previously uploaded source without a new upload and may rebuild, so do not describe it as guaranteed image reuse. Use up for new local changes.

Secret updates use Railway's secret UI/references or a private stdin-based variable workflow; never paste literal secrets into docs/chat/committed scripts. Variable set can trigger deployment unless suppressed; choose deployment sequencing deliberately. SSH uses the verified linked environment and explicit service (`railway ssh -s api`), and may need suitable SSH credentials. Confirm installed help before scripted remote commands.

## Select affected services and configure environment

| Change | Services |
| --- | --- |
| API routes/entities/queue/SIP/integrations/harness/price | api |
| Voice tasks/tools/builders/models/speech or Sarvam bridge | worker |
| WhatsApp ADK model execution/checkpoint/tool transport | whatsapp-worker |
| Marketing/get-demo UI/SEO/public files | web |
| Org/admin UI | portal |
| Shared UI | affected web/portal consumers |
| Shared contracts | every affected producer/validator/consumer; preserve protocol rollout order |
| Runtime worker variables | deliberate variable deployment or restart of worker; no source upload if code unchanged |
| Vite variables | rebuild affected SPA; restart is insufficient |

Vite build args: web uses VITE_API_URL/VITE_PORTAL_URL; portal uses VITE_API_URL/VITE_MARKETING_URL. VITE_API_URL includes /api; browser-facing API values must be reachable publicly. Marketing sign-in links target the portal; portal branding targets marketing. Changing a Railway variable does not rewrite an already-built SPA bundle.

Server-only credentials remain server-only. API owns DB/JWT/admin seed, integration keys, Meta/GHL/Nylas/Plunk credentials, platform OTP/hash/encryption, and demo endpoint settings. Voice owns LiveKit credentials plus selected model plugin keys. WhatsApp owns OPENROUTER_API_KEY and shared callback secret, never Meta/GHL/OTP encryption credentials. Use Railway reference values such as `${{api.WORKER_CALLBACK_SECRET}}` and `${{api.OPENROUTER_API_KEY}}` on WhatsApp when those values are stored on API for secret referencing; storing a model key there does not make API a model runner.

Worker API_BASE_URL is an API origin without /api. API WHATSAPP_WORKER_URL is the private WhatsApp origin. API_PUBLIC_URL is a public origin without /api/trailing slash for Meta callbacks; API_BASE_URL may be internal for other uses, so do not generate public callbacks from *.railway.internal. Callback secret must match API and both workers. Plunk must be configured on API for invites/resets to actually send; HTTP success alone is insufficient mail verification.

The detailed environment defaults/adapters are retained below. GHL_API_KEY/GHL_LOCATION_ID are get-demo CRM-only, not fallback credentials for tenant calendar/CRM tools. GHL_CALENDAR/GHL_CALENDAR_ID are unused by org tools. ENDPOINT_URL/SPEEKO_API configure demo enqueue only and must never be Vite values.

## Coordinated WhatsApp deployment and recovery

1. Verify worker/API connectivity and secrets; preserve the API OTP_DELIVERY_ENCRYPTION_KEY. Pause relevant ingress/dispatch and drain executing turns for a task-protocol upgrade. Preserve pending/failed/uncertain outbox rows; do not replay archived work.
2. Deploy compatible WhatsApp workers first; verify /health readiness and taskProtocolVersion 1. Do not mix incompatible replicas behind one worker URL.
3. Deploy API, then portal if its configuration UI changed. API checks worker protocol before task jobs and retires historical null-protocol org pending/failed turns while retaining their final sends.
4. Configure persona/task/GHL source/assigned profile where required. Verify successful booking receipt and final confirmation, next fresh task, refusal, /new generation fencing, and failed/uncertain final-send recovery. Monitor scoped harness health/turn/send diagnostics.

[TASK-SESSIONS](../apps/whatsapp-worker/TASK-SESSIONS.md) owns exact protocol/lifecycle rollout. [WhatsApp README](../apps/whatsapp-worker/README.md) owns retry/resolve limitations. Rollback keeps task-aware API and worker contracts paired; an older non-task API/worker is not a safe automatic rollback for task-session records.

Historical switch-based predecessor only: when upgrading from the earlier release that supported three harness execution switches, configure/verify workers and optional OTP settings, enable those switches on that predecessor, drain its legacy execution, then replace all old API replicas. A rollback to that predecessor must preserve durable execution switches and is permitted only if compatible with the persisted task protocol. Current code has no execution switches and imports no old in-memory sessions. Do not apply predecessor instructions as current setup.

Unknown Meta/tool writes are not automatically repeated. Org recovery is scoped under /api/users/whatsapp; admin platform recovery under /api/admin/whatsapp. Operator resolve records an independently confirmed outcome; failed-send retry does not rerun model/tools. OTP has status-only admin diagnostics and no manual retry; request a fresh challenge. Drain pending OTP delivery before rotating its encryption key.

## Schema / DB after deploys

API currently uses TypeORM synchronize at startup. The installed builder can remove columns from retained tables; synchronization is not a reviewed migration or data-removal plan. Removing an entity does not authorize dropping its old table. Review intended schema/data impact and use explicitly authorized migrations/removal steps; do not run blanket DROP CASCADE examples. Update [entities/Erflow/schema reference](../apps/api/docs/schema.md) in the same change set, except the specifically recorded historical deferrals. Local DB operations do not change Railway Postgres.

Confirm with the user before destructive production actions: service removal/down, shared DROP/TRUNCATE, or intentional traffic/data loss. Never commit production secrets or query output containing credentials.

## Smoke checks after an authorized deploy

Confirm the latest target deployment reached SUCCESS and remains healthy; inspect bounded latest runtime/build logs for failures. Recorded URLs below require reconfirmation.

```powershell
curl.exe -fSs -o NUL -w "%{http_code}\n" https://api-production-4df4.up.railway.app/docs-json
curl.exe -fSs -o NUL -w "%{http_code}\n" https://speeko.ai/
curl.exe -fSs -o NUL -w "%{http_code}\n" https://portal.speeko.ai/
# Inspect the route's actual title/canonical, not only status
curl.exe -fSs https://speeko.ai/ai-voice-agent
```

For web, inspect affected canonical route HTML, legacy redirect shells, sitemap, robots, describedby/GEO files and GA placement. llms.txt and llm.txt stay identical. Do not assume React-only /signup/wildcards return direct-request redirects from serve without -s. For portal, test a protected deep link and principal loading/redirect behavior.

Voice health requires LiveKit registration and separate Sarvam loopback health; a public domain responding does not prove voice jobs can run. WhatsApp health/protocol must be checked from a network that can reach its private origin; API harness health reports configuration plus dispatch/sender diagnostics. Safe test-account smoke covers inbound persist/async reply, booking/final confirmation/reset, and OTP delivery independently of worker availability when affected. Use authorized test contacts/numbers; do not trigger production calls/messages merely to validate documentation.
## Environment ownership and adapters

### Runtime environment catalog

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
| `SARVAM_API_KEY` | worker | Optional. Required when an agent uses Sarvam plugin models (`sarvam/saaras-v3` or `sarvam/saaras-v3-realtime` STT, `sarvam/bulbul-v3` or `sarvam/bulbul-v3-realtime` TTS). Realtime STT needs a Sarvam plan with realtime streaming. Never in LiveKit metadata or Vite. Missing key **fails** those jobs. |
| `SARVAM_STT_PLUGIN_URL` | worker | Loopback Python `sarvam.STTRealtime` sidecar (`ws://127.0.0.1:8091/stt`). Production image sets this and starts `apps/stt-sarvam`. Node sends the trimmed `SARVAM_API_KEY` on loopback header `X-Sarvam-Api-Key` (not the URL); the sidecar passes that into `sarvam.STTRealtime` and falls back to its own env. Unset = homemade Node adapter (local `tsx`). |
| `WORKER_CALLBACK_SECRET` | API + voice/WhatsApp workers | Required shared secret (at least 8 characters) for authenticated worker callbacks and WhatsApp turn dispatch (`X-Worker-Secret`). |
| `API_BASE_URL` | worker + API | Worker → API origin (may be `http://api.railway.internal:3000` in production). Local default `http://localhost:3000`. |
| `API_PUBLIC_URL` | API | Optional public HTTPS origin for Meta WhatsApp callback URLs (e.g. `https://api-production-4df4.up.railway.app`). No trailing slash, no `/api` suffix. When unset, a public `API_BASE_URL` is used; private/internal hosts fall back to `https://{RAILWAY_PUBLIC_DOMAIN}`. |
| `META_GRAPH_API_VERSION` | API | Optional Graph API version for **org outbound WhatsApp** (default `v25.0`, pattern `v<major>.<minor>`). Origin is fixed to `https://graph.facebook.com`. |
| `WHATSAPP_VERIFY_TOKEN` | API | Optional platform-wide Meta `hub.verify_token`. GET verify succeeds if this matches, even when no org hash matches. Per-org tokens still work. |
| `WHATSAPP_URL` | API | Full platform WhatsApp Cloud messages URL (`https://graph.facebook.com/vN.N/<numeric-id>/messages`) for get-demo OTP and platform receptionist. |
| `WHATSAPP_API_KEY` | API | Bearer token for that messages URL. Never logged, never in Vite. Also used by the WhatsApp receptionist text replies. |
| `OPENROUTER_API_KEY` | WhatsApp worker | Required for Google ADK/OpenRouter `openai/gpt-5.6-luna`. API may hold the value for deployment secret references but performs no model execution. Never logged, never in Vite. |
| `OTP_HASH_SECRET` | API | HMAC pepper for OTP codes and verification tokens. Not the WhatsApp key. |
| `WHATSAPP_OTP_TEMPLATE_NAME` | API | Template name (default `speeko_ai`). |
| `WHATSAPP_WORKER_URL` | API | Required HTTP(S) origin of the dedicated WhatsApp worker. The durable harness is always active. |
| `WHATSAPP_TICKER_MAX_CONCURRENT` | API | Global text-turn capacity across replicas (default 4); each sender tick is capped at four sends. |
| `OTP_DELIVERY_ENCRYPTION_KEY` | API only | Dedicated random 32-byte key (64 hex chars); optional at startup, required for OTP. Malformed supplied keys fail validation. Never send to worker, log or commit. Drain OTP before key rotation. |
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
| `WHATSAPP_WORKER_CONCURRENCY` | WhatsApp worker | Default 4; match intended API dispatch capacity. |
| `WHATSAPP_WORKER_TURN_TIMEOUT_MS` | WhatsApp worker | Default 90000; bounded by worker startup validation (30000–150000). |
| `PORT` | each HTTP listener | Match public target port/private origin; defaults are in the service table above. |
| `CORS_ORIGIN` | API | Comma-separated browser origins; shared normalization also governs demo/OTP abuse guards. |
| `DATABASE_HOST` / `DATABASE_PORT` / `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_NAME` | API | Private DB connection; default local values live in .env.example, production secrets in Railway. |
| `JWT_SECRET` | API | Access-token signing secret; server-only, never exposed to Vite/workers. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | API | Seed absent admin; existing password is never overwritten at boot. |

Inference-backed defaults use LiveKit Inference and cloud TurnDetector v1 without separate provider keys. Explicit OpenAI/xAI/Sarvam plugin selections need their corresponding worker keys; native realtime owns its speech/VAD path. Defaults live in `@call-agent/contracts` (`llmModelSpec` / `ttsModelSpec` / `sttModelSpec`; `null` = Gemma / Inworld / Deepgram Nova-3). Local EOT mini model is **not** loaded (saves ~138 MB idle); in-process Silero VAD remains for barge-in.

**Email (Plunk):** inject global `EmailService` and call `send()` / `sendText()`. Never throws — failures return `{ ok: false }` and are logged (invite/reset also warn at the auth layer). `from` must use a domain verified in Plunk. Soft-disabled without `PLUNK_API_KEY` — production **api** must set this or invites/resets succeed in HTTP but no mail is sent. New hosted Plunk projects use `PLUNK_API_BASE=https://next-api.useplunk.com`.

**GoHighLevel (get-demo leads):** inject global `GhlService` and call `upsertLead()`. Never throws — missing `GHL_API_KEY` / `GHL_LOCATION_ID` or API errors return `{ ok: false }` and are logged (token never logged). Upserts a contact (`source=Speeko Get Demo`), then adds tags `speeko-get-demo` + `direction:…` and a note with team/calls/integrations.

**GoHighLevel (org calendar tools):** `GhlService.getFreeSlots()` / `lookupContact()` / `upsertContact()` / `createAppointment()` / `listCalendars()` with per-request org creds from the linked `organization_integrations` row. `lookupGhlContact` uses PIT-friendly `GET /contacts/search/duplicate` (not OAuth-only `/contacts/lookup`) and writes `ghlContactId` onto `calls.context` when found. `upsertGhlContact` uses the same PIT + location (`POST /contacts/upsert`, source `Speeko Voice Agent`) and writes `ghlContactId` onto `calls.context`. `createAppointment` still needs that contact id — it does not upsert. Phone-like `contactId` is ignored; GHL “contact not found” on book is `missing_contact`, not `slot_unavailable`. Free-slots `startDate`/`endDate` are unix **milliseconds**. Response to the worker is open `{ startIso, endIso }` only (cap 12) — never `GET /calendars/events`. Tokens never logged. Env `GHL_API_KEY` is get-demo CRM only, not org tools. Env `GHL_CALENDAR` is not used by tools.

## Configurable voice-task rollout

Deploy the snapshot-compatible voice worker before the API can dispatch voiceTask snapshots, then API and portal. This change adds API-owned voice_tasks/voice_task_versions, nullable agent/endpoint task FKs and call snapshot JSONB; review the additive schema and API synchronization behavior before deployment. It adds no environment variables or provider credentials. Seven starter definitions seed idempotently; existing agents and queued legacy calls retain their keys until explicitly reassigned.

Verify org/admin task routes, clone/edit/test/publish/version history, agent defaults, outbound overrides, one inbound ring using the exact refreshed version, and configured pipeline/realtime calls. Test bookings only against a deliberate test calendar. Watch validation failures, blocked completion, task/version, incomplete-call rate and booking failures; avoid logging sensitive context/results. Rollback must retain a worker that understands snapshots already saved on calls; do not remove tables or snapshots to roll back the UI/API. Production deployment and live voice/calendar verification were not performed by this local implementation.
