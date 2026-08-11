import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  error?: boolean;
  selectSize?: "md" | "lg";
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, error = false, selectSize = "md", children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "ca-select",
        selectSize === "lg" && "ca-select--lg",
        error && "ca-select--error",
        className,
      )}
      aria-invalid={error || undefined}
      {...props}
    >
      {children}
    </select>
  );
});
