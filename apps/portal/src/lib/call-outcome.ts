import { CallFailureCode, CallStatus } from "@call-agent/contracts";

export type CallOutcomeTone = "success" | "warn" | "danger" | "info" | "neutral";

export type CallOutcomeSource = {
  status: string;
  lastFailureCode?: string | null;
  taskResult?: Record<string, unknown> | null;
};

export type CallDisplayOutcome = {
  label: string;
  tone: CallOutcomeTone;
};

/** Hangup/crash leftovers — not a finished workflow. */
const SYNTHETIC_OUTCOMES = new Set(["NO_ANSWER", "AGENT_ERROR"]);

const FAILURE_LABELS: Record<string, string> = {
  [CallFailureCode.NO_ANSWER]: "No answer",
  [CallFailureCode.BUSY]: "Busy",
  [CallFailureCode.TIMEOUT]: "Timed out",
  [CallFailureCode.SIP_ERROR]: "Failed",
  [CallFailureCode.AGENT_ERROR]: "Agent error",
  [CallFailureCode.CANCELLED]: "Cancelled",
  [CallFailureCode.UNKNOWN]: "Failed",
};

const WORKFLOW_OUTCOMES: Record<string, CallDisplayOutcome> = {
  BOOKED_AND_QUALIFIED: { label: "Booked & qualified", tone: "success" },
  BOOKED_ONLY: { label: "Booked", tone: "success" },
  BOOKED: { label: "Booked", tone: "success" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  INTERESTED: { label: "Interested", tone: "success" },
  PROMISED: { label: "Promised", tone: "success" },
  ALREADY_PAID: { label: "Already paid", tone: "success" },
  TRANSFERRED: { label: "Transferred", tone: "success" },
  COMPLETED: { label: "Completed", tone: "success" },
  CALLBACK: { label: "Callback", tone: "warn" },
  WRONG_PERSON: { label: "Wrong person", tone: "warn" },
  NOT_BOOKED: { label: "Not booked", tone: "danger" },
  DECLINED: { label: "Declined", tone: "danger" },
  NOT_INTERESTED: { label: "Not interested", tone: "danger" },
  REFUSED: { label: "Refused", tone: "danger" },
  NOT_COMING: { label: "Not coming", tone: "danger" },
  ABANDONED: { label: "Abandoned", tone: "danger" },
};

/**
 * One list label from session lifecycle + workflow result.
 * Do not infer completion from leftover taskResult JSON.
 */
export function callDisplayOutcome(call: CallOutcomeSource): CallDisplayOutcome {
  const status = call.status.trim().toLowerCase();

  if (status === CallStatus.PENDING) return { label: "Queued", tone: "warn" };
  if (status === CallStatus.CREATING) return { label: "Connecting", tone: "info" };
  if (status === CallStatus.DIALING) return { label: "Dialing", tone: "info" };
  if (status === CallStatus.READY) return { label: "In call", tone: "info" };
  if (status === CallStatus.CANCELLED) return { label: "Cancelled", tone: "neutral" };
  if (status === CallStatus.FAILED) {
    return { label: failureLabel(call.lastFailureCode), tone: "danger" };
  }
  if (status === CallStatus.INCOMPLETE) {
    return { label: "No decision", tone: "warn" };
  }
  if (status === CallStatus.COMPLETED) {
    const outcome = workflowOutcome(call.taskResult);
    if (outcome) return presentWorkflowOutcome(outcome);
    return { label: "Finished", tone: "neutral" };
  }

  return { label: titleCaseToken(call.status) || call.status, tone: "neutral" };
}

function failureLabel(code?: string | null): string {
  if (!code) return "Failed";
  return FAILURE_LABELS[code.trim().toLowerCase()] ?? "Failed";
}

function workflowOutcome(result: Record<string, unknown> | null | undefined): string | null {
  const raw = result?.outcome;
  if (typeof raw !== "string") return null;
  const outcome = raw.trim();
  if (!outcome) return null;
  if (SYNTHETIC_OUTCOMES.has(outcome.toUpperCase())) return null;
  return outcome;
}

function presentWorkflowOutcome(outcome: string): CallDisplayOutcome {
  const known = WORKFLOW_OUTCOMES[outcome.toUpperCase()];
  if (known) return known;
  return { label: titleCaseToken(outcome) || outcome, tone: "neutral" };
}

function titleCaseToken(raw: string): string {
  return raw
    .trim()
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
