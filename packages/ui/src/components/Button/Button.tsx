import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "../../utils/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "ghostOnDark"
  | "cta"
  | "ctaDark"
  | "command"
  | "commandSecondary"
  | "commandGhost"
  | "dangerGhost";

export type ButtonSize = "sm" | "md" | "lg" | "xl";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  /** Soft box-shadow pulse (hero CTA). */
  pulse?: boolean;
  /** Shine sweep on hover (gold CTA). */
  shine?: boolean;
  /** Trailing arrow that slides on hover. */
  showArrow?: boolean;
  className?: string;
  children?: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    as?: "button";
    href?: never;
  };

type ButtonAsAnchor = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & {
    as: "a";
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const variantClass: Record<ButtonVariant, string> = {
  primary: "ca-btn--primary",
  secondary: "ca-btn--secondary",
  ghost: "ca-btn--ghost",
  ghostOnDark: "ca-btn--ghostOnDark",
  cta: "ca-btn--cta",
  ctaDark: "ca-btn--ctaDark",
  command: "ca-btn--command",
  commandSecondary: "ca-btn--commandSecondary",
  commandGhost: "ca-btn--commandGhost",
  dangerGhost: "ca-btn--dangerGhost",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "ca-btn--sm",
  md: "ca-btn--md",
  lg: "ca-btn--lg",
  xl: "ca-btn--xl",
};

export const Button = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>(function Button(props, ref) {
  const {
    variant = "primary",
    size = "md",
    fullWidth = false,
    loading = false,
    pulse = false,
    shine = false,
    showArrow = false,
    className,
    children,
    as = "button",
    ...rest
  } = props;

  const classes = cn(
    "ca-btn",
    variantClass[variant],
    sizeClass[size],
    fullWidth && "ca-btn--full",
    pulse && "ca-btn--pulse",
    shine && "ca-btn--shine",
    className,
  );

  const content = (
    <>
      {loading ? <span className="ca-btn__spinner" aria-hidden /> : null}
      <span className="ca-btn__label">{children}</span>
      {showArrow ? (
        <span className="ca-btn__arrow" aria-hidden>
          →
        </span>
      ) : null}
    </>
  );

  if (as === "a") {
    const anchorProps = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={classes}
        aria-disabled={loading || undefined}
        {...anchorProps}
      >
        {content}
      </a>
    );
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type={buttonProps.type ?? "button"}
      className={classes}
      disabled={buttonProps.disabled || loading}
      aria-busy={loading || undefined}
      {...buttonProps}
    >
      {content}
    </button>
  );
});
