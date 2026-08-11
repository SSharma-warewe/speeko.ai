import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, error = false, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn("ca-textarea", error && "ca-textarea--error", className)}
        aria-invalid={error || undefined}
        {...props}
      />
    );
  },
);
