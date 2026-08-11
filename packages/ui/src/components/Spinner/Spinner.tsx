import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type SpinnerSize = "sm" | "md" | "lg";

export type SpinnerProps = HTMLAttributes<HTMLSpanElement> & {
  size?: SpinnerSize;
  label?: string;
};

const sizeClass: Record<SpinnerSize, string> = {
  sm: "ca-spinner--sm",
  md: "ca-spinner--md",
  lg: "ca-spinner--lg",
};

export function Spinner({
  size = "md",
  label = "Loading",
  className,
  ...props
}: SpinnerProps) {
  return (
    <span
      className={cn("ca-spinner", sizeClass[size], className)}
      role="status"
      aria-label={label}
      {...props}
    />
  );
}
