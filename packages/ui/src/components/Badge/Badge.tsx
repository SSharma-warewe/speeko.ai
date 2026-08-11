import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

export type BadgeTone =
  | "neutral"
  | "amber"
  | "live"
  | "info"
  | "success"
  | "danger"
  | "warn";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  children: ReactNode;
};

const toneClass: Record<BadgeTone, string> = {
  neutral: "ca-badge--neutral",
  amber: "ca-badge--amber",
  live: "ca-badge--live",
  info: "ca-badge--info",
  success: "ca-badge--success",
  danger: "ca-badge--danger",
  warn: "ca-badge--warn",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn("ca-badge", toneClass[tone], className)} {...props}>
      {children}
    </span>
  );
}
