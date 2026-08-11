import { Badge, type BadgeTone } from "@call-agent/ui";

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warn",
  creating: "info",
  dialing: "info",
  ready: "success",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
  live: "success",
  draft: "warn",
  active: "success",
  inactive: "neutral",
  inbound: "info",
  outbound: "neutral",
  running: "success",
  paused: "warn",
  warn: "warn",
  disabled: "neutral",
};

type Props = {
  status: string;
  label?: string;
};

export function StatusBadge({ status, label }: Props) {
  const key = status.toLowerCase();
  const tone = STATUS_TONE[key] ?? "neutral";
  return <Badge tone={tone}>{label ?? status}</Badge>;
}
