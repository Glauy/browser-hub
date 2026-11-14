import { Copy, FolderOpen, FolderClosed } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

interface PathDisplayProps {
  path: string | null;
  placeholder?: string;
  onCopy?: () => void;
  onOpen?: () => void;
  onChange?: () => void;
  changeLabel?: string;
  tone?: "default" | "danger";
  className?: string;
}

export function PathDisplay({
  path,
  placeholder = "未选择目录",
  onCopy,
  onOpen,
  onChange,
  changeLabel = "更改…",
  tone = "default",
  className,
}: PathDisplayProps) {
  const Icon = path ? FolderOpen : FolderClosed;

  return (
    <div
      className={cn(
        "flex min-h-[38px] items-center gap-2 rounded-[7px] border px-2.5 py-1.5",
        tone === "danger"
          ? "border-danger/25 bg-danger-soft/40"
          : "border-line bg-panel-muted",
        className,
      )}
    >
      <Icon
        className={cn(
          "h-[15px] w-[15px] shrink-0",
          tone === "danger" ? "text-danger" : "text-ink-subtle",
        )}
        strokeWidth={1.7}
      />
      <span
        className={cn(
          "min-w-0 flex-1 select-text truncate font-mono text-[11.5px] leading-5",
          path
            ? tone === "danger"
              ? "text-danger"
              : "text-ink"
            : "text-ink-subtle",
        )}
        title={path ?? undefined}
      >
        {path ?? placeholder}
      </span>
      {path ? (
        <div className="flex shrink-0 items-center gap-0.5">
          {onCopy ? (
            <IconButton label="复制路径" size="sm" onClick={onCopy}>
              <Copy className="h-3.5 w-3.5" strokeWidth={1.7} />
            </IconButton>
          ) : null}
          {onOpen ? (
            <IconButton label="打开目录" size="sm" onClick={onOpen}>
              <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.7} />
            </IconButton>
          ) : null}
          {onChange ? (
            <Button
              variant="secondary"
              size="sm"
              className="ml-1 h-[26px] px-2 text-[11.5px]"
              onClick={onChange}
            >
              {changeLabel}
            </Button>
          ) : null}
        </div>
      ) : onChange ? (
        <Button
          variant="secondary"
          size="sm"
          className="h-[26px] px-2 text-[11.5px]"
          onClick={onChange}
        >
          选择…
        </Button>
      ) : null}
    </div>
  );
}
