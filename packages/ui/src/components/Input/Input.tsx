import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
  inputSize?: "md" | "lg";
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error = false, inputSize = "md", type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "ca-input",
        inputSize === "lg" && "ca-input--lg",
        error && "ca-input--error",
        className,
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  );
});
