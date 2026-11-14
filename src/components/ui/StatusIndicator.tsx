import { cn } from "@/lib/cn";
import type { EnvironmentStatus } from "@/types/environment";

const STATUS_META: Record<
  EnvironmentStatus,
  { label: string; dot: string; text: string }
> = {
  running: {
    label: "运行中",
    dot: "bg-success shadow-[0_0_0_3px_var(--bh-success-soft)]",
    text: "text-success",
  },
  stopped: {
    label: "已停止",
    dot: "border border-ink-subtle/80 bg-transparent",
    text: "text-ink-muted",
  },
  unknown: {
    label: "状态未知",
    dot: "bg-warning",
    text: "text-warning",
  },
  error: {
    label: "异常",
    dot: "bg-danger",
    text: "text-danger",
  },
};

interface StatusIndicatorProps {
  status: EnvironmentStatus;
  showLabel?: boolean;
  className?: string;
}

export function StatusIndicator({
  status,
  showLabel = true,
  className,
}: StatusIndicatorProps) {
  const meta = STATUS_META[status] ?? STATUS_META.unknown;

  return (
    <span
      className={cn("inline-flex items-center gap-2", meta.text, className)}
      title={meta.label}
    >
      <span
        aria-hidden
        className={cn("inline-block h-[7px] w-[7px] shrink-0 rounded-full", meta.dot)}
      />
      {showLabel ? (
        <span className="text-[12px] font-medium">{meta.label}</span>
      ) : (
        <span className="sr-only">{meta.label}</span>
      )}
    </span>
  );
}
