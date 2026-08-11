import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

export type LiveDotProps = HTMLAttributes<HTMLSpanElement> & {
  /** Wrap in yellow live badge (dashboard style). */
  badge?: boolean;
  children?: ReactNode;
};

export function LiveDot({
  badge = false,
  className,
  children,
  ...props
}: LiveDotProps) {
  return (
    <span
      className={cn("ca-live-dot", badge && "ca-live-dot--badge", className)}
      {...props}
    >
      <span className="ca-live-dot__core" aria-hidden />
      {children != null ? (
        <span className="ca-live-dot__label">{children}</span>
      ) : null}
    </span>
  );
}
