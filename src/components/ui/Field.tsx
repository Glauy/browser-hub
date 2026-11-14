import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const CONTROL_BASE =
  "w-full rounded-[7px] border border-line bg-panel text-ink placeholder:text-ink-subtle transition-colors duration-100 " +
  "hover:border-line-strong focus:border-accent/70 focus:outline-none focus:ring-[3px] focus:ring-accent/12 " +
  "disabled:bg-panel-muted disabled:text-ink-subtle";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        CONTROL_BASE,
        "h-9 px-2.5 text-[13px]",
        invalid && "border-danger/70 focus:border-danger focus:ring-danger/10",
        className,
      )}
      {...props}
    />
  );
});

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          CONTROL_BASE,
          "min-h-[76px] resize-none px-2.5 py-2 text-[13px] leading-relaxed",
          invalid && "border-danger/70 focus:border-danger focus:ring-danger/10",
          className,
        )}
        {...props}
      />
    );
  },
);

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="text-[12px] font-medium text-ink"
        >
          {label}
          {optional ? (
            <span className="ml-1.5 font-normal text-ink-subtle">可选</span>
          ) : null}
        </label>
        {hint ? (
          <span className="text-[11px] text-ink-subtle">{hint}</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-[11.5px] leading-snug text-danger">{error}</p>
      ) : null}
    </div>
  );
}
