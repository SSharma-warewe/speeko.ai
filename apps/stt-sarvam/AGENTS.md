# Sarvam STT sidecar instructions

Scope: `apps/stt-sarvam`. Inherit the [root instructions](../../AGENTS.md). This Python sidecar wraps LiveKit's `sarvam.STTRealtime` for the Node voice worker; it is shipped inside the voice service, not as an independent Railway app.

## Protocol and ownership

- `run.py`/`stt_sarvam/__main__.py` start the server; `server.py` owns loopback HTTP/WebSocket I/O; `plugin.py` configures the official plugin/PCM frames; `wire.py` maps speech events.
- Bind loopback `127.0.0.1:8091` by default. `GET /health` reports `{ ok: true, plugin: "sarvam.STTRealtime" }`; `WS /stt` accepts s16le PCM, 16 kHz mono, and emits JSON start/interim/final/end/usage/error events.
- Preserve requestId, text/language/timing and audioDuration fields when mapping plugin events. Unknown event types become errors rather than fabricated transcripts.
- The worker sends trimmed `SARVAM_API_KEY` through `X-Sarvam-Api-Key`; the sidecar prefers that header and falls back to its environment. Never put keys in query strings, wire events, logs, metadata, or Vite.
- Query params include language/stream_type and VAD settings. SIP defaults: min silence 250ms, min speech 200ms, SOT threshold 0.7. Preserve query validation and supported language normalization (`unknown` → auto, `od-IN` → or-IN).
- This adapter owns transcription; Node voice runtime owns conversation turn taking. Preserve its EOS/FINAL contract with the Node adapter; do not add persistence, tenant logic, or call task workflows here.
- Production uses `Dockerfile.worker` and `apps/worker/start-with-stt.sh`: start Python, check loopback health, then start compiled Node. Changes require voice-worker redeploy. Local unset `SARVAM_STT_PLUGIN_URL` selects the Node fallback instead.

## Naming, changes, and verification

- Python modules/functions use snake_case; constants UPPER_SNAKE_CASE; classes PascalCase. Keep protocol JSON camelCase where established and test its exact mapping.
- Protocol changes must update the Node Sarvam client and fixtures together. Reuse the official plugin instead of introducing another cloud protocol implementation here.
- From repo root: `npm run start:stt-sarvam`, `npm run test:stt-sarvam` (pytest). Install the pinned sidecar requirements into an appropriate Python environment when needed; tests mock remote STT.
- Also run relevant worker Sarvam/pipeline tests when event ordering or VAD changes. Production smoke checks must confirm sidecar health and LiveKit worker registration separately.
- References: [README](README.md), [voice-worker instructions](../worker/AGENTS.md), [runtime details](../worker/docs/runtime.md), [deployment instructions](../../railway/AGENTS.md).

## Sidecar protocol and local setup

Loopback sidecar that wraps LiveKit’s Python `sarvam.STTRealtime` for the Node voice worker.

The Node `@livekit/agents-plugin-sarvam` package has no realtime STT class. This process is the official plugin; the worker streams 16 kHz PCM to it on localhost.

```
GET  /health  → { ok: true, plugin: "sarvam.STTRealtime" }
WS   /stt?language=auto&stream_type=fast
     &vad_min_silence_ms=250&vad_min_speech_ms=200&vad_sot_threshold=0.7
     binary in: s16le PCM 16 kHz mono
     JSON out: { type: start|interim|final|end|usage|error, ... }

SIP defaults pin Sarvam server VAD (250ms end-of-turn silence). Node always sends those query params and the trimmed worker key on header `X-Sarvam-Api-Key` (never the URL). The sidecar prefers that header, then `SARVAM_API_KEY`, and passes `api_key` into `sarvam.STTRealtime`.
```

```bash
# from repo root, with SARVAM_API_KEY set
pip install -r apps/stt-sarvam/requirements.txt
python apps/stt-sarvam/run.py
```

Binds `127.0.0.1:8091` by default. Production worker image starts this next to Node.

## Query validation, event mapping, and cleanup

| Parameter | Default | Accepted values |
| --- | --- | --- |
| `language` | `auto` | Supported BCP-47 Indian languages plus auto; unknown → auto, od-IN → or-IN |
| `stream_type` | `fast` | fast, balanced, simulated |
| `vad_min_silence_ms` | 250 | Integer 50–2000 |
| `vad_min_speech_ms` | 200 | Integer 20–2000 |
| `vad_sot_threshold` | 0.7 | Float 0–1 |

Supported language ids are en-IN, hi-IN, bn-IN, kn-IN, ml-IN, mr-IN, or-IN, pa-IN, ta-IN, te-IN, gu-IN, as-IN, ur-IN, ne-IN, kok-IN, ks-IN, sd-IN, sa-IN, sat-IN, mni-IN, brx-IN, mai-IN, doi-IN, auto. Unsupported/invalid parameters return HTTP 400 before the WebSocket begins. Missing both trimmed header/env keys returns 503. The header supplies the upstream Sarvam key; loopback binding is the access boundary, not a public tenant-auth endpoint.

Binary WebSocket frames become PCM audio frames. Text `{ "event": "flush" }` flushes when supported; `{ "event": "end" }` ends input. Invalid JSON is ignored. The event pump and audio loop close together; cleanup ends input, closes stream/STT, cancels the pump and does not leave an active plugin connection.

| Python event | JSON type / fields |
| --- | --- |
| START_OF_SPEECH / 0 | start |
| INTERIM_TRANSCRIPT / 1 | interim |
| FINAL_TRANSCRIPT / 2 | final |
| END_OF_SPEECH / 3 | end |
| RECOGNITION_USAGE / 4 | usage with audioDuration |
| Unknown | error with message |

Preserve requestId if present. Transcription events use the first alternative's text, language, startTime, endTime; usage has audioDuration. Mapping accepts existing snake_case/camelCase SDK field spellings. Stream errors emit error with retryable false. Do not fabricate a final transcript from unknown events.

Node emits EOS before FINAL when it already has an interim transcript, while an empty EOS waits for FINAL. Pipeline TurnDetector v1 owns conversational endpointing; Sarvam's VAD only endpoints transcription. Update both sides and tests when ordering changes.

Use `npm run test:stt-sarvam` for mocked Python protocol tests and relevant Node Sarvam tests for header, event order, empty-EOS fallback, PCM framing and query/default behavior. Real Sarvam traffic is a separately authorized smoke check.
