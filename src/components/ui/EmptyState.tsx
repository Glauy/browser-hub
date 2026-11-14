import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "px-6 py-16",
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-line bg-panel-muted text-ink-subtle">
        <Icon className="h-5 w-5" strokeWidth={1.6} />
      </div>
      <h3 className="mt-3.5 text-[13.5px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-[340px] text-[12px] leading-relaxed text-ink-muted">
        {description}
      </p>
      {actions ? <div className="mt-4 flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
