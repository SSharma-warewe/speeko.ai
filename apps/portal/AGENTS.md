# Portal instructions

Scope: `apps/portal`. Inherit the [root instructions](../../AGENTS.md). This app owns org operations, platform administration, login, and account/password flows.

## Architecture and naming

- [App.tsx](src/App.tsx) owns routes. Org pages live in `src/dashboard/user-pages`; admin pages in `src/dashboard/pages`; reusable dashboard components/hooks in their existing folders. Login/password pages live in `src/pages`.
- Use PascalCase component/page filenames and exports, `use…` hooks, existing kebab-case helper files, and lowercase kebab-case URL segments. Keep org and platform-template terminology distinct.
- [lib/api.ts](src/lib/api.ts) is the typed HTTP boundary. Import wire types and catalogs from contracts; do not duplicate enums, model lists, task keys, or response shapes locally. API base is build-time `VITE_API_URL`, default `/api`.

## Authentication and routing

- [auth.tsx](src/lib/auth.tsx) has separate `AdminAuthProvider`/`UserAuthProvider`, `useAdminAuth`/`useUserAuth`, and `RequireAdmin`/`RequireUser`. Guards wait for profile loading before rendering or redirecting.
- Admin tokens use `callagent_admin_token`; user tokens use `callagent_user_token` in localStorage via API helpers. Keep them separate. Refresh calls the matching `/me`; a protected request's 401 clears that principal's token. Scope/provider 403 errors are not logout signals.
- Org login requires email/password/organization slug; admin login is separate. Bearer access tokens have no refresh-token flow. Frontend guards support navigation; API guards and live DB revalidation enforce authorization.
- `/login` → protected `/dashboard`; `/admin-login` → protected `/admin-dashboard`. Public recovery routes: `/forgot-password`, `/admin-forgot-password`, `/set-password`, `/reset-password`, `/admin-reset-password`.
- Org routes include calls/dossiers, batches/details, agents/details, queue, SIP, tool profiles, WhatsApp, CRM, integrations, and account. Admin routes include organizations and nested users/agents/tools/SIP/queue, platform templates, tool profiles, calls, and account. Keep nav, breadcrumbs, and route registrations aligned.
- `/dashboard/enqueue` redirects to `/dashboard/calls?compose=enqueue`; `/dashboard/dial` to `/dashboard/calls`. Unknown authenticated dashboard routes render `ResourceNotFound`. Root/unknown top-level paths redirect to `/login`.
- Resource 404s use [ResourceNotFound](src/dashboard/components/ResourceNotFound.tsx), not a generic error/retry block or login bounce. Use the API client's typed errors for other failures.

## Consistent operations UI

- Reuse [DashboardLayout](src/dashboard/DashboardLayout.tsx), [UserDashboardLayout](src/dashboard/UserDashboardLayout.tsx), shared dashboard CSS, page headers, loading/error/empty states, badges, composers, and detail views.
- Use `@call-agent/ui` and read [UI instructions](../../packages/ui/AGENTS.md) for shared primitives. Import styles once in `main.tsx`; shared token/animation additions belong in UI, app-specific layouts remain here.
- Portal titles and body use IBM Plex Sans, technical values use IBM Plex Mono. [global.css](src/global.css) deliberately overrides marketing's display font; preserve this distinction.
- Preserve the `.ops` shell and scrolling content column, responsive sidebar behavior, consistent spacing/status colors, focus visibility, labels, disabled/pending buttons, and reduced motion. Avoid page-specific reinventions of tables, tabs, or forms.
- Use build-time `VITE_MARKETING_URL` through [marketing-url.ts](src/lib/marketing-url.ts) for cross-app branding links. Marketing landing pages and GA4 belong to web.

## Domain behavior

