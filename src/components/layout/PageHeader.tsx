import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-start justify-between gap-6 px-6 pb-4 pt-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[19px] font-semibold leading-[26px] tracking-[-0.015em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2 pt-0.5">{actions}</div>
      ) : null}
    </header>
  );
}
