import { Skeleton } from "@call-agent/ui";

const ROWS = [
  { party: "7.6rem", meta: "2.2rem", id: "3.4rem", task: "6.1rem", when: "4.2rem" },
  { party: "6.4rem", meta: "2.4rem", id: "3.2rem", task: "4.8rem", when: "3.6rem" },
  { party: "8.1rem", meta: "2.1rem", id: "3.5rem", task: "5.4rem", when: "4.8rem" },
  { party: "5.8rem", meta: "2.5rem", id: "3.1rem", task: "7.2rem", when: "3.9rem" },
  { party: "7.2rem", meta: "2.2rem", id: "3.6rem", task: "4.4rem", when: "4.4rem" },
  { party: "6.8rem", meta: "2.3rem", id: "3.3rem", task: "5.9rem", when: "3.5rem" },
  { party: "8.4rem", meta: "2.0rem", id: "3.4rem", task: "6.6rem", when: "4.1rem" },
  { party: "5.5rem", meta: "2.4rem", id: "3.2rem", task: "4.2rem", when: "3.8rem" },
] as const;

type TapeProps = {
  inbound?: boolean;
  rows?: number;
};

export function CallsTapeSkeleton({ inbound = false, rows = 8 }: TapeProps) {
  return (
    <div
      className="ops-table-wrap"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading calls"
    >
      <table className="ops-table ops-calls-table" aria-hidden="true">
        <thead>
          <tr>
            <th>Party</th>
            <th>Status</th>
            <th>Task</th>
            <th className="ops-calls-cost-col">Cost</th>
            {!inbound ? <th>Try</th> : null}
            <th>When</th>
            {!inbound ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {ROWS.slice(0, rows).map((row, i) => (
            <tr key={i} className="is-skel">
              <td>
                <span className="ops-calls-skel-party">
                  <Skeleton width={row.party} height="0.82rem" />
                  <span className="ops-calls-skel-meta">
                    <Skeleton width={row.meta} height="0.52rem" />
                    <Skeleton width={row.id} height="0.52rem" />
                  </span>
                </span>
              </td>
              <td>
                <Skeleton variant="pill" width="4.35rem" height="1.15rem" />
              </td>
              <td>
                <Skeleton width={row.task} height="0.7rem" />
              </td>
              <td className="ops-calls-cost-col">
                <span className="ops-calls-skel-cost">
                  <Skeleton width="3.1rem" height="0.72rem" />
                  <Skeleton width="3.6rem" height="3px" />
                </span>
              </td>
              {!inbound ? (
                <td>
                  <Skeleton width="2.1rem" height="0.7rem" />
                </td>
              ) : null}
              <td>
                <Skeleton width={row.when} height="0.7rem" />
              </td>
              {!inbound ? (
                <td>
                  <span className="ops-calls-skel-actions">
                    <Skeleton width="3.4rem" height="0.85rem" />
                    <Skeleton width="2.8rem" height="0.85rem" />
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CallsCountsSkeleton() {
  return (
    <ul
      className="ops-calls-counts"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading queue stats"
    >
      {[
        { value: "1.15rem", label: "2.6rem" },
        { value: "1.45rem", label: "3.4rem" },
        { value: "1.7rem", label: "5.2rem" },
      ].map((slot, i) => (
        <li key={i}>
          <span className="ops-calls-stat is-skel">
            <Skeleton width={slot.value} height="1.05rem" />
            <Skeleton width={slot.label} height="0.48rem" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CallsLedgerSkeleton() {
  return (
    <div
      className="ops-calls-ledger"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading cost meter"
    >
      <span className="ops-calls-ledger-kicker">30d meter</span>
      <Skeleton width="4.4rem" height="1.15rem" />
      <Skeleton width="5.2rem" height="0.52rem" />
    </div>
  );
}