- Org users run named org agent configurations; admins manage tenants, members, assigned tools, and platform templates. Human member role `agent` is not an AI template. Stored org roles are not currently a separate API permission system.
- Agent persona is identity/tone/policies; workflows use saved voice tasks or legacy code-defined keys. Configured defaults support both directions; calls/batches/endpoints can override them. Preserve hook `null` (default) versus empty string (silent).
- Voice choices come from the shared catalogs. Switching TTS/realtime model requires a compatible voice; show the effective template fallback returned by API. Do not expose platform runtime prompt layers as editable persona content.
- Org profile creation must fetch assigned ids from `/api/users/tool-profiles/known-tools`. Profiles cannot grant tools beyond the admin allowlist; do not use the full exported worker catalog as the org picker.
- Call tapes use `callDisplayOutcome`/`CallOutcomeBadge`; dossiers also show raw lifecycle status. Stale `taskResult` never proves task completion. Cost panels show list-price snapshots with markup zero, not invoices; recompute is admin-only.
- Integrations tabs are Dial, Calendar, WhatsApp, CRM. Calendar providers are `nylas`/`ghl`; `ghl_crm`, `ghl_contacts`, and `whatsapp` are not agent calendars.
- `/dashboard/whatsapp` uses `?tab=` for Send/Connections/Agent/History. Sends select up to 50 contacts and approved supported templates. Agent config includes persona, task, existing voice agent as GHL credential source, and a profile with assigned booking tools.
- `/dashboard/crm` has Contacts, Calendar, Opportunities, Conversations, Workflows, Directory. Explicitly select named CRM connections; requests read/write live HighLevel. Switching contact sources clears recipients and fences stale reads. Each section loads independently; no local mirror/sync or automatic mutation retry. Read [CRM reference](../api/src/crm/README.md).

## Changes and verification

- Update contracts first when HTTP shapes/catalogs change, and coordinate API/worker consumers. For UI-only work, keep server ownership and principal boundaries intact.
- From repo root: `npm run typecheck:portal`, `npm run build:portal`. Check affected org/admin routes, missing resources, loading/failure states, responsive layouts, and correct principal redirects. Existing mapper test: `npx jest --testPathPatterns=portal/src/lib/call-outcome --no-coverage`.
- Local development: `npm run start:portal:dev` on port 5174. Hosting keeps `serve -s dist`; Vite variable changes require a rebuild. Read [deployment instructions](../../railway/AGENTS.md).

## Regression scenarios

Call-tape **Outcome** badge mapper (`callDisplayOutcome`: lifecycle vs `taskResult.outcome`; leftover `NO_ANSWER` ignored). Remaining: Vitest/Playwright for SPA flows

This describes the original coverage intent, not a current test run.

## Complete portal route map

All nested dashboard routes inherit their principal guard and layout. Match detail route parameter names to the implementation.

| Path | Screen / behavior | Principal |
| --- | --- | --- |
| `/login` | Org login: email/password/org slug | Public |
| `/admin-login` | Platform login | Public |
| `/forgot-password` / `/admin-forgot-password` | Matching recovery form | Public |
| `/set-password` / `/reset-password` / `/admin-reset-password` | Invite/user reset/admin reset | Public |
| `/dashboard` | Org overview | User |
| `/dashboard/calls` / `/dashboard/calls/:id` | Calls tape/composer and dossier | User |
| `/dashboard/batches` / `/dashboard/batches/:id` | Bulk groups and batch detail | User |
| `/dashboard/agents` / `/dashboard/agents/:id` | Named configurations and detail | User |
| `/dashboard/queue` | Org queue settings/stats | User |
| `/dashboard/sip` | SIP trunks/inbound dispatch | User |
| `/dashboard/tool-profiles` | Visible profiles and own custom CRUD | User |
| `/dashboard/whatsapp` | Send/Connections/Agent/History | User |
| `/dashboard/crm` | Live HighLevel workspace | User |
| `/dashboard/integrations` | Dial/Calendar/WhatsApp/CRM | User |
| `/dashboard/account` | Profile/password | User |
| `/dashboard/enqueue` | Replace redirect to `/dashboard/calls?compose=enqueue` | User |
| `/dashboard/dial` | Replace redirect to `/dashboard/calls` | User |
| `/admin-dashboard` | Platform overview | Admin |
| `/admin-dashboard/organizations` | Tenants | Admin |
| `/admin-dashboard/organizations/:orgId` | Tenant overview | Admin |
| `/admin-dashboard/organizations/:orgId/users` | Members/invites | Admin |
| `/admin-dashboard/organizations/:orgId/agents` | Tenant configurations | Admin |
| `/admin-dashboard/organizations/:orgId/agents/:agentId` | Tenant agent detail | Admin |
| `/admin-dashboard/organizations/:orgId/tools` | Assigned worker ids | Admin |
| `/admin-dashboard/organizations/:orgId/sip-trunks` | Tenant trunks | Admin |
| `/admin-dashboard/organizations/:orgId/queue` | Tenant queue | Admin |
| `/admin-dashboard/agents` / `/admin-dashboard/agents/:id` | Platform templates | Admin |
| `/admin-dashboard/tool-profiles` | Platform profiles | Admin |
| `/admin-dashboard/calls` / `/admin-dashboard/calls/:id` | Platform calls/dossiers | Admin |
| `/admin-dashboard/account` | Admin profile/password | Admin |
| Unknown nested dashboard route | ResourceNotFound with appropriate back link | Matching guard |
| `/` or other unknown top-level route | Replace redirect to `/login` | Public |

