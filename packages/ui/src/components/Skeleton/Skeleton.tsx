import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type SkeletonVariant = "line" | "block" | "circle" | "pill";

export type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
};

const variantClass: Record<SkeletonVariant, string> = {
  line: "ca-skeleton--line",
  block: "ca-skeleton--block",
  circle: "ca-skeleton--circle",
  pill: "ca-skeleton--pill",
};

function toCssSize(value?: string | number): string | undefined {
  if (value == null) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

export function Skeleton({
  variant = "line",
  width,
  height,
  className,
  style,
  ...props
}: SkeletonProps) {
  const sized: CSSProperties = {
    ...style,
    width: toCssSize(width) ?? style?.width,
    height: toCssSize(height) ?? style?.height,
  };

  return (
    <span
      className={cn("ca-skeleton", variantClass[variant], className)}
      style={sized}
      aria-hidden="true"
      {...props}
    />
  );
}
