import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "subtle"
  | "accent"
  | "danger"
  | "dangerGhost";

export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-contrast hover:bg-accent-strong border border-transparent",
  secondary:
    "bg-panel text-ink border border-line hover:bg-panel-hover hover:border-line-strong",
  ghost:
    "bg-transparent text-ink-muted border border-transparent hover:bg-panel-muted hover:text-ink",
  subtle:
    "bg-panel-muted text-ink border border-transparent hover:bg-line/70",
  accent:
    "bg-accent-soft text-accent-ink border border-accent/15 hover:bg-accent/15",
  danger:
    "bg-danger text-white border border-transparent hover:bg-danger-strong",
  dangerGhost:
    "bg-transparent text-danger border border-transparent hover:bg-danger-soft",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-[12px] gap-1.5",
  md: "h-9 px-3.5 text-[13px] gap-1.5",
  lg: "h-10 px-4 text-[13px] gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconAfter?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    iconAfter,
    children,
    className,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-[7px] font-medium transition-colors duration-100",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
      ) : (
        icon
      )}
      {children}
      {iconAfter}
    </button>
  );
});
