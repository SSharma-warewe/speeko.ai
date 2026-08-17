type Slice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type Props = {
  completed: number;
  failed: number;
  cancelled: number;
};

export function CallOutcomeBar({ completed, failed, cancelled }: Props) {
  const slices: Slice[] = [
    { key: "completed", label: "Completed", value: completed, color: "#166534" },
    { key: "failed", label: "Failed", value: failed, color: "#991b1b" },
    { key: "cancelled", label: "Cancelled", value: cancelled, color: "#737373" },
  ];
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const failRate = total > 0 ? Math.round((failed / total) * 100) : 0;

  return (
    <div className="ops-ov-mix">
      <div
        className="ops-ov-mix-bar"
        role="img"
        aria-label={barLabel(slices, total)}
      >
        {total === 0 ? (
          <span className="ops-ov-mix-empty" />
        ) : (
          slices
            .filter((s) => s.value > 0)
            .map((s) => (
              <span
                key={s.key}
                className="ops-ov-mix-seg"
                style={{
                  flexGrow: s.value,
                  background: s.color,
                }}
              />
            ))
        )}
      </div>
      <div className="ops-ov-mix-rates">
        <div>
          <strong>{total === 0 ? "—" : `${successRate}%`}</strong>
          <span>done</span>
        </div>
        <div>
          <strong>{total === 0 ? "—" : `${failRate}%`}</strong>
          <span>failed</span>
        </div>
        <div>
          <strong>{total}</strong>
          <span>finished</span>
        </div>
      </div>
      <ul className="ops-ov-legend">
        {slices.map((s) => (
          <li key={s.key}>
            <span className="ops-ov-swatch" style={{ background: s.color }} />
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function barLabel(slices: Slice[], total: number): string {
  if (total === 0) return "No finished calls yet";
  return slices.map((s) => `${s.label} ${s.value}`).join(", ");
}
