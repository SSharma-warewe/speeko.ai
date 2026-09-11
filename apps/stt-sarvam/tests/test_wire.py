from types import SimpleNamespace

from stt_sarvam.wire import speech_event_to_wire


def test_start_and_end_have_no_transcript():
    start = SimpleNamespace(type="START_OF_SPEECH", request_id="r1", alternatives=[])
    end = SimpleNamespace(type="END_OF_SPEECH", request_id="r1", alternatives=[])
    assert speech_event_to_wire(start) == {"type": "start", "requestId": "r1"}
    assert speech_event_to_wire(end) == {"type": "end", "requestId": "r1"}


def test_final_copies_text_and_timing():
    alt = SimpleNamespace(
        text="Haan.",
        language="hi-IN",
        start_time=0.1,
        end_time=0.8,
    )
    event = SimpleNamespace(type=2, request_id="r2", alternatives=[alt])
    assert speech_event_to_wire(event) == {
        "type": "final",
        "requestId": "r2",
        "text": "Haan.",
        "language": "hi-IN",
        "startTime": 0.1,
        "endTime": 0.8,
    }


def test_usage_uses_audio_duration():
    event = SimpleNamespace(
        type="RECOGNITION_USAGE",
        request_id="r3",
        recognition_usage=SimpleNamespace(audio_duration=1.25),
        alternatives=[],
    )
    assert speech_event_to_wire(event) == {
        "type": "usage",
        "requestId": "r3",
        "audioDuration": 1.25,
    }
