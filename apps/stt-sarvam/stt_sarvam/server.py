"""Loopback HTTP/WebSocket sidecar around sarvam.STTRealtime."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Callable

from aiohttp import WSMsgType, web

from .plugin import (
    DEFAULT_VAD_MIN_SILENCE_MS,
    DEFAULT_VAD_MIN_SPEECH_MS,
    DEFAULT_VAD_SOT_THRESHOLD,
    SAMPLE_RATE,
    create_realtime_stt,
    pcm_to_frame,
)
from .wire import speech_event_to_wire

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8091
SUPPORTED_STREAM_TYPES = {"fast", "balanced", "simulated"}
SUPPORTED_LANGUAGES = {
    "en-IN",
    "hi-IN",
    "bn-IN",
    "kn-IN",
    "ml-IN",
    "mr-IN",
    "or-IN",
    "pa-IN",
    "ta-IN",
    "te-IN",
    "gu-IN",
    "as-IN",
    "ur-IN",
    "ne-IN",
    "kok-IN",
    "ks-IN",
    "sd-IN",
    "sa-IN",
    "sat-IN",
    "mni-IN",
    "brx-IN",
    "mai-IN",
    "doi-IN",
    "auto",
}

logger = logging.getLogger("stt_sarvam")

SttFactory = Callable[..., Any]


def _language(raw: str | None) -> str:
    value = (raw or "auto").strip() or "auto"
    if value == "unknown":
        return "auto"
    if value == "od-IN":
        return "or-IN"
    if value not in SUPPORTED_LANGUAGES:
        raise web.HTTPBadRequest(text=f"unsupported language {value}")
    return value


def _stream_type(raw: str | None) -> str:
    value = (raw or "fast").strip() or "fast"
    if value not in SUPPORTED_STREAM_TYPES:
        raise web.HTTPBadRequest(text=f"unsupported stream_type {value}")
    return value


def _int_query(raw: str | None, name: str, default: int, lo: int, hi: int) -> int:
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw.strip())
    except ValueError as exc:
        raise web.HTTPBadRequest(text=f"invalid {name}") from exc
    if value < lo or value > hi:
        raise web.HTTPBadRequest(text=f"unsupported {name} {value}")
    return value


def _float_query(
    raw: str | None, name: str, default: float, lo: float, hi: float
) -> float:
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw.strip())
    except ValueError as exc:
        raise web.HTTPBadRequest(text=f"invalid {name}") from exc
    if value < lo or value > hi:
        raise web.HTTPBadRequest(text=f"unsupported {name} {value}")
    return value


async def health(_request: web.Request) -> web.Response:
    return web.json_response({"ok": True, "plugin": "sarvam.STTRealtime"})


async def _pump_events(stream: Any, ws: web.WebSocketResponse) -> None:
    try:
        async for event in stream:
            if ws.closed:
                break
            await ws.send_json(speech_event_to_wire(event))
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.exception("Sarvam STTRealtime stream failed")
        if not ws.closed:
            await ws.send_json(
                {
                    "type": "error",
                    "message": str(exc) or "Sarvam STTRealtime stream failed",
                    "retryable": False,
                }
            )


async def stt_ws(request: web.Request) -> web.WebSocketResponse:
    if not os.environ.get("SARVAM_API_KEY", "").strip():
        raise web.HTTPServiceUnavailable(text="SARVAM_API_KEY is required")

    language = _language(request.query.get("language"))
    stream_type = _stream_type(request.query.get("stream_type"))
    vad_min_silence_ms = _int_query(
        request.query.get("vad_min_silence_ms"),
        "vad_min_silence_ms",
        DEFAULT_VAD_MIN_SILENCE_MS,
        50,
        2000,
    )
    vad_min_speech_ms = _int_query(
        request.query.get("vad_min_speech_ms"),
        "vad_min_speech_ms",
        DEFAULT_VAD_MIN_SPEECH_MS,
        20,
        2000,
    )
    vad_sot_threshold = _float_query(
        request.query.get("vad_sot_threshold"),
        "vad_sot_threshold",
        DEFAULT_VAD_SOT_THRESHOLD,
        0.0,
        1.0,
    )
    factory: SttFactory = request.app["stt_factory"]

    ws = web.WebSocketResponse(heartbeat=30.0)
    await ws.prepare(request)

    stt = factory(
        language=language,
        stream_type=stream_type,
        endpointing="vad",
        vad_min_silence_ms=vad_min_silence_ms,
        vad_min_speech_ms=vad_min_speech_ms,
        vad_sot_threshold=vad_sot_threshold,
    )
    stream = stt.stream()
    logger.info(
        "stt session start language=%s stream_type=%s "
        "vad_min_silence_ms=%s vad_min_speech_ms=%s vad_sot_threshold=%s",
        language,
        stream_type,
        vad_min_silence_ms,
        vad_min_speech_ms,
        vad_sot_threshold,
    )
    pump = asyncio.create_task(_pump_events(stream, ws))
    try:
        async for msg in ws:
            if msg.type == WSMsgType.BINARY:
                frame = pcm_to_frame(msg.data, SAMPLE_RATE)
                if frame is not None:
                    stream.push_frame(frame)
            elif msg.type == WSMsgType.TEXT:
                try:
                    payload = json.loads(msg.data)
                except json.JSONDecodeError:
                    continue
                event = payload.get("event") if isinstance(payload, dict) else None
                if event == "flush" and hasattr(stream, "flush"):
                    stream.flush()
                elif event == "end":
                    break
            elif msg.type in (WSMsgType.CLOSE, WSMsgType.CLOSING, WSMsgType.CLOSED):
                break
            elif msg.type == WSMsgType.ERROR:
                raise ws.exception() or RuntimeError("stt websocket error")
    finally:
        try:
            if hasattr(stream, "end_input"):
                stream.end_input()
        except Exception:
            logger.debug("end_input failed", exc_info=True)
        try:
            if hasattr(stream, "aclose"):
                await stream.aclose()
        except Exception:
            logger.debug("stream aclose failed", exc_info=True)
        try:
            if hasattr(stt, "aclose"):
                await stt.aclose()
        except Exception:
            logger.debug("stt aclose failed", exc_info=True)
        pump.cancel()
        try:
            await pump
        except (asyncio.CancelledError, Exception):
            pass
        logger.info("stt session end language=%s", language)
    return ws


def create_app(stt_factory: SttFactory | None = None) -> web.Application:
    app = web.Application()
    app["stt_factory"] = stt_factory or create_realtime_stt
    app.router.add_get("/health", health)
    app.router.add_get("/stt", stt_ws)
    return app


def _require_plugin() -> None:
    try:
        from livekit.plugins import sarvam  # noqa: F401
    except ImportError as exc:
        raise SystemExit(
            "livekit-agents[sarvam] is not installed. "
            "Run: pip install -r apps/stt-sarvam/requirements.txt"
        ) from exc


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="[stt-sarvam] %(levelname)s %(message)s",
    )
    _require_plugin()
    host = os.environ.get("SARVAM_STT_PLUGIN_HOST", DEFAULT_HOST)
    port = int(os.environ.get("SARVAM_STT_PLUGIN_PORT", str(DEFAULT_PORT)))
    if not os.environ.get("SARVAM_API_KEY", "").strip():
        logger.warning("SARVAM_API_KEY is empty; /stt will return 503")
    logger.info("listening on %s:%s (sarvam.STTRealtime)", host, port)
    web.run_app(create_app(), host=host, port=port, print=None)
