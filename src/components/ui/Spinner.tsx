import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className, label = "加载中" }: SpinnerProps) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-muted" role="status">
      <Loader2
        className={cn("h-4 w-4 animate-spin", className)}
        strokeWidth={2}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
