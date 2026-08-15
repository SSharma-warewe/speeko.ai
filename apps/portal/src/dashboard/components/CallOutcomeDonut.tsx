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

const R = 72;
const C = 2 * Math.PI * R;

export function CallOutcomeDonut({ completed, failed, cancelled }: Props) {
  const slices: Slice[] = [
    { key: "completed", label: "Completed", value: completed, color: "#166534" },
    { key: "failed", label: "Failed", value: failed, color: "#991b1b" },
    { key: "cancelled", label: "Cancelled", value: cancelled, color: "#737373" },
  ];
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  let offset = 0;
  const arcs = slices.map((s) => {
    const len = total > 0 ? (s.value / total) * C : 0;
    const arc = { ...s, dash: `${len} ${C}`, offset };
    offset -= len;
    return arc;
  });

  return (
    <div className="ops-ov-donut">
      <div className="ops-ov-donut-viz" role="img" aria-label={donutLabel(slices, total)}>
        <svg viewBox="0 0 200 200" width="236" height="236">
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="#eceae4"
            strokeWidth="22"
          />
          {total > 0
            ? arcs
                .filter((a) => a.value > 0)
                .map((a) => (
                  <circle
                    key={a.key}
                    cx="100"
                    cy="100"
                    r={R}
                    fill="none"
                    stroke={a.color}
                    strokeWidth="22"
                    strokeDasharray={a.dash}
                    strokeDashoffset={a.offset}
                    strokeLinecap="butt"
                    transform="rotate(-90 100 100)"
                  />
                ))
            : null}
        </svg>
        <div className="ops-ov-donut-center">
          <strong>{total}</strong>
          <span>{total === 0 ? "No outcomes" : `${successRate}% done`}</span>
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

function donutLabel(slices: Slice[], total: number): string {
  if (total === 0) return "No finished calls yet";
  return slices.map((s) => `${s.label} ${s.value}`).join(", ");
}
