import { ChevronDown, RefreshCw, Search, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { SORT_OPTIONS } from "@/lib/constants";
import type { EnvironmentSort } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";

interface EnvironmentToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: EnvironmentSort;
  onSortChange: (value: EnvironmentSort) => void;
  refreshingStatus: boolean;
  lastStatusRefresh: Date | null;
  onRefreshStatuses: () => void;
}

export function EnvironmentToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  refreshingStatus,
  lastStatusRefresh,
  onRefreshStatuses,
}: EnvironmentToolbarProps) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-6">
      <div className="relative w-[260px]">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-ink-subtle"
          strokeWidth={1.7}
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索环境名称或路径…"
          aria-label="搜索环境"
          className={cn(
            "h-8 w-full rounded-[7px] border border-line bg-panel pl-8 pr-8 text-[12.5px] text-ink",
            "placeholder:text-ink-subtle transition-colors hover:border-line-strong",
            "focus:border-accent/70 focus:outline-none focus:ring-[3px] focus:ring-accent/12",
            "[&::-webkit-search-cancel-button]:hidden",
          )}
        />
        {search ? (
          <button
            type="button"
            aria-label="清除搜索"
            onClick={() => onSearchChange("")}
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-[4px] text-ink-subtle hover:bg-panel-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        ) : null}
      </div>

      <div className="relative">
        <select
          value={sort}
          aria-label="排序方式"
          onChange={(event) => onSortChange(event.target.value as EnvironmentSort)}
          className="h-8 appearance-none rounded-[7px] border border-line bg-panel pl-2.5 pr-7 text-[12px] text-ink-muted transition-colors hover:border-line-strong focus:border-accent/70 focus:outline-none focus:ring-[3px] focus:ring-accent/12"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle"
          strokeWidth={1.8}
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-[10.5px] text-ink-subtle">
          {lastStatusRefresh
            ? `状态更新于 ${formatTime(lastStatusRefresh.toISOString(), true)}`
            : "尚未刷新状态"}
        </span>
        <IconButton
          label="刷新运行状态"
          size="sm"
          onClick={onRefreshStatuses}
          disabled={refreshingStatus}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshingStatus && "animate-spin")}
            strokeWidth={1.8}
          />
        </IconButton>
      </div>
    </div>
  );
}
