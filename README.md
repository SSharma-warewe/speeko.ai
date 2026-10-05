# Call Agent Platform

Multi-tenant inbound/outbound voice and WhatsApp platform. API owns persistence, authorization, dialing, and durable delivery; separate workers execute voice and text models.

| App | Description |
|-----|-------------|
| `apps/api` | HTTP API + JWT auth + Swagger |
| `apps/worker` | LiveKit voice agent worker |
| `apps/whatsapp-worker` | Private ADK/OpenRouter text worker |
| `apps/stt-sarvam` | Loopback Python STT sidecar inside voice service |
| `apps/web` | Public marketing, SEO, and get-demo UI |
| `apps/portal` | Org operations and platform-admin UI |
| `packages/contracts` | Shared wire types and catalogs |
| `packages/ui` | Shared React primitives and styles |

Start with [root AGENTS.md](AGENTS.md), then read the guide in the app/package you are changing. Detailed references: [API architecture](apps/api/docs/architecture.md), [schema/Erflow](apps/api/docs/schema.md), [testing](apps/api/docs/testing.md), [voice runtime](apps/worker/docs/runtime.md), and [Railway deployment](railway/README.md).

## Prerequisites

- Node.js 22 (current production images)
- PostgreSQL 16/17 (local install **or** Docker Compose)
- Python/plugin requirements when using the optional local Sarvam sidecar

## Quick start

### 1. Database

**Option A — Docker** (if Docker Desktop is installed):

```bash
docker compose up -d
```

**Option B — local PostgreSQL**

Create a role and database matching `.env`:

```sql
CREATE ROLE callagent LOGIN PASSWORD 'callagent';
CREATE DATABASE callagent OWNER callagent;
```

### 2. Environment

```bash
cp .env.example .env  # only when .env does not already exist
```

Defaults:

- Admin: `admin@local.dev` / `Admin123!`
- DB: `callagent` / `callagent` @ `localhost:5432` / `callagent`

### 3. Install & run API

```bash
npm install
npm run build:contracts
npm run start:api:dev
```

- API: http://localhost:3000/api  
- **Swagger UI:** http://localhost:3000/docs  

LiveKit worker (dev):

```bash
npm run start:worker:dev
```

Production worker: `npm run build:worker` then `npm run start:worker:prod`.

API startup requires `WORKER_CALLBACK_SECRET` and `WHATSAPP_WORKER_URL`. Run `npm run start:whatsapp-worker:dev` in another terminal with its required `API_BASE_URL`, matching callback secret, and `OPENROUTER_API_KEY`; see [WhatsApp setup](apps/whatsapp-worker/README.md). Fill LiveKit credentials before starting voice.

SPAs use separate installs: `npm install --prefix packages/ui`, `npm install --prefix apps/web --legacy-peer-deps`, and `npm install --prefix apps/portal --legacy-peer-deps`. Run `npm run start:web:dev` (5173) and `npm run start:portal:dev` (5174). Their guides cover routes, auth, UI consistency, and build-time variables.

## Swagger test flow

1. `POST /api/auth/admin/login` with seeded admin credentials.
2. Click **Authorize** and paste `access_token` as Bearer.
3. `POST /api/admin/organizations` — create an org (`name`, `slug`).
4. `POST /api/admin/organizations/{id}/users` — create a member without a password, then complete the emailed set-password invite (configure API email settings).
5. `POST /api/auth/login` with user email, password, and `organizationSlug`.
6. Authorize with the user token and call `GET /api/auth/me`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run start:api:dev` | API with watch |
| `npm run start:worker:dev` | LiveKit worker via tsx (dev) |
| `npm run build:worker` | Compile worker ESM for prod |
| `npm run start:worker:prod` | Run compiled worker with node |
| `npm run build:whatsapp-worker` | Compile private text worker |
| `npm run test:whatsapp-worker` | Build and run text-worker Node tests |
| `npm run test:stt-sarvam` | Sidecar pytest suite |
| `npm run build:web` / `build:portal` | Build each SPA separately |
| `npm run build` | Build contracts + API + both Node workers; excludes SPAs |

## Schema & agents

See [AGENTS.md](AGENTS.md) for shared conventions and [API schema reference](apps/api/docs/schema.md) for the **required Erflow model update** process and the specifically deferred historical updates.

Erflow model: https://app.erflow.io/workspace/my-workspace000/models/eaaca8f3-41cf-429f-9bbc-b31ff2f2292b

## Notes

- TypeORM `synchronize: true` is currently enabled at API startup. It can change/drop columns; use the documented reviewed schema workflow rather than assuming it is a safe migration plan.
- Auth is **Bearer access JWT only** (no refresh tokens yet).
- Production context and commands are in the [Railway runbook](railway/README.md); documentation changes alone require no deployment.
