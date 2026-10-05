# Call Agent Platform instructions

Scope: the monorepo. Read this file plus the nearest app/package `AGENTS.md` before changes. App guides contain their local conventions and detailed architecture, schema, routes, runtime, and operational material. Reference indexes link to those sections.

## Repository map

- [API](apps/api/AGENTS.md): NestJS HTTP, JWT/tenant authorization, Postgres, SIP dialing/queue, integrations, and durable WhatsApp harness.
- [Voice worker](apps/worker/AGENTS.md): stateless LiveKit Agents execution, tasks/tools, runtime builders, speech, and callbacks.
- [WhatsApp worker](apps/whatsapp-worker/AGENTS.md): private HTTP-dispatched ADK/OpenRouter text execution, with API-checkpointed state.
- [Sarvam sidecar](apps/stt-sarvam/AGENTS.md): loopback Python STTRealtime bridge, shipped inside the voice worker service.
- [Marketing web](apps/web/AGENTS.md): public Speeko pages, SEO/static shells, analytics, and get-demo OTP UI.
- [Portal](apps/portal/AGENTS.md): authenticated org operations and platform-admin dashboards.
- [Contracts](packages/contracts/AGENTS.md): shared wire types, catalogs, identifiers, and lead-quality helpers.
- [UI](packages/ui/AGENTS.md): shared primitives, design tokens, accessibility, and motion.
- [Deployment](railway/AGENTS.md): Railway services/configuration; **also read this guide for root Dockerfiles, deployment commands, environment changes, and rollout work**.

## Shared boundaries and naming

- API owns database persistence, tenant authorization, provider credentials, outbound SIP dial/queue, and durable WhatsApp task/turn/outbox authority. Voice and WhatsApp workers never query Postgres or receive org Meta/GHL/Nylas credentials.
- Voice job config comes from API-packed metadata; WhatsApp execution comes from authenticated versioned turn snapshots/callbacks. Ephemeral runtime objects are allowed; durable decisions remain API-owned.
- Persona is identity/tone/policies; tasks define workflow/completion; tool registries implement capabilities. Profiles/metadata store tool ids, not executable code or JSON tool schemas.
- Shared contracts are the source of truth for wire shapes, tool/task/status/provider ids, and model/voice catalogs. Change them first and update affected producers, validators, and consumers together. Nest DTO classes stay in API.
- Marketing and portal reuse `@call-agent/ui`; extend shared tokens/primitives there, keep page layouts in apps. Each app imports the shared stylesheet once. Do not mix dashboard/auth pages into marketing.
- Product brand is Speeko; existing package namespace is `@call-agent/*` and default LiveKit dispatch name is `call-agent`. Do not rename internal identifiers as a branding cleanup.
- Distinguish AI platform templates (`agents`), named tenant configurations (`organization_agents`), code-defined tasks, capability profiles, and the human member role `agent`. Existing org roles are not a new enforced permission tier.
- Preserve local naming: React pages/components PascalCase; TS feature/helper files kebab-case; types/classes PascalCase; JSON camelCase; mapped DB columns snake_case; task keys snake_case; tool ids camelCase; Python snake_case. Use uppercase `AGENTS.md`.

## Security, schema, and change discipline

