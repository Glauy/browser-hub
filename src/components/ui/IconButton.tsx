import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type IconButtonVariant = "ghost" | "secondary" | "dangerGhost";
export type IconButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  ghost: "text-ink-muted hover:bg-panel-muted hover:text-ink",
  secondary:
    "border border-line bg-panel text-ink-muted hover:bg-panel-hover hover:text-ink",
  dangerGhost: "text-ink-subtle hover:bg-danger-soft hover:text-danger",
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: "h-6 w-6 rounded-[5px]",
  md: "h-8 w-8 rounded-[7px]",
  lg: "h-9 w-9 rounded-[7px]",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      variant = "ghost",
      size = "md",
      className,
      type = "button",
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={props.title ?? label}
        title={props.title ?? label}
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center transition-colors duration-100",
          "disabled:pointer-events-none disabled:opacity-40",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
