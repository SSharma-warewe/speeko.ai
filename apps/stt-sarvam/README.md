# stt-sarvam

Loopback sidecar that wraps LiveKit’s Python `sarvam.STTRealtime` for the Node voice worker.

The Node `@livekit/agents-plugin-sarvam` package has no realtime STT class. This process is the official plugin; the worker streams 16 kHz PCM to it on localhost.

```
GET  /health  → { ok: true, plugin: "sarvam.STTRealtime" }
WS   /stt?language=auto&stream_type=fast
     &vad_min_silence_ms=500&vad_min_speech_ms=200&vad_sot_threshold=0.7
     binary in: s16le PCM 16 kHz mono
     JSON out: { type: start|interim|final|end|usage|error, ... }

SIP defaults pin Sarvam server VAD (500ms end-of-turn silence). Node always sends those query params.
```

```bash
# from repo root, with SARVAM_API_KEY set
pip install -r apps/stt-sarvam/requirements.txt
python apps/stt-sarvam/run.py
```

Binds `127.0.0.1:8091` by default. Production worker image starts this next to Node.
