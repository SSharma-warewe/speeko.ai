# TTS cache integration plan

Research date: 6 October 2026. Implementation update: 8 October 2026. Status: provider adapter repair, automatic local caching, API-authorized Postgres sharing, and persisted policy/portal controls implemented. Nullable agent/template policy resolves off by default. On 8 October the user explicitly deferred Erflow synchronization and authorized incremental production deployment with sharing off and an empty tenant allowlist; live acceptance will be performed by the user. Canonical synchronization remains outstanding. Verified deployment results are recorded below.

## Accounting and rollout verification

Real LiveKit 1.7.1 transport/collector regressions found duplicated generated REST usage: ChunkedStream and StreamAdapterWrapper both emitted usage on the same original provider. Model construction now preserves the original provider and suppresses only redundant wrapper metrics for providers declaring non-streaming capability. Underlying request characters/tokens/audio, independent concurrent sources, interrupted/failed source usage and native streaming remain intact, with caching either On or Off. Replay emits no new synthesis usage. The regression also passes real SDK usage through worker serialization/HTTP callback, API completion persistence and existing pricing without changing rates or using cache counters as billing input.

Enabled jobs log bounded numeric cache-wait and segment-to-first-frame histograms once on disposal. These contain no speech/audio/alignment or request IDs and do not establish receiving-client audible latency. Follow the [live acceptance checklist](tts-cache-live-acceptance.md) for Off/cold/local/shared comparisons, provider reconciliation, interruption and the agreed latency thresholds. Shared testing needs separately authorized tenant enablement.

API production uses `DATABASE_SYNCHRONIZE=false`; the guarded isolated preflight exports only eight additive TTS statements. Automatic startup synchronization is disabled to leave unrelated defaults, retained tables and indexes untouched. The Erflow deferral covers shared storage and both policy columns only. No agent is automatically enabled.

Release verification on 2026-10-08: 725 tests in 59 suites passed, including the complete worker suite, API cache/policy/pricing/completion tests, portal state tests and 14 real isolated PostgreSQL tests. The first run alongside builds produced one fail-closed lookup deadline result instead of a policy 403; the isolated suite and the complete serial rerun passed. Contracts/portal typechecks and API/worker/portal builds passed before release; the schema switch received an additional API rebuild. The eight-statement delta was generated and validated against the disposable fixture, with unrelated default reapplications excluded and automatic production synchronization disabled.

## Verified production rollout

