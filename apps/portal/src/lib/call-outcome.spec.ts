import { CallFailureCode, CallStatus } from "@call-agent/contracts";
import { callDisplayOutcome } from "./call-outcome";

describe("callDisplayOutcome", () => {
  it("maps live lifecycle before any taskResult", () => {
    expect(callDisplayOutcome({ status: CallStatus.PENDING })).toEqual({
      label: "Queued",
      tone: "warn",
    });
    expect(callDisplayOutcome({ status: CallStatus.CREATING })).toEqual({
      label: "Connecting",
      tone: "info",
    });
    expect(callDisplayOutcome({ status: CallStatus.DIALING })).toEqual({
      label: "Dialing",
      tone: "info",
    });
    expect(callDisplayOutcome({ status: CallStatus.READY })).toEqual({
      label: "In call",
      tone: "info",
    });
  });

  it("maps connect failures from lastFailureCode, not leftover JSON", () => {
    expect(
      callDisplayOutcome({
        status: CallStatus.FAILED,
        lastFailureCode: CallFailureCode.NO_ANSWER,
        taskResult: { outcome: "NO_ANSWER" },
      }),
    ).toEqual({ label: "No answer", tone: "danger" });
    expect(
      callDisplayOutcome({
        status: CallStatus.FAILED,
        lastFailureCode: CallFailureCode.BUSY,
      }),
    ).toEqual({ label: "Busy", tone: "danger" });
  });

  it("does not treat incomplete leftover JSON as a workflow result", () => {
    expect(
      callDisplayOutcome({
        status: CallStatus.INCOMPLETE,
        taskResult: { outcome: "NO_ANSWER" },
      }),
    ).toEqual({ label: "No decision", tone: "warn" });
  });

  it("shows the business outcome when the session completed", () => {
    expect(
      callDisplayOutcome({
        status: CallStatus.COMPLETED,
        taskResult: { task: "loan_collection", outcome: "REFUSED" },
      }),
    ).toEqual({ label: "Refused", tone: "danger" });
    expect(
      callDisplayOutcome({
        status: CallStatus.COMPLETED,
        taskResult: { outcome: "CONFIRMED" },
      }),
    ).toEqual({ label: "Confirmed", tone: "success" });
    expect(
      callDisplayOutcome({
        status: CallStatus.COMPLETED,
        taskResult: { outcome: "CALLBACK" },
      }),
    ).toEqual({ label: "Callback", tone: "warn" });
  });

  it("ignores synthetic completed leftovers and falls back to Finished", () => {
    expect(
      callDisplayOutcome({
        status: CallStatus.COMPLETED,
        taskResult: { outcome: "NO_ANSWER" },
      }),
    ).toEqual({ label: "Finished", tone: "neutral" });
    expect(
      callDisplayOutcome({
        status: CallStatus.COMPLETED,
        taskResult: null,
      }),
    ).toEqual({ label: "Finished", tone: "neutral" });
  });

  it("title-cases unknown workflow outcomes", () => {
    expect(
      callDisplayOutcome({
        status: CallStatus.COMPLETED,
        taskResult: { outcome: "MAYBE_LATER" },
      }),
    ).toEqual({ label: "Maybe Later", tone: "neutral" });
  });

  it("maps cancelled without reading taskResult", () => {
    expect(
      callDisplayOutcome({
        status: CallStatus.CANCELLED,
        taskResult: { outcome: "CONFIRMED" },
      }),
    ).toEqual({ label: "Cancelled", tone: "neutral" });
  });
});
