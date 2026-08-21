import { Alert } from "@call-agent/ui";
import type { CallCostLine, CallCostSnapshot } from "../../lib/api";
import { formatCostQuantity, formatUsd } from "../../lib/format";
import { CostSpark, costLineColor } from "./CallCostCell";

type Props = {
  cost?: CallCostSnapshot | null;
  live?: boolean;
};

export function CallCostPanel({ cost, live }: Props) {
  if (!cost) {
    return (
      <section className="ops-panel ops-call-cost">
        <div className="ops-panel-head">
          <h2>Cost</h2>
          <span className="ops-faint">LiveKit list · no markup</span>
        </div>
        <div className="ops-panel-body">
          <p className="ops-muted ops-call-empty">
            {live
              ? "The meter fills in after this session ends."
              : "No list-price snapshot on this call yet."}
          </p>
        </div>
      </section>
    );
  }

  const total = cost.totalUsd;
  const retries = (cost.attempts?.length ?? 0) > 1;
  const unknown = cost.unknownModels ?? [];

  return (
    <section className="ops-panel ops-call-cost">
      <div className="ops-panel-head">
        <h2>Cost</h2>
        <span className="ops-faint ops-mono">
          {cost.plan || "ship"} · catalog {cost.catalogAsOf || "—"} · markup {cost.markup}
        </span>
      </div>
      <div className="ops-panel-body">
        <div className="ops-call-cost-hero">
          <div>
            <span className="ops-call-cost-kicker">Total</span>
            <strong className="ops-mono ops-call-cost-total">{formatUsd(total)}</strong>
            <CostSpark lines={cost.lines} className="ops-call-cost-mix" />
          </div>
          <dl className="ops-call-cost-meta">
            <div>
              <dt>Billed time</dt>
              <dd className="ops-mono">{formatCostQuantity({ quantity: cost.billedMinutes, unit: "minutes" })}</dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd className="ops-mono">{cost.attempts?.length ?? 1}</dd>
            </div>
          </dl>
        </div>

        {unknown.length > 0 ? (
          <Alert tone="warn">
            Unknown models (priced $0): {unknown.join(", ")}
          </Alert>
        ) : null}

        {cost.lines.length === 0 ? (
          <p className="ops-muted ops-call-empty">No metered lines on this snapshot.</p>
        ) : (
          <ul className="ops-call-cost-lines">
            {cost.lines.map((line, i) => (
              <CostLineRow key={`${line.key}-${line.unit}-${line.model ?? i}`} line={line} total={total} />
            ))}
          </ul>
        )}

        {retries ? (
          <details className="ops-call-json ops-call-cost-attempts">
            <summary>
              {cost.attempts.length} dial attempts
            </summary>
            <ol className="ops-call-cost-attempt-list">
              {cost.attempts.map((a) => (
                <li key={a.attempt}>
                  <span className="ops-mono">#{a.attempt}</span>
                  <span className="ops-faint">
                    {formatCostQuantity({ quantity: a.billedMinutes, unit: "minutes" })}
                  </span>
                  <strong className="ops-mono">{formatUsd(a.totalUsd)}</strong>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function CostLineRow({ line, total }: { line: CallCostLine; total: number }) {
  const pct = total > 0 && line.amountUsd > 0 ? Math.min(100, (line.amountUsd / total) * 100) : 0;
  const zero = line.amountUsd <= 0;
  return (
    <li className={`ops-call-cost-line${zero ? " is-zero" : ""}`} title={line.notes || undefined}>
      <div className="ops-call-cost-line-head">
        <span className="ops-call-cost-line-label">{line.label}</span>
        <span className="ops-faint ops-mono">{formatCostQuantity(line)}</span>
        <strong className="ops-mono">{formatUsd(line.amountUsd)}</strong>
      </div>
      <div className="ops-call-cost-bar" aria-hidden>
        <span
          style={{
            width: `${pct}%`,
            background: costLineColor(line.key),
          }}
        />
      </div>
    </li>
  );
}
