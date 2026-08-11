import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  required?: boolean;
  /** Horizontal label (checkbox/toggle style). */
  inline?: boolean;
  children: ReactNode;
};

export function Label({
  className,
  required = false,
  inline = false,
  children,
  ...props
}: LabelProps) {
  if (inline) {
    return (
      <label className={cn("ca-label ca-label--inline", className)} {...props}>
        {children}
      </label>
    );
  }

  return (
    <label className={cn("ca-label", className)} {...props}>
      <span className="ca-label__text">
        {children}
        {required ? (
          <span className="ca-label__required" aria-hidden>
            *
          </span>
        ) : null}
      </span>
    </label>
  );
}
