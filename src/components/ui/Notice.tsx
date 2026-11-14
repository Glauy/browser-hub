import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type NoticeTone = "info" | "success" | "warning" | "danger";

const TONE_META: Record<
  NoticeTone,
  { icon: LucideIcon; container: string; iconClass: string }
> = {
  info: {
    icon: Info,
    container: "border-line bg-panel-muted",
    iconClass: "text-info",
  },
  success: {
    icon: CheckCircle2,
    container: "border-success/20 bg-success-soft/60",
    iconClass: "text-success",
  },
  warning: {
    icon: AlertTriangle,
    container: "border-warning/25 bg-warning-soft/60",
    iconClass: "text-warning",
  },
  danger: {
    icon: XCircle,
    container: "border-danger/25 bg-danger-soft/60",
    iconClass: "text-danger",
  },
};

interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  className?: string;
  actions?: ReactNode;
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
  actions,
}: NoticeProps) {
  const meta = TONE_META[tone];
  const Icon = meta.icon;

  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-[7px] border px-3 py-2.5",
        meta.container,
        className,
      )}
    >
      <Icon
        className={cn("mt-[1px] h-4 w-4 shrink-0", meta.iconClass)}
        strokeWidth={1.9}
      />
      <div className="min-w-0 flex-1">
        {title ? (
          <p className="text-[11.5px] font-medium leading-5 text-ink">{title}</p>
        ) : null}
        {children ? (
          <div className="text-[11px] leading-relaxed text-ink-muted [&_a]:underline [&_a]:underline-offset-2">
            {children}
          </div>
        ) : null}
        {actions ? <div className="mt-2 flex gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
