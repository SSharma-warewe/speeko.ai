type Props = {
  value: string | number;
  label: string;
  hint?: string;
  highlight?: boolean;
};

export function KpiCard({ value, label, hint, highlight }: Props) {
  return (
    <article className={`ops-kpi${highlight ? " is-highlight" : ""}`}>
      <span className="ops-kpi-value">{value}</span>
      <span className="ops-kpi-label">{label}</span>
      {hint ? <span className="ops-kpi-hint">{hint}</span> : null}
    </article>
  );
}
