"""Map LiveKit Python SpeechEvents onto the loopback JSON wire."""

from __future__ import annotations

from typing import Any

WIRE_TYPES = {
    "START_OF_SPEECH": "start",
    "INTERIM_TRANSCRIPT": "interim",
    "FINAL_TRANSCRIPT": "final",
    "END_OF_SPEECH": "end",
    "RECOGNITION_USAGE": "usage",
    "0": "start",
    "1": "interim",
    "2": "final",
    "3": "end",
    "4": "usage",
    "start": "start",
    "interim": "interim",
    "final": "final",
    "end": "end",
    "usage": "usage",
}


def _type_name(raw: Any) -> str:
    if raw is None:
        return ""
    name = getattr(raw, "name", None)
    if isinstance(name, str) and name:
        return name
    value = getattr(raw, "value", None)
    if value is not None:
        return str(value)
    return str(raw)


def speech_event_to_wire(event: Any) -> dict[str, Any]:
    type_name = _type_name(getattr(event, "type", None))
    wire_type = WIRE_TYPES.get(type_name) or WIRE_TYPES.get(type_name.upper())
    if not wire_type:
        return {"type": "error", "message": f"unknown speech event {type_name}"}

    payload: dict[str, Any] = {"type": wire_type}
    request_id = getattr(event, "request_id", None) or getattr(event, "requestId", None)
    if isinstance(request_id, str) and request_id:
        payload["requestId"] = request_id

    if wire_type == "usage":
        usage = getattr(event, "recognition_usage", None) or getattr(
            event, "recognitionUsage", None
        )
        duration = getattr(usage, "audio_duration", None)
        if duration is None:
            duration = getattr(usage, "audioDuration", None)
        if isinstance(duration, (int, float)):
            payload["audioDuration"] = float(duration)
        return payload

    alternatives = getattr(event, "alternatives", None) or []
    first = alternatives[0] if alternatives else None
    if first is not None:
        text = getattr(first, "text", None)
        if isinstance(text, str):
            payload["text"] = text
        language = getattr(first, "language", None)
        if language is not None:
            payload["language"] = str(language)
        start_time = getattr(first, "start_time", None)
        if start_time is None:
            start_time = getattr(first, "startTime", None)
        if isinstance(start_time, (int, float)):
            payload["startTime"] = float(start_time)
        end_time = getattr(first, "end_time", None)
        if end_time is None:
            end_time = getattr(first, "endTime", None)
        if isinstance(end_time, (int, float)):
            payload["endTime"] = float(end_time)
    return payload
