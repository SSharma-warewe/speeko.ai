import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

export type AlertTone = "error" | "success" | "info" | "warn";

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone;
  children: ReactNode;
};

const toneClass: Record<AlertTone, string> = {
  error: "ca-alert--error",
  success: "ca-alert--success",
  info: "ca-alert--info",
  warn: "ca-alert--warn",
};

export function Alert({
  tone = "error",
  className,
  children,
  role,
  ...props
}: AlertProps) {
  return (
    <div
      className={cn("ca-alert", toneClass[tone], className)}
      role={role ?? (tone === "error" ? "alert" : "status")}
      {...props}
    >
      {children}
    </div>
  );
}
