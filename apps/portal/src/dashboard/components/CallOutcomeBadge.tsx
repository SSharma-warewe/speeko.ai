import type { CallOutcomeSource } from "../../lib/call-outcome";
import { callDisplayOutcome } from "../../lib/call-outcome";
import { StatusBadge } from "./StatusBadge";

type Props = {
  call: CallOutcomeSource;
};

export function CallOutcomeBadge({ call }: Props) {
  const outcome = callDisplayOutcome(call);
  return <StatusBadge status={outcome.tone} label={outcome.label} />;
}
