import {
  Archive,
  Copy,
  FolderOpen,
  Home,
  MoreHorizontal,
  Play,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { formatBytes, formatTime } from "@/lib/format";
import type { BrowserConfig } from "@/types/browser";
import type { SystemDefaultRow } from "@/types/environment";

interface SystemDefaultRowProps {
  row: SystemDefaultRow | null;
  loading: boolean;
  launching: boolean;
  browser: BrowserConfig | undefined;
  measuredAt?: string;
  onLaunch: () => void;
  onOpenDirectory: () => void;
  onCopyPath: () => void;
  onRefreshStatuses: () => void;
  onOpenSettings: () => void;
}

/**
 * The special first row of the environments table: the system default Chrome
 * (env_default). Not a user environment - no edit/delete/backup actions.
 * Its "启动" opens Chrome WITHOUT --user-data-dir, exactly like double-
 * clicking the desktop icon (both resolve the junction to env_default).
 */
export function SystemDefaultRow({
  row,
  loading,
  launching,
  browser,
  measuredAt,
  onLaunch,
  onOpenDirectory,
  onCopyPath,
  onRefreshStatuses,
  onOpenSettings,
}: SystemDefaultRowProps) {
  const managed = row?.managed ?? false;
  const running = row?.status === "running";
  const unknown = !row || row.status === "unknown";

  return (
    <tr className="border-b border-line/70 bg-accent-soft/25 transition-colors last:border-b-0 hover:bg-panel-hover">
      <td className="px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border border-accent/40 bg-accent-soft text-accent"
            title="系统默认 Chrome（双击桌面图标打开的实例）"
          >
            <Home className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[12.5px] font-medium text-ink">
                系统默认 Chrome
              </span>
              <Badge tone="accent" className="shrink-0">
                默认
              </Badge>
            </div>
            <p
              className="mt-[1px] truncate text-[11px] leading-4 text-ink-subtle"
              title={row?.userDataDir}
            >
              {managed
                ? "已托管 · 双击 Chrome 图标即打开此环境"
                : "未托管 · 可在设置中托管默认 Chrome"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5">
        {loading ? (
          <span className="inline-flex items-center gap-2 text-[12px] font-medium text-accent-ink">
            <Spinner className="h-3 w-3" label="正在读取" />
            读取中
          </span>
        ) : !managed ? (
          <span className="text-[12px] text-ink-subtle">未托管</span>
        ) : launching ? (
          <span className="inline-flex items-center gap-2 text-[12px] font-medium text-accent-ink">
            <Spinner className="h-3 w-3" label="正在启动" />
            启动中
          </span>
        ) : (
          <StatusIndicator status={row?.status ?? "unknown"} />
        )}
      </td>

      <td className="px-3 py-2.5">
        <p className="truncate text-[12px] text-ink">
          {browser?.name ?? "Chrome 未配置"}
        </p>
        <p className="truncate text-[10.5px] text-ink-subtle">
          {browser?.version ? `版本 ${browser.version}` : "请在设置中选择"}
        </p>
      </td>

      <td className="tabular px-3 py-2.5 text-[12px] text-ink-muted">
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-subtle">
            <Spinner className="h-3 w-3" label="正在统计" />
            统计中
          </span>
        ) : (
          <span
            title={
              measuredAt && row
                ? `更新于 ${formatTime(measuredAt, true)} · ${row.fileCount} 个文件`
                : undefined
            }
          >
            {row && row.sizeBytes > 0 ? formatBytes(row.sizeBytes) : "—"}
          </span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[12px] text-ink-muted">
          {managed ? (running ? "刚刚" : "—") : "—"}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {loading ? null : !managed ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Settings2 className="h-3.5 w-3.5" strokeWidth={1.7} />}
              onClick={onOpenSettings}
            >
              去托管
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={running || unknown || launching}
                loading={launching}
                title={
                  running
                    ? "默认 Chrome 正在运行"
                    : unknown
                      ? "无法确认默认 Chrome 是否已退出，请先刷新状态"
                      : undefined
                }
                icon={<Play className="h-3.5 w-3.5" strokeWidth={1.8} />}
                onClick={onLaunch}
              >
                启动
              </Button>
              <DropdownMenu
                menuLabel="系统默认 Chrome 操作"
                trigger={(triggerProps) => (
                  <IconButton {...triggerProps} label="更多操作" size="sm">
                    <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
                  </IconButton>
                )}
              >
                <DropdownMenuItem
                  icon={FolderOpen}
                  onSelect={onOpenDirectory}
                >
                  打开数据目录
                </DropdownMenuItem>
                <DropdownMenuItem icon={Copy} onSelect={onCopyPath}>
                  复制目录路径
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={RefreshCw} onSelect={onRefreshStatuses}>
                  刷新运行状态
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={Archive}
                  disabled={row?.originalBackupPath == null}
                  onSelect={onOpenSettings}
                >
                  {row?.originalBackupPath ? "原数据备份存在" : "无原数据备份"}
                </DropdownMenuItem>
              </DropdownMenu>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
