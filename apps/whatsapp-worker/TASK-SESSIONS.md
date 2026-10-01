# WhatsApp channel task sessions

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
