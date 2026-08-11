import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

export type EyebrowProps = HTMLAttributes<HTMLParagraphElement> & {
  onDark?: boolean;
  tight?: boolean;
  children: ReactNode;
};

export function Eyebrow({
  onDark = false,
  tight = false,
  className,
  children,
  ...props
}: EyebrowProps) {
  return (
    <p
      className={cn(
        "ca-eyebrow",
        onDark && "ca-eyebrow--onDark",
        tight && "ca-eyebrow--tight",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
