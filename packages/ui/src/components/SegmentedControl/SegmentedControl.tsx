import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type SegmentOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string = string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** CSS grid columns; defaults to options.length equal columns. */
  columns?: number;
  "aria-label"?: string;
};

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  className,
  columns,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const cols = columns ?? options.length;

  return (
    <div
      className={cn("ca-segment", className)}
      role="group"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={cn(
              "ca-segment__btn",
              active && "ca-segment__btn--active",
            )}
            aria-pressed={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
