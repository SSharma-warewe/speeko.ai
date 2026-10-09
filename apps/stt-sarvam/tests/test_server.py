import json
import asyncio
import os
from types import SimpleNamespace
from unittest.mock import patch

import pytest

pytest.importorskip("aiohttp")

from aiohttp.test_utils import AioHTTPTestCase

from stt_sarvam.server import create_app


class _FakeStream:
    def __init__(self, events):
        self.frames = []
        self.ended = False
        self.closed = False
        self._events = list(events)

    def push_frame(self, frame):
        self.frames.append(frame)

    def end_input(self):
        self.ended = True

    async def aclose(self):
        self.closed = True

    def __aiter__(self):
        self._iter = iter(self._events)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _FakeStt:
    def __init__(self, stream):
        self._stream = stream

    def stream(self):
        return self._stream

    async def aclose(self):
        return None


class HealthAndSttTests(AioHTTPTestCase):
    async def test_codemix_and_balanced_are_forwarded_without_changing_defaults(self):
        with patch.dict(os.environ, {"SARVAM_API_KEY": "test-placeholder"}):
            async with self.client.ws_connect("/stt?language=auto&stream_type=balanced&mode=codemix") as ws:
                await ws.send_json({"event": "end"})
                async for msg in ws:
                    if msg.json().get("type") == "drained":
                        break
        self.assertEqual(self.factory_kwargs["mode"], "codemix")
        self.assertEqual(self.factory_kwargs["stream_type"], "balanced")

    async def test_invalid_mode_is_rejected_before_websocket(self):
        with patch.dict(os.environ, {"SARVAM_API_KEY": "test-placeholder"}):
            resp = await self.client.get("/stt?mode=unsupported")
        self.assertEqual(resp.status, 400)
        self.assertIsNone(self.factory_kwargs)

    async def test_final_speech_and_usage_are_drained_after_end_input(self):
        ended = asyncio.Event()
        class DelayedStream(_FakeStream):
            def end_input(self):
                super().end_input()
                ended.set()

            def __aiter__(self):
                return self.events()

            async def events(self):
                await ended.wait()
                await asyncio.sleep(0.01)
                yield SimpleNamespace(type="FINAL_TRANSCRIPT", alternatives=[SimpleNamespace(text="नमस्ते hello", language="hi-IN")])
                yield SimpleNamespace(type="RECOGNITION_USAGE", recognition_usage=SimpleNamespace(audio_duration=1.5))

        self.stream = DelayedStream([])
        self.stt._stream = self.stream
        with patch.dict(os.environ, {"SARVAM_API_KEY": "test-placeholder"}):
            async with self.client.ws_connect("/stt?mode=codemix") as ws:
                await ws.send_json({"event": "end"})
                messages = [msg.json() async for msg in ws]
        self.assertEqual([m["type"] for m in messages], ["final", "usage", "drained"])
        self.assertEqual(messages[0]["text"], "नमस्ते hello")
        self.assertEqual(messages[1]["audioDuration"], 1.5)
        self.assertTrue(self.stream.ended)
        self.assertTrue(self.stream.closed)

    async def get_application(self):
        self.stream = _FakeStream(
            [
                SimpleNamespace(type="START_OF_SPEECH", request_id="r1", alternatives=[]),
                SimpleNamespace(
                    type="FINAL_TRANSCRIPT",
                    request_id="r1",
                    alternatives=[
                        SimpleNamespace(
                            text="hello",
                            language="en-IN",
                            start_time=0,
                            end_time=0.4,
                        )
                    ],
                ),
                SimpleNamespace(type="END_OF_SPEECH", request_id="r1", alternatives=[]),
            ]
        )
        self.stt = _FakeStt(self.stream)
        self.factory_kwargs = None

        def factory(**kwargs):
            self.factory_kwargs = kwargs
            return self.stt

        return create_app(stt_factory=factory)

    async def test_health(self):
        resp = await self.client.get("/health")
        self.assertEqual(resp.status, 200)
        body = await resp.json()
        self.assertEqual(body, {"ok": True, "plugin": "sarvam.STTRealtime"})

    async def test_stt_requires_api_key(self):
        with patch.dict(os.environ, {"SARVAM_API_KEY": ""}, clear=False):
            os.environ.pop("SARVAM_API_KEY", None)
            resp = await self.client.get("/stt?language=auto")
            self.assertEqual(resp.status, 503)

    async def test_stt_websocket_forwards_plugin_events(self):
        with patch.dict(os.environ, {"SARVAM_API_KEY": "sk_test"}):
            with patch("stt_sarvam.server.pcm_to_frame", return_value="frame"):
                async with self.client.ws_connect(
                    "/stt?language=auto&stream_type=fast"
                ) as ws:
                    await ws.send_bytes(b"\x00\x00\x00\x00")
                    await ws.send_str(json.dumps({"event": "end"}))
                    messages = []
                    async for msg in ws:
                        messages.append(msg.json())
                        if len(messages) >= 3:
                            break
        self.assertEqual([m["type"] for m in messages[:3]], ["start", "final", "end"])
        self.assertEqual(messages[1]["text"], "hello")
        self.assertEqual(self.stream.frames, ["frame"])
        self.assertEqual(self.factory_kwargs["language"], "auto")
        self.assertEqual(self.factory_kwargs["api_key"], "sk_test")
        self.assertEqual(self.factory_kwargs["stream_type"], "fast")
        self.assertEqual(self.factory_kwargs["vad_min_silence_ms"], 250)
        self.assertEqual(self.factory_kwargs["vad_min_speech_ms"], 200)
        self.assertEqual(self.factory_kwargs["vad_sot_threshold"], 0.7)

    async def test_stt_header_key_when_env_empty(self):
        with patch.dict(os.environ, {"SARVAM_API_KEY": ""}, clear=False):
            os.environ.pop("SARVAM_API_KEY", None)
            async with self.client.ws_connect(
                "/stt?language=en-IN",
                headers={"X-Sarvam-Api-Key": " sk_from_node "},
            ) as ws:
                await ws.send_str(json.dumps({"event": "end"}))
                async for _msg in ws:
                    break
        self.assertEqual(self.factory_kwargs["api_key"], "sk_from_node")

    async def test_stt_header_key_wins_over_env(self):
        with patch.dict(os.environ, {"SARVAM_API_KEY": "sk_env"}):
            async with self.client.ws_connect(
                "/stt?language=en-IN",
                headers={"X-Sarvam-Api-Key": "sk_header"},
            ) as ws:
                await ws.send_str(json.dumps({"event": "end"}))
                async for _msg in ws:
                    break
        self.assertEqual(self.factory_kwargs["api_key"], "sk_header")

    async def test_stt_websocket_forwards_vad_query(self):
        with patch.dict(os.environ, {"SARVAM_API_KEY": "sk_test"}):
            with patch("stt_sarvam.server.pcm_to_frame", return_value="frame"):
                async with self.client.ws_connect(
                    "/stt?language=hi-IN&stream_type=fast"
                    "&vad_min_silence_ms=400&vad_min_speech_ms=200"
                    "&vad_sot_threshold=0.7"
                ) as ws:
                    await ws.send_str(json.dumps({"event": "end"}))
                    async for _msg in ws:
                        break
        self.assertEqual(self.factory_kwargs["language"], "hi-IN")
        self.assertEqual(self.factory_kwargs["vad_min_silence_ms"], 400)
