# Call Agent Platform

NestJS monorepo for an inbound/outbound call-agent platform (LiveKit planned).

| App | Description |
|-----|-------------|
| `apps/api` | HTTP API + JWT auth + Swagger |
| `apps/worker` | LiveKit voice agent worker |

## Prerequisites

- Node.js 20+
- PostgreSQL 16/17 (local install **or** Docker Compose)

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
cp .env.example .env
```

Defaults:

- Admin: `admin@local.dev` / `Admin123!`
- DB: `callagent` / `callagent` @ `localhost:5432` / `callagent`

### 3. Install & run API

```bash
npm install
npm run start:api:dev
```

- API: http://localhost:3000/api  
- **Swagger UI:** http://localhost:3000/docs  

LiveKit worker (dev):

```bash
npm run start:worker:dev
```

Production worker: `npm run build:worker` then `npm run start:worker:prod`.

## Swagger test flow

1. `POST /api/auth/admin/login` with seeded admin credentials.
2. Click **Authorize** and paste `access_token` as Bearer.
3. `POST /api/admin/organizations` — create an org (`name`, `slug`).
4. `POST /api/admin/organizations/{id}/users` — create an org user.
5. `POST /api/auth/login` with user email, password, and `organizationSlug`.
6. Authorize with the user token and call `GET /api/auth/me`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run start:api:dev` | API with watch |
| `npm run start:worker:dev` | LiveKit worker via tsx (dev) |
| `npm run build:worker` | Compile worker ESM for prod |
| `npm run start:worker:prod` | Run compiled worker with node |
| `npm run build` | Build api + worker |

## Schema & agents

See [AGENTS.md](./AGENTS.md) for conventions and the **required Erflow model update** process after schema changes.

Erflow model: https://app.erflow.io/workspace/my-workspace000/models/eaaca8f3-41cf-429f-9bbc-b31ff2f2292b

## Notes

- TypeORM `synchronize: true` is enabled for early development so tables are created automatically from entities. Plan to switch to migrations before production.
- Auth is **Bearer access JWT only** (no refresh tokens yet).
