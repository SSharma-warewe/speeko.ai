import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Label } from "../Label";

export type FieldProps = {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Field({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("ca-field", className)}>
      {label != null ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="ca-field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="ca-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
