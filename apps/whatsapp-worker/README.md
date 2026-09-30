# WhatsApp worker — Phase 1

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
4. On the API set `WHATSAPP_HARNESS_ENABLED=true`,
   `WHATSAPP_WORKER_URL=http://127.0.0.1:8082`, and the same callback secret.
   `WHATSAPP_TICKER_MAX_CONCURRENT` defaults to 4 across API replicas.
   Match it to `WHATSAPP_WORKER_CONCURRENCY` (default 4).
5. Configure the existing active org Meta connection, nonempty Agent prompt,
   and webhook subscription. Org Meta/GHL secrets remain on the API.

The rollout flag defaults to false. In that mode the existing org receptionist
continues unchanged. Enable it only after worker readiness. While enabled, an
unavailable worker leaves org turns pending/retryable; it never falls back to a
second generation path. The platform `WHATSAPP_URL` receptionist and get-demo
OTP stay on their existing paths in Phase 1. Do not disable the flag while there
are unresolved harness turns or sends; drain them first to avoid overlapping
the legacy and harness response paths.

## Persistence and execution

- Webhooks save their raw event, then persist eligible org text turns **before**
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

## Deploy

Create a separate Railway service using `Dockerfile.whatsapp-worker` and
`railway/whatsapp-worker.toml`. Worker readiness is `GET /health`.
For CLI-created services, set `RAILWAY_DOCKERFILE_PATH=Dockerfile.whatsapp-worker`
and `PORT=8082`; the Dockerfile supplies the start command. Reference API secrets
with Railway `${{api.WORKER_CALLBACK_SECRET}}` / `${{api.OPENROUTER_API_KEY}}`
variables instead of copying literal values. The worker listens dual-stack for
private networking. If the API only binds IPv4, use its public HTTPS origin for
worker callbacks; this does not expose the private worker.
Set `WHATSAPP_WORKER_URL` to its private HTTP origin, set the API origin on the
worker, and share the callback secret. Deploy the API and worker, smoke-test,
then enable the rollout flag. No marketing/portal build is needed.
This change does not deploy or alter any production database itself.

TypeORM currently synchronizes the four new entities when the API starts.
The Erflow update for these tables was explicitly deferred by the user for
this change and remains outstanding.

## Verification

`npm run test:whatsapp-worker` builds the ESM worker and runs real ADK with
a deterministic local model (no OpenRouter/Meta/GHL traffic).

API unit/regression tests:

```powershell
npx jest --testPathPatterns='whatsapp-harness/test|whatsapp/test|whatsapp-agent/test' --no-coverage --runInBand
```

The PostgreSQL suite is opt-in with `WHATSAPP_TEST_DATABASE_URL` and refuses
anything except the isolated local `whatsapp_harness_test` database on
`127.0.0.1:55439`. It creates/uses the `harness_test` schema and exercises real
row locks, transaction boundaries, duplicate ingestion and restart recovery.
