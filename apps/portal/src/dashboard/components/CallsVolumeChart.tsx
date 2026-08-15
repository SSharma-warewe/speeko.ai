import { useState } from "react";

export type DailyVolume = {
  date: string;
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
};

type Props = {
  days: DailyVolume[];
};

export function CallsVolumeChart({ days }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const series = days.length > 0 ? days : emptyWindow();
  const max = Math.max(1, ...series.map((d) => d.total));
  const active = hover != null ? series[hover] : null;

  return (
    <div className="ops-ov-volume">
      <div className="ops-ov-volume-meta">
        {active ? (
          <p>
            <strong>{formatDay(active.date, true)}</strong>
            <span>
              {active.total} made · {active.completed} done · {active.failed} failed
            </span>
          </p>
        ) : (
          <p>
            <strong>Last 14 days</strong>
            <span>{series.reduce((n, d) => n + d.total, 0)} calls created</span>
          </p>
        )}
      </div>
      <div
        className="ops-ov-volume-plot"
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox="0 0 560 168"
          width="100%"
          height="168"
          role="img"
          aria-label="Calls created per day for the last 14 days"
        >
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1="8"
              x2="552"
              y1={12 + (1 - t) * 120}
              y2={12 + (1 - t) * 120}
              stroke="#eceae4"
              strokeWidth="1"
            />
          ))}
          {series.map((d, i) => {
            const slot = 544 / series.length;
            const w = Math.max(8, slot * 0.55);
            const x = 8 + i * slot + (slot - w) / 2;
            const h = (d.total / max) * 120;
            const y = 132 - h;
            const on = hover === i;
            return (
              <g key={d.date}>
                <rect
                  x={x}
                  y={12}
                  width={w}
                  height={120}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={Math.max(d.total > 0 ? 3 : 0, h)}
                  rx="3"
                  fill={on ? "#854d0e" : d.total > 0 ? "#ca8a04" : "#e7e5e0"}
                  onMouseEnter={() => setHover(i)}
                />
                {(i === 0 || i === series.length - 1 || i % 3 === 0) && (
                  <text
                    x={x + w / 2}
                    y="156"
                    textAnchor="middle"
                    fill="#a3a3a3"
                    fontSize="10"
                    fontFamily="IBM Plex Sans, sans-serif"
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
      failed: 0,
      cancelled: 0,
    };
  });
}