- Never commit/log real secrets: passwords/hashes, JWT or worker secrets, SIP credentials, integration/provider keys, OTP codes/proofs/ciphertext, or turn leases. Use gitignored local env/Railway secrets; keep `.env.example` names/defaults accurate. Vite values are public build inputs.
- Admin/user are separate principals. API authorization scopes org resources from the live authenticated principal, not browser-supplied org ids. Frontend route guards do not replace backend enforcement.
- Every table/column/index/FK change follows [API schema and Erflow workflow](apps/api/AGENTS.md#schema-and-erflow): update entities/local schema, read and update the canonical model, refetch to verify, and update DTOs/docs. Existing specifically deferred harness/platform/OTP/task-session synchronization remains outstanding; it does not waive future changes.
- Respect service boundaries for LiveKit, Meta, GHL, Nylas, mail, state transitions, and pricing; read the owning guide before cross-app changes. List-price call costs have markup zero and are not invoices.
- Preserve no-automatic-retry rules for uncertain external writes/sends. Do not infer task success from generated text, a leftover result, or session end.
- Add/update meaningful tests for changed business rules, guards, tenant isolation, redaction, and runtime contracts. [Testing reference](apps/api/AGENTS.md#testing-reference) describes commands and isolated DB requirements.
- Keep instructions maintained at their owner: local conventions and detailed endpoint/schema/runtime/env material directly in scoped AGENTS.md files; reference documents link to their owner. Cross-app work must consult each affected guide. Document current behavior, clearly label historical rollout instructions, and keep documented catalog snapshots aligned with the source package.
- Deployment instructions do not authorize destructive production actions. Confirm with the user before deleting shared data/services or intentionally dropping production traffic.

## Local development and verification

Run commands from the monorepo root unless a command explicitly uses `--prefix`.

```powershell
# PostgreSQL (or use the equivalent local DB from .env.example)
docker compose up -d
# Do not overwrite an existing local environment
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
npm install
npm run build:contracts
npm run start:api:dev
# Other terminals, with their required environment configured
npm run start:worker:dev
npm run start:whatsapp-worker:dev
```

API startup requires `WORKER_CALLBACK_SECRET` and `WHATSAPP_WORKER_URL`; the WhatsApp worker also needs `OPENROUTER_API_KEY` and `API_BASE_URL`. Fill LiveKit credentials before voice startup. Optional local sidecar: `npm run start:stt-sarvam` and set the voice worker's `SARVAM_STT_PLUGIN_URL` to loopback.

```powershell
npm install --prefix packages/ui
npm install --prefix apps/web --legacy-peer-deps
npm install --prefix apps/portal --legacy-peer-deps
npm run start:web:dev
npm run start:portal:dev
```

Defaults: API/Swagger `http://localhost:3000/api` / `http://localhost:3000/docs`; marketing port 5173; portal port 5174; WhatsApp worker port 8082. SPAs proxy `/api` locally. Vite `VITE_API_URL` includes the API prefix; worker `API_BASE_URL` is an origin without `/api`. Cross-links use web `VITE_PORTAL_URL` and portal `VITE_MARKETING_URL`.

Root checks: `npm test`, `npm run typecheck:contracts`, `npm run build:api`, `npm run build:worker`, `npm run build:whatsapp-worker`, and affected SPA typecheck/build scripts. `npm run build` builds contracts/API/both workers, not SPAs. WhatsApp worker uses its separate Node test runner; Sarvam uses pytest. Run checks appropriate to the change; documentation-only edits need links/content/diff checks rather than cloud tests.

Production is documented as Railway CLI uploads from repo root; see [deployment runbook](railway/AGENTS.md#deployment-runbook). Confirm live service/environment before use, deploy affected consumers only, and pair task-protocol-compatible API/WhatsApp workers.

## Detailed guidance retained by scope

The old root guide's technical content is available directly in the guides below. Read affected owners in addition to this shared guide.

- API schema/Erflow, organization hub, entities/relationships and historical deferrals: [API schema](apps/api/AGENTS.md#schema-and-erflow).
- Auth, seeds, integrations, queue retries/sweepers, routes, agent/job shapes, modules, adapters and costs: [API architecture/routes](apps/api/AGENTS.md#architecture-and-api-routes).
- Test conventions/commands, PostgreSQL restrictions, suite references and original scenarios: [API testing](apps/api/AGENTS.md#testing-reference) and local worker/frontend checklists.
- Persona/task/tool composition, SIP gating, pipeline/realtime speech, Hindi handling, providers, Sarvam and callbacks: [voice runtime](apps/worker/AGENTS.md#detailed-runtime).
- ADK dispatch/checkpoints, leases/generation/task fences, receipts/refusal/reset, uncertain sends and protocol rollout: [WhatsApp](apps/whatsapp-worker/AGENTS.md).
- Route metadata/redirects/SEO/GEO/analytics, form states and OTP/demo: [web](apps/web/AGENTS.md).
- Org/admin routes/guards, typed errors/design, agents/calls/integrations, WhatsApp and CRM: [portal](apps/portal/AGENTS.md).
- Exports/catalogs, full dispatch/callback/turn/task wire shapes and consumer builds: [contracts](packages/contracts/AGENTS.md).
- Components/variants, tokens, typography, accessibility, animation and consumption: [UI](packages/ui/AGENTS.md).
- PCM/WebSocket, header/query validation, events, cleanup, setup and tests: [Sarvam](apps/stt-sarvam/AGENTS.md).
- Services/Dockerfiles/configs, recorded URLs/ports, networking, env catalog, CLI commands, smoke and recovery: [deployment](railway/AGENTS.md#deployment-runbook).

Default local DB credentials are the non-production example `callagent` / `callagent` / `callagent` (user/password/database) at `localhost:5432`. Use `.env.example` as the setup template; never overwrite an existing environment. These defaults are not production credentials.

## Cross-app implementation rules

Keep provider HTTP within its owning adapter: LiveKit in API livekit, Meta in meta-whatsapp, Plunk in email, HighLevel in ghl. Domain modules orchestrate through those services. Worker model SDKs remain worker-owned. API owns product/public HTTP; private worker dispatch/health and loopback sidecar protocol stay in their respective apps.

Bulk outbound paths honor org queue settings and batches; inbound rings never consume outbound dial slots or enter outbound retry. Call status uses the API state machine and cost snapshots use PriceService. Never pack a unique callId into a static SIP dispatch rule; inbound jobs refresh metadata and obtain a persisted id for the ring.

Document convention/script/schema/service changes in the owning guide. Keep reference indexes and README links usable; do not replace substantive scoped instructions with a short outline. Update documented type/catalog snapshots with their source contracts.
