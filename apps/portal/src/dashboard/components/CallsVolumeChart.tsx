import { useState } from "react";

export type DailyVolume = {
  date: string;
  total: number;
  completed: number;
  incomplete?: number;
  failed: number;
  cancelled: number;
};

type Props = {
  days: DailyVolume[];
};

const COLORS = {
  completed: "#166534",
  incomplete: "#ca8a04",
  failed: "#991b1b",
  cancelled: "#737373",
} as const;

export function CallsVolumeChart({ days }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const series = days.length > 0 ? days : emptyWindow();
  const max = Math.max(1, ...series.map((d) => stackTotal(d)));
  const active = hover != null ? series[hover] : null;
  const windowTotal = series.reduce((n, d) => n + stackTotal(d), 0);
  const windowDone = series.reduce((n, d) => n + d.completed, 0);
  const windowFail = series.reduce((n, d) => n + d.failed, 0);

  return (
    <div className="ops-ov-volume">
      <div className="ops-ov-volume-meta">
        {active ? (
          <p>
            <strong>{formatDay(active.date, true)}</strong>
            <span>
              {stackTotal(active)} made · {active.completed} done
              {(active.incomplete ?? 0) > 0 ? ` · ${active.incomplete} incomplete` : ""}
              {" · "}
              {active.failed} failed
              {active.cancelled > 0 ? ` · ${active.cancelled} cancelled` : ""}
            </span>
          </p>
        ) : (
          <p>
            <strong>Last 14 days</strong>
            <span>
              {windowTotal} made · {windowDone} done · {windowFail} failed
            </span>
          </p>
        )}
        <ul className="ops-ov-volume-key" aria-hidden>
          <li>
            <span className="ops-ov-swatch" style={{ background: COLORS.completed }} />
            done
          </li>
          <li>
            <span className="ops-ov-swatch" style={{ background: COLORS.incomplete }} />
            incomplete
          </li>
          <li>
            <span className="ops-ov-swatch" style={{ background: COLORS.failed }} />
            failed
          </li>
          <li>
            <span className="ops-ov-swatch" style={{ background: COLORS.cancelled }} />
            cancelled
          </li>
        </ul>
      </div>
      <div className="ops-ov-volume-plot" onMouseLeave={() => setHover(null)}>
        <svg
          viewBox="0 0 560 148"
          width="100%"
          height="148"
          role="img"
          aria-label="Calls completed, failed, and cancelled per day for the last 14 days"
        >
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1="8"
              x2="552"
              y1={8 + (1 - t) * 108}
              y2={8 + (1 - t) * 108}
              stroke="#eceae4"
              strokeWidth="1"
            />
          ))}
          {series.map((d, i) => {
            const slot = 544 / series.length;
            const w = Math.max(8, slot * 0.58);
            const x = 8 + i * slot + (slot - w) / 2;
            const on = hover === i;
            const layers = stackLayers(d, max, 108, 8);
            return (
              <g key={d.date}>
                <rect
                  x={x}
                  y={8}
                  width={w}
                  height={108}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
                {layers.length === 0 ? (
                  <rect
                    x={x}
                    y={114}
                    width={w}
                    height={2}
                    rx="1"
                    fill={on ? "#d6d3d1" : "#e7e5e0"}
                    onMouseEnter={() => setHover(i)}
                  />
                ) : (
                  layers.map((layer) => (
                    <rect
                      key={layer.key}
                      x={x}
                      y={layer.y}
                      width={w}
                      height={layer.h}
                      fill={on ? layer.hot : layer.color}
                      onMouseEnter={() => setHover(i)}
                    />
                  ))
                )}
                {(i === 0 || i === series.length - 1 || i % 3 === 0) && (
                  <text
                    x={x + w / 2}
                    y="140"
                    textAnchor="middle"
                    fill="#a3a3a3"
                    fontSize="10"
                    fontFamily="var(--font-body)"
                  >
                    {formatDay(d.date, false)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function stackTotal(d: DailyVolume): number {
  return d.completed + (d.incomplete ?? 0) + d.failed + d.cancelled;
}

function stackLayers(
  d: DailyVolume,
  max: number,
  plotH: number,
  top: number,
): Array<{ key: string; y: number; h: number; color: string; hot: string }> {
  const parts: Array<{ key: keyof typeof COLORS; value: number }> = [
    { key: "completed", value: d.completed },
    { key: "incomplete", value: d.incomplete ?? 0 },
    { key: "failed", value: d.failed },
    { key: "cancelled", value: d.cancelled },
  ];
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (total <= 0) return [];
  const barH = Math.max(3, (total / max) * plotH);
  const baseline = top + plotH;
  let cursor = baseline;
  return parts
    .filter((p) => p.value > 0)
    .map((p) => {
      const h = Math.max(2, (p.value / total) * barH);
      cursor -= h;
      return {
        key: p.key,
        y: cursor,
        h,
        color: COLORS[p.key],
        hot:
          p.key === "completed"
            ? "#14532d"
            : p.key === "incomplete"
              ? "#a16207"
              : p.key === "failed"
                ? "#7f1d1d"
                : "#525252",
      };
    });
}

function formatDay(isoDate: string, long: boolean): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(long ? { weekday: "short" } : {}),
  });
}

function emptyWindow(): DailyVolume[] {
  const end = new Date();
  const key = end.toISOString().slice(0, 10);
  const start = new Date(`${key}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 13);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      total: 0,
      completed: 0,
      incomplete: 0,
      failed: 0,
      cancelled: 0,
    };
  });
}
