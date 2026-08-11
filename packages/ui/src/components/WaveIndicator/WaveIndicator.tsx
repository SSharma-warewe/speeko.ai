import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type WaveIndicatorProps = HTMLAttributes<HTMLSpanElement> & {
  bars?: 3 | 4 | 5;
  paused?: boolean;
  label?: string;
};

export function WaveIndicator({
  bars = 4,
  paused = false,
  label = "Audio active",
  className,
  ...props
}: WaveIndicatorProps) {
  return (
    <span
      className={cn(
        "ca-wave-indicator",
        paused && "ca-wave-indicator--paused",
        className,
      )}
      role="img"
      aria-label={label}
      {...props}
    >
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} />
      ))}
    </span>
  );
}