Keep auth-provider boundaries intact during loading and refresh. A user token cannot satisfy RequireAdmin and an admin token cannot satisfy RequireUser. Password-reset HTTP success can be deliberately nondisclosing; do not invent account-existence messages. API revalidates live membership/activity. Frontend guards never authorize a tenant resource.

## Agent, calls, and integration workflows

Org configs have their own name and unique-per-org slug plus template key/id. Many configs may share one inbound/outbound template. Create/clone copies the chosen source; later template edits do not rewrite saved org personas. Preserve effective template fallback for null voice settings.

Legacy inbound defaultTaskKey is required and legacy outbound defaultTaskKey is null. Configured defaultVoiceTaskId supports both directions; calls/batches/dial endpoints can override it. Persona controls company/tone/policies; onEnterInstructions is opening generation guidance and onExitInstructions is a spoken closing line. Null means built-in default and empty means silent. Do not trim silent hooks into null.

Voice UI uses the shared model/voice/language catalogs. Native realtime speech ignores pipeline STT/TTS choices; changing TTS or realtime model changes allowed voices. Speaking-rate controls apply only to supported models and Inworld alone supports delivery mode. Org tools are selected from the API's assigned catalog, never blindly from every exported worker id.

Enqueue creates pending calls and a batch, respecting API queue controls. Immediate dial is a distinct route and bypasses queue concurrency. Pending cancel/retry/prioritize and batch pause/resume/cancel are server actions; never simulate lifecycle changes locally. Dossiers show context, transcript, task outcome, tool events, timestamps, and cost when available. Completed requires explicit task completion; incomplete is not an automatic dial retry. Cost is a frozen list-price analysis with markup zero.

SIP inbound configuration saves drafts before publish. Publish trunks before dispatch rules; already-live publish is 409. Live inbound trunk deletion removes its LiveKit trunk before local deletion; outbound trunk and dispatch-rule deletion are currently local-only. Do not imply local edits automatically synchronize LiveKit.

Dial integrations return an API key once on create/rotate, fixing agent/task/trunk/queue server-side. Calendar connections support nylas/ghl only. WhatsApp webhook setup generates/copies callback URL and verify token and shows the latest 50 org/unmatched events; foreign org events stay hidden. Never display stored secret values from list/detail responses.

WhatsApp Send imports paged contacts and sends approved supported templates to at most 50 recipients using the org Meta number. Render per-recipient skipped/failed/sent results; one recipient failure must not erase other results. Keep org template sends distinct from platform OTP. Agent tab selects persona, task, linked voice agent as GHL source, and a profile whose booking/free-slot/contact tools are assigned. No task means store-only inbound behavior.

## Live CRM scope and mutation semantics

