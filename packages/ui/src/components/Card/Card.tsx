import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../../utils/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
  surface?: boolean;
  /** Hover lift (marketing cards). */
  lift?: boolean;
  interactive?: boolean;
  children?: ReactNode;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    padded = false,
    surface = false,
    lift = false,
    interactive = false,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "ca-card",
        padded && "ca-card--padded",
        surface && "ca-card--surface",
        lift && "ca-card--lift",
        interactive && "ca-card--interactive",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
