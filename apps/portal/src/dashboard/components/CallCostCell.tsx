import type { CallCostLine, CallCostSnapshot } from "../../lib/api";
import { formatUsd } from "../../lib/format";

const LINE_COLORS: Record<string, string> = {
  llm: "var(--ops-ink)",
  stt: "var(--ops-live)",
  tts: "var(--ops-amber-ink)",
  webrtc: "#a3a3a3",
  sip: "#b45309",
  krisp: "#78716c",
  agent_session: "#7f1d1d",
  sip_vendor: "#525252",
  eot: "#d6d3d1",
};

export function costLineColor(key: string): string {
  return LINE_COLORS[key] ?? "#a3a3a3";
}

export function CostSpark({
  lines,
  className,
}: {
  lines: CallCostLine[];
  className?: string;
}) {
  const segs = lines.filter((l) => l.amountUsd > 0);
  if (segs.length === 0) return null;
  return (
    <span
      className={`ops-cost-spark${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      {segs.map((l, i) => (
        <i
          key={`${l.key}-${l.unit}-${i}`}
          style={{
            flexGrow: Math.max(l.amountUsd, 1e-9),
            background: costLineColor(l.key),
          }}
        />
      ))}
    </span>
  );
}

export function costBreakdownTitle(cost: CallCostSnapshot): string {
  const parts = cost.lines
    .filter((l) => l.amountUsd > 0)
    .map((l) => `${l.label} ${formatUsd(l.amountUsd)}`);
  return parts.length > 0 ? parts.join(" · ") : formatUsd(cost.totalUsd);
}

type Props = {
  cost?: CallCostSnapshot | null;
  live?: boolean;
};

export function CallCostCell({ cost, live }: Props) {
  if (!cost) {
    return (
      <span
        className={`ops-cost-cell is-empty${live ? " is-live" : ""}`}
        title={
          live
            ? "Metered when this session ends"
            : "No list-price snapshot yet"
        }
      >
        —
      </span>
    );
  }

  return (
    <span className="ops-cost-cell" title={costBreakdownTitle(cost)}>
      <strong>{formatUsd(cost.totalUsd)}</strong>
      <CostSpark lines={cost.lines} />
    </span>
  );
}