CRM connections use named `ghl_crm` integrations with explicit selection. The tabs are Contacts, Calendar, Opportunities, Conversations, Workflows, and Directory. Load sections independently so a missing scope does not disable the whole workspace. Data comes live from HighLevel; changes write back immediately without a local mirror/background sync.

Contacts cover search/create/edit/delete, tags/DND, address/company fields, text custom fields, notes and tasks. Calendar supports calendar selection, up to 31 days, appointments/free times/book/edit/reschedule/cancel/delete; browser times become explicit-offset/UTC instants. Free-time suggestions default to 30 minutes and can be changed. Opportunities cover pipelines/deals/stage/status. Conversations show paged history and SMS/HighLevel WhatsApp text; never render email HTML as trusted HTML. Workflows enroll/remove contacts from existing workflows. Directory reads tags/custom-field definitions/team members.

Provider scope failures remain 403, not user logout. Contacts-access success proves only that scope. Do not automatically retry writes after ambiguous network failure; ask the user to refresh and inspect the upstream result before retrying. Source switching clears selected WhatsApp recipients and fences stale reads. Calendar configuration, workflow design, email sending, payments, funnels/sites, agency admin and non-text custom-field editing are outside this workspace.

The typed API client calls `POST /api/users/crm/:integrationId/execute { action, params? }` using contracts CRM_ACTIONS. Never send provider credentials, arbitrary URLs, location authority, or unvalidated actions from the browser. Server checks org/location/record/parent-child membership. [CRM reference](../api/src/crm/README.md) lists scopes and exact capabilities.

## Layout, typed errors, and build inputs

Reuse both dashboard layouts, page headers, tables, tabs, composers, status badges, Loading/Error/Empty states, and ResourceNotFound. Keep IBM Plex Sans titles/body, IBM Plex Mono technical values, the .ops scrolling shell and responsive sidebar. Shared tokens/primitives/keyframes belong to UI, page layout belongs here.

Use standard typed API errors: missing resources render ResourceNotFound, authentication 401 clears the matching stored token, and scoped/provider 403 retains login. Match loading/disabled/submitting states and visible focus across forms. Check admin and org contexts independently.

`VITE_API_URL` defaults to /api and `VITE_MARKETING_URL` selects branding links. Values are public build-time inputs and require rebuilding portal. Production `serve -s dist` supplies authenticated deep-link fallback. No GA4 marketing tag is added here.

## Voice task editor and assignment

Organization routes `/dashboard/tasks` and `/dashboard/tasks/:taskId`, platform routes `/admin-dashboard/tasks` and `/admin-dashboard/tasks/:taskId`, and organization-admin routes `/admin-dashboard/organizations/:orgId/tasks` and `/admin-dashboard/organizations/:orgId/tasks/:taskId` use the shared VoiceTasksPage editor. Task APIs are typed in lib/voice-tasks.ts; this client chooses the matching principal/scope. Navigation and organization tabs include Tasks.

Users create or clone drafts, edit objectives/directions, reorder phases with keyboard-usable Move up/down buttons, author typed context/results, and select outcome requirements and code-owned completion checks. Renaming/removing fields updates references. Capability choices use the organization's API-assigned catalog; the selected test agent's effective tools are checked before testing, and the API validates tool/calendar compatibility again. Preview shows the compiled prompt and result definitions. Publish saves pending edits with optimistic revision checks, then creates an immutable version. Conflicts retain local edits. History can copy an older version into a new draft. Archive prevents new assignment; call history uses saved snapshots.

Draft testing uses an existing active org agent's persona, voice, capabilities and integrations, and creates an immutable revision-zero snapshot. The explicit notice warns that tool-enabled tests can create real appointments. Join links open only after successful test creation. Platform template tests choose an organization explicitly. Published platform templates are read-only to org users until cloned.

VoiceTaskSelect provides published choices alongside legacy keys for call tests, outbound dial/batch and dial endpoints. Both inbound/outbound org agents and platform templates expose configured default-task selection; legacy inbound selections remain available. Result dossiers show saved task name/version (or draft revision), outcome and authored fields. Agent defaults, operation overrides and endpoint configuration remain server-resolved, never inferred by the browser.
