import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../utils/cn";

export type ChipActiveStyle = "amber" | "dark";

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  activeStyle?: ChipActiveStyle;
  count?: number | string;
  children: ReactNode;
};

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  {
    active = false,
    activeStyle = "amber",
    count,
    className,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "ca-chip",
        active && activeStyle === "amber" && "ca-chip--active",
        active && activeStyle === "dark" && "ca-chip--activeDark",
        className,
      )}
      aria-pressed={active}
      {...props}
    >
      {children}
      {count != null ? <span className="ca-chip__count">{count}</span> : null}
    </button>
  );
});