Production release verified on 2026-10-08 from source `857c86c`: worker `d45d9087-7df8-4164-a9ea-ef9d0b1d395f` → additive schema/API `968a71c2-c96b-460b-a650-18821fb92e60` → portal `41504f26-6aa4-4310-bb62-359fe5c302b7`, each SUCCESS with a RUNNING instance. Worker registration/health, authenticated worker-to-API reachability, API routes/guard/schema/defaults/cleanup and public portal assets/deep links passed. All preferences remain null/off, shared flags false and allowlist empty. Existing rows and unrelated schema/services were preserved. See [deployment record](../../../railway/AGENTS.md#shared-tts-cache-rollout). Real provider usage and caller latency remain unverified pending the user's [live tests](tts-cache-live-acceptance.md); Erflow is explicitly deferred and outstanding.

## Completed provider adapter repair

- `createTtsCacheSynthesizer(provider, mode)` adapts fixed phrases while preserving the existing cache-consumer interface. Resolved LiveKit Inference backends (Inworld/Fish, including the default model) use finite `updateInputStream` input and consume streaming audio in order; stream sentinels are ignored.
- OpenAI/xAI/Sarvam retain supported `synthesize()` behavior for finite phrases. Sarvam's finite synthesis uses REST, including Bulbul realtime; automatic generated capture follows the selected session transport. The previous standalone warmup path has been removed by step 1 below.
- Pipeline cache helpers borrow the session provider through an adapter. Every phrase stream closes in `finally`. Borrowed session providers are never closed by the cache.
- Empty results are not published. Iterator failures, SDK terminal error events (which may end iteration normally), and aborted synthesis discard partial captures. SDK error events lack stream identifiers, so a terminal error conservatively invalidates all active captures on that adapter. Parallel phrases share one temporary error listener.
- Verified locally: 9 focused Jest suites / 122 tests passed, covering adapters/cache, provider and agent builders, warmup, agent entry, workflow speech, and tool fillers. `npm run build:worker` passed. Tests use mocked provider I/O; production provider behavior and latency have not been measured.

The 122-test result above records the earlier adapter-only repair. Current verification includes the subsequent automatic cache implementation below.

## Completed step 1: automatic local caching

- One `TtsCacheRuntime` belongs to each enabled pipeline job. Parent and workflow-task builders install the same `createCachedTtsNode` hook; openings generated by `generateReply`, configured/legacy task replies, closings, script speech, and tool fillers share that runtime. Session close, job shutdown, and construction/start failures dispose it. Disabled and native speech-to-speech jobs have no TTS cache. Step 3 below adds the default-off policy gate.
- The user selected preserving first-audio latency. Inworld/Fish use the installed SDK provider sentence tokenizer; OpenAI/Sarvam REST use the SDK's basic 20-character minimum, Sarvam websocket uses its existing 8-character minimum. Final input is flushed. Text is not gathered into an entire reply. Generated xAI word streaming, expressive speech, and changed providers bypass caching and retain the ordinary SDK node.
- A cold generated segment delegates to `Agent.default.ttsNode` with the existing settings and connection options. Playback consumes that stream immediately and captures its original output. At most two segment sources are active (current plus one lookahead). Finite `sayCached` speech supplies one adapted synthesis stream directly to playback. There is no duplicate background fill or broad phrase warmup before pickup.
- SHA-256 identities use tenant scope, resolved provider/model/voice/language/options, PCM format, transport, and transform/compatibility revisions plus exact synthesis text. Known plugin defaults resolve through the same configuration used for provider construction. Inference defaults controlled by the service are marked as provider defaults. Missing organization scope gets a random job scope; call ids and provider secrets are excluded. Finite and generated transforms are deliberately distinct, so they do not share clips accidentally.
- Entries own PCM copies and only safe transcript alignment fields. Hits create fresh frames, refresh synthesis timing, and rebase segment alignments; historical request ids, usage, and arbitrary userdata are excluded. Only complete, nonempty, successful synthesis commits. Interrupted, empty, partial-error, format-mismatched, and terminal-SDK-error results remain eligible for another fill.
- When explicitly enabled, local storage policy bounds eligible pipeline caching: committed storage 16 MiB with LRU eviction and 10-minute TTL; clips at most 1 MiB / 15 seconds; concurrent capture at most 4 MiB. These are accounted PCM/metadata budgets, not total process heap limits. Concurrent identical fills wait at most 25 ms, then may synthesize independently to preserve responsiveness. The first successful publication wins; each live source invocation is counted.
- Cancellation aborts input and active synthesis streams and releases pending fills/capture memory. Cache lookup/copy/publication failures fall back or bypass capture without restarting speech. Cleanup never closes the session-owned provider. SDK generation metrics remain on their ordinary provider path; replay generates no new provider event. Internal counters are diagnostic only, not a billing/savings claim or an exact upstream request/retry meter.
- Verified locally: the full worker Jest suite passes (37 suites / 348 tests), and `npm run build:worker` passes. Tests cover SDK segmentation/final flush, early audio before generated input ends, parent/task attachment, ordered bounded lookahead, xAI/expressive/provider bypass, replay alignment and ownership, finite adapters, interruption, partial failures, tenant/default identities, limits/TTL/LRU, bounded concurrent fills, SIP answer gating, and no startup synthesis. Provider I/O is mocked; live latency, delivery/prosody, and usage reconciliation still require staging validation.

The step 1 pass added no public contract, API, database, environment, or portal changes. Step 2 below adds private cache contracts/API/schema and server configuration; step 3 adds the nullable policy/portal control. Next: user live usage/provider/latency checks and outstanding canonical synchronization.

## Recommended approach

Use automatic, key-based caching at the TTS boundary. Keep the existing persona, opening/closing hooks, tasks, phases, and tool behavior. Cache the audio those paths already produce. Expose a small speech-caching control in the existing voice UI; users should not need to author a separate phrase library.

Working interpretation of “only giving cache keys”: the application derives cache keys and transparently reuses audio. An optional user key is a namespace or invalidation version, not a substitute for text and synthesis settings. A bare key cannot synthesize a cold entry and cannot safely identify audio when its text or voice changes.

This replaces the previous proposal to add fixed-speech authoring to VoiceTaskDefinition. Phrase authoring and deterministic workflow speech are separate product features, unnecessary for cache integration.

## What the documentation establishes

- **LiveKit:** describes application-managed automatic reuse by key, synthesizing on a miss and playing cached frames on a hit. It also identifies a custom TTS node as an integration point for generated pipeline speech and warns that gathering a complete text segment can increase first-audio latency. The documented pattern passes audio into playback; supplying an arbitrary cacheKey to AgentSession is not the pattern shown. [Audio customization](https://docs.livekit.io/agents/multimodality/audio/customization/).
- **Vapi:** its xAI voice guide exposes cachingEnabled, default true, rather than a required phrase-key catalog. Its custom Gradium guide advises disabling caching during voice/pronunciation iteration. These pages do not establish Vapi's internal key formula, retention, or exact cache granularity. [xAI voice options](https://docs.vapi.ai/providers/voice/xai), [custom voice caching](https://docs.vapi.ai/customization/custom-tts/gradium).
- **Pipecat:** documents a separately distributed, community-maintained TTSCacheMixin. It derives keys from text and synthesis configuration, captures provider audio, replays hits, discards interrupted partial results, and supports memory/Redis backends. This is a relevant implementation pattern, not a dependency to install into the Node worker. [TTS cache integration](https://docs.pipecat.ai/api-reference/server/services/tts/tts-cache).
- **ElevenLabs:** recommends hashing text, voice, model, output format, and all audio-affecting settings, then storing generated bytes. This supports deriving the full key internally. It is provider integration guidance, not proof that its hosted agents expose an identical cache UI. [Caching and idempotency](https://elevenlabs.io/blog/text-to-speech-api-integration#caching-and-idempotency).
- **Retell/Bland:** the searches did not establish an explicit public TTS cache-key contract. Do not infer their implementation from knowledge-base caches, prompt caching, voice-model downloads, or call recordings.

Inference from these sources: automatic caching with minimal controls is the better fit for Speeko's existing UI. User-maintained raw audio keys add complexity without solving synthesis, storage, or invalidation.

## Current implementation and remaining gaps

The portal already edits speech model, voice, language, rate, delivery, and opening/closing hooks. Configured tasks already have save/publish/history/draft-test flows. Reuse those screens and existing semantics.

The worker implements the local runtime described above and optional API-owned shared storage for reuse across isolated jobs. [Server process isolation](https://docs.livekit.io/agents/server/options/).

Remaining work:

1. Complete the explicitly deferred canonical Erflow synchronization for the cache table and both `ttsCacheEnabled` policy columns. The production additive schema and off-by-default deployment order are verified; isolated tests do not replace canonical synchronization.
2. Perform the user's live acceptance checklist before separately authorizing shared reuse. Keep shared flags off and the tenant allowlist empty until then. Live authenticated portal interaction remains part of this manual acceptance.
3. Measure real provider behavior, first-audio/pickup latency, cancellation, usage accounting, and tenant isolation before enabling selected test agents. Validate segmentation prosody/context and SDK compatibility on upgrades; bypass any provider path that needs extra buffering or depends on surrounding text.

## Cache identity

Derive an opaque digest from a stable serialization of these inputs:

~~~ts
type TtsCacheIdentity = {
  revision: number;              // serialization/synthesis compatibility
  organizationId: string;        // server-resolved tenant scope
  namespaceVersion: string;      // server-managed invalidation version
  provider: string;
  runtimeModel: string;
  voice: string;                 // resolved default or explicit voice
  language: string | null;       // effective audio-relevant language
  sampleRate: number;
  numChannels: number;
  outputFormat: string;
  options: Record<string, string | number | boolean>;
  transformRevision: string;
  spokenText: string;            // exact segment delivered to TTS
};
// digest = SHA-256(stableSerialize(identity))
~~~

Include effective speaking rate, Inworld delivery mode, and any future pronunciation dictionary, normalization, TTS instruction/style/temperature, or prosody option that affects audio. LLM temperature is not TTS temperature.

Do not include callId: that prevents cross-call reuse. Include task version only when it changes audio-affecting processing; identical text and synthesis settings can otherwise reuse within the tenant. Organization scope is mandatory even when an administrator supplies a namespace.

Preserve punctuation, Hindi script, SSML/expressive markup, and significant whitespace. Apply only the exact same transformations as synthesis. Hashing alone does not provide access control or protect audio/text from unauthorized readers.

If a provider's output depends on surrounding text, synthesis context must enter the identity or that segment must bypass caching. Exact-text reuse intentionally fixes the prior delivery; offer a disable setting for users who prefer fresh variation.

## Runtime integration

Implemented against installed 1.7.1 using a common `ttsNode` hook attached to both parent and AgentTask through their builders, plus the finite helper adapter. `buildModels` returns the original provider to AgentSession. There is one job-local runtime, not stacked provider/node caches. Preserve SDK lifecycle, ordering, cancellation, timestamps, and usage when extending it.

The key belongs at a complete, stable synthesis segment, not at an arbitrary LLM token boundary. Reuse the SDK/provider's existing segment boundaries wherever possible. Never gather an entire generated reply merely to look it up. Bound segment length and waiting time; bypass cache when boundaries or context are unsuitable. Compare first-audio latency against the current streaming/preemptive baseline.

Execution:

1. Receive the exact segment and resolved synthesis configuration.
2. Generate the full identity and check a bounded local cache.
3. For a shared-cache rollout, perform a short-deadline authenticated lookup.
4. On a hit, emit fresh playback frames and any required alignment metadata.
5. On a miss, run the selected provider once and forward audio as it arrives.
6. Capture that same output while streaming. Commit only after successful, complete synthesis. Storage writes must not delay playback.
7. On cancellation/error, discard incomplete capture. Once live audio has started, a failed cache write must not restart speech.
8. If a concurrent fill exists, wait only within a short latency budget. After that, allow independent live synthesis rather than forcing a caller to wait for an entire clip. Deduplicate stored publication and account for every actual provider request.

For fixed legacy say() paths, reuse the decorator/adapters instead of keeping the existing live-plus-background double synthesis. Existing ready cached frames may still be supplied directly through say(text, { audio }). Generated text reaches caching after LLM generation, so it never speaks onEnterInstructions as literal text.

Provider handling:

- Inworld/Fish via LiveKit Inference: stream finite input through updateInputStream and consume audio events; do not call the unsupported synthesize() method. [Node stream reference](https://docs.livekit.io/reference/agents-js/classes/agents.tts.SynthesizeStream.html).
- Sarvam REST and Bulbul realtime: finite fixed phrases use supported REST synthesis; generated streaming capture follows the active TTS path. Include path/version compatibility in identity. [Sarvam plugin](https://docs.livekit.io/agents/models/tts/sarvam/).
- OpenAI/xAI plugin TTS: preserve their installed capabilities and provider settings.
- Native speech-to-speech models: bypass this TTS cache and show unsupported in UI. Bulbul realtime remains pipeline TTS and is eligible.
- Preserve missing-key failures and same-provider behavior. A cache outage is a cache miss, not permission to switch models.

No changes to legacy classifiers, task phase execution, completion gates, booking receipts, or external-write retries are required.

## Storage and cross-call reuse

Implemented step 2 uses the existing Postgres service, as selected by the user. API owns `tts_cache_entries` and worker-secret `POST /api/internal/calls/:callId/tts-cache/lookup` and `/publish`. Each request validates a live agent call/actual room, creating/dialing/ready status, active org and same-org agent/template; tenant comes only from the verified call. Platform jobs without tenant scope stay local. One verified authorization scope drives the operation; caller-supplied organization ids are rejected.

All eligible finite/generated segments may be shared inside the tenant when persisted policy is enabled. `TTS_SHARED_CACHE_ENABLED=false` defaults off in API/worker; API-only `TTS_SHARED_CACHE_ORGANIZATION_IDS` defaults empty. API rechecks live policy/model alongside its existing call/room/tenant authority. Server/policy opt-out stops shared requests, while active local runtimes retain their startup policy/lifetime. The implemented public/persisted control is described in step 3 below.

Versioned contracts use `shared-v1-livekit-1.7.1` and revision-1 PCM s16le envelopes. Transfer base64 JSON; store decoded PCM `bytea` and canonical format/frame/alignment metadata with SHA-256. Validate format/revision, byte/frame consistency, finite safe timings, checksum, at most 2,048 frames, 1 MiB accounted decoded data and 15 seconds. Never serialize SDK objects, historical request ids, arbitrary userdata or provider usage. Safe alignment/audio may contain personal information; log aggregate counters only.

Immutable first publication wins. Hits/duplicates do not extend 24-hour reuse expiry. Caps are 64 MiB/1,024 entries per tenant and 1 GiB/16,384 globally; evict expired then oldest tenant/global clips atomically under a cache-specific transaction try-lock. Busy writes skip. Logical budgets exclude physical table/index/TOAST/WAL/backup sizes. Minute cleanup deletes up to 500 expired rows even with sharing disabled; reuse expiry is strict, physical deletion can lag, and WAL/backups follow existing database retention.

Cache operations, including authorization, use a separate lazy two-connection API pool with immediate saturation bypass, 100 ms connection timeout, 15/150 ms read/write statement limits, 10 ms lock timeout and 20/180 ms operation budgets. Worker local fill waiting plus full remote lookup/validation share one 25 ms budget. Late/corrupt/expired/wrong-format/failed results become misses and never replace live speech. Successful hits enter local memory with min(server expiry, local TTL).

Complete original captures enqueue asynchronous publication: two uploads, at most 4 MiB reserved queue/in-flight bytes, one-second timeout, no retries. Job disposal aborts requests without shutdown drain; borrowed providers stay open. Three transport/server failures back off ten seconds; authorization denial disables sharing for the job. No distributed synthesis lease or startup requests are added. Cache replay emits no new provider synthesis event; source counters are not exact upstream retry/billing meters.

Verified locally on 2026-10-07: 431 tests in 42 affected suites passed, including the full worker suite and 13 real isolated PostgreSQL tests. Contracts typecheck, API build and worker build passed. Physical cache indexes, check constraints and tenant FK were inspected. Tests cover API HTTP authorization/redaction, cross-call worker replay/deadlines/cancellation/outage/queue bounds, Postgres races, immutable winners, budgets, eviction, expiry, contention, rollback, cleanup, cascade, pool saturation and actual Nest module HTTP registration. Commands are recorded in [API guidance](../../api/AGENTS.md#shared-tts-cache). Live first-audio/provider/usage acceptance remains pending.

The additive [schema delta](../../api/docs/tts-cache-schema.dbml) and entity/local isolated schema are prepared. Erflow tools are unavailable; canonical read/update/refetch remains outstanding under the explicit 2026-10-08 release deferral. The earlier local verification preceded the production rollout recorded above. See [API authority](../../api/AGENTS.md#shared-tts-cache) and [rollout guidance](../../../railway/AGENTS.md#shared-tts-cache-rollout).

## Completed step 3: persisted policy and portal controls

AgentVoiceRack now exposes “Speech caching” with Use platform default (Off) / On / Off for templates and Use template default (On/Off) / On / Off for admin-org and user-org editors. It explains eligible repeated audio reuse and authorized cross-call retention up to 24 hours.

Native realtime disables the control with an unsupported explanation while retaining the saved preference. Returning to pipeline restores that preference; Bulbul pipeline realtime remains eligible. Draft previews use the shared resolver and returned default. Unrelated saves preserve null inheritance; failed saves preserve the draft.

Do not require users to type per-utterance keys. If the user's intended workflow specifically needs a key field, label it “Cache namespace” and combine it with the internally generated identity. It cannot override text/voice checks or tenant scoping. A namespace version may support a future explicit reset operation.

Persisted `ttsCacheEnabled: boolean | null` maps to nullable `tts_cache_enabled` columns on agents and organization_agents, default null. Null inherits template policy then false; explicit false overrides true. New assignments inherit, clones preserve raw values and seeds leave existing choices intact. HTTP responses distinguish saved preference, inherited default and effective policy. Existing PATCH DTOs accept only boolean/null and preserve omission.

All API dispatch/live-refresh/web/draft-test paths pack a resolved boolean. Worker parsing accepts only literal true; missing/malformed/fallback metadata stays off. Only enabled pipeline jobs construct runtime/client/hooks. Existing provider bypasses, single-source capture, cancellation, deadlines and provider ownership remain. Local policy is fixed per runtime; API shared authorization can revoke further access immediately without purging stored clips. Sharing still requires flags and tenant allowlist. Keep cache lifetime/backend/budgets server-owned; no phrase lists or WhatsApp speech settings are introduced.

Verified on 2026-10-08: 659 tests across 52 focused suites passed, including the full worker suite and 14 real isolated PostgreSQL tests. Tests cover inheritance/DTOs/assignment/clone/seeds/metadata, actual admin/user HTTP persistence and tenant/principal checks, live opt-out and native preference retention. Contracts/portal typechecks and API/worker/portal builds passed. Synthetic headless Edge exercised all three actual editors for save/reload, inheritance, switching, failed-save recovery, keyboard selection and inspected 390px screenshots. Live provider/latency/usage acceptance remains outstanding. The [policy schema delta](../../api/docs/tts-cache-policy-schema.dbml) requires canonical Erflow read/update/refetch; tools remain unavailable and synchronization is explicitly deferred for this release.

Do not claim Ready because caching was enabled. It is populated opportunistically. Hit-rate reporting can follow after real runtime counters exist; no clip preparation workflow or Generate button is needed for this design.

## Metrics, verification, and rollout

Record hits/misses/bypasses, lookup duration, first-audio delay, cache-write failures, complete/aborted captures, bytes, and actual provider synthesis requests. Preserve per-provider generation usage exactly once; replay has zero new synthesis usage but still incurs transport/session costs. Keep list-price markup zero and existing BYO exclusions. [LiveKit usage scopes](https://docs.livekit.io/testing/observability/data/).

Test these business/runtime guarantees:

- Same text plus resolved configuration yields a hit; different text/voice/rate/delivery/language/format/transform revision yields a miss.
- Null/default resolution matches model-builder, including Hindi persona language.
- Same external namespace across different tenants cannot share audio.
- Misses stream once; concurrent fill waiting is bounded; cancelled/empty/partial clips are never committed.
- Replay preserves frame order, transcript/alignment, interruption, and normal task handoff.
- API/cache failures do not restart already playing speech or break calls.
- The setting round-trips across templates/org configs, inbound live refresh, outbound dispatch, and web/draft tests.
- Native realtime bypasses cache; pipeline Sarvam realtime remains eligible.
- Cached fillers cannot repeat external writes or infer task completion.
- Cold first-audio and SIP pickup latency remain within measured rollout thresholds.

Implementation order:

1. Completed locally: common custom node, Inference streaming capture, generated/fixed replay, resolved identities, single-source capture, cancellation, bounded local storage, concurrent-fill handling, and removal of pre-start warmup. Live-provider checks remain part of rollout validation.
2. Implemented locally: API-authorized Postgres sharing, safe serialization, tenant authority, bounded storage/requests and deadlines. Canonical Erflow synchronization is explicitly deferred for this release; live acceptance and separate tenant authorization are required before enabling shared reuse.
3. Implemented and deployed: contracts/schema/DTO/packers, strict worker gating and the nullable UI setting. Compatible workers → API/schema → portal rollout is verified with caching off; canonical policy-column synchronization remains explicitly deferred and outstanding.
4. Validate usage, provider paths, tenant isolation, and latency; enable incrementally on authorized test agents.

Run contracts typecheck/build, API/worker builds, portal typecheck/build, and focused tests; use isolated DB suites for persistence changes. The current implementation and rollout verification results are recorded above.

Deploy compatible worker readers first, then API producers, then portal. Confirm selected Railway environment/services before an authorized rollout. Do not change published workflow semantics, dispatch task versions, or hook null/empty behavior as part of caching.

The selected product direction is automatic speech caching. Explicit saved-clip keys would be a separate audio asset feature.

## Independent prepared-sentence extension

The previous automatic-cache rollout removed broad pre-start warmup. Optional ttsPreparedSpeechEnabled now restores explicit fixed-line preparation alongside opening, with two consumers, a 10-second phrase deadline and 30-second queue deadline. It shares local/storage/upload budgets with automatic caching and never gates pickup. Prepared and automatic requests have independent live authorization; recordings retain the existing 24-hour expiry and tenant/global limits. See [current worker behavior](../AGENTS.md#prepared-sentences) and [API authority/schema status](../../api/AGENTS.md#prepared-sentences). No production enablement or live acceptance is implied by implementation tests.
