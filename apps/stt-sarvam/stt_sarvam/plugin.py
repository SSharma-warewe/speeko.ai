"""Official LiveKit Python Sarvam STTRealtime factory."""

from __future__ import annotations

SAMPLE_RATE = 16000
NUM_CHANNELS = 1

# SIP / telephony pins from Sarvam's LiveKit production guide.
DEFAULT_VAD_MIN_SILENCE_MS = 500
DEFAULT_VAD_MIN_SPEECH_MS = 200
DEFAULT_VAD_SOT_THRESHOLD = 0.7


def create_realtime_stt(
    *,
    language: str,
    stream_type: str = "fast",
    endpointing: str = "vad",
    vad_min_silence_ms: int = DEFAULT_VAD_MIN_SILENCE_MS,
    vad_min_speech_ms: int = DEFAULT_VAD_MIN_SPEECH_MS,
    vad_sot_threshold: float = DEFAULT_VAD_SOT_THRESHOLD,
):
    from livekit.plugins import sarvam

    return sarvam.STTRealtime(
        language=language,
        stream_type=stream_type,
        endpointing=endpointing,
        vad_min_silence_ms=vad_min_silence_ms,
        vad_min_speech_ms=vad_min_speech_ms,
        vad_sot_threshold=vad_sot_threshold,
    )


def pcm_to_frame(pcm: bytes, sample_rate: int = SAMPLE_RATE):
    from livekit import rtc

    if len(pcm) < 2:
        return None
    if len(pcm) % 2:
        pcm = pcm[:-1]
    samples = len(pcm) // 2
    if samples <= 0:
        return None
    return rtc.AudioFrame(
        data=pcm,
        sample_rate=sample_rate,
        num_channels=NUM_CHANNELS,
        samples_per_channel=samples,
    )
