import {
  Archive,
  Copy,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  UserMinus,
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
import { formatBytes, formatRelativeTime, formatTime } from "@/lib/format";
import type { BrowserConfig } from "@/types/browser";
import type { Environment, EnvironmentStats } from "@/types/environment";
import { EnvironmentAvatar } from "./EnvironmentAvatar";

interface EnvironmentRowProps {
  environment: Environment;
  browser: BrowserConfig | undefined;
  stats: EnvironmentStats | undefined;
  scanning: boolean;
  launching: boolean;
  onLaunch: (environment: Environment) => void;
  onEdit: (environment: Environment) => void;
  onOpenDirectory: (environment: Environment) => void;
  onCopyPath: (environment: Environment) => void;
  onBackup: (environment: Environment) => void;
  onRemove: (environment: Environment) => void;
  onDelete: (environment: Environment) => void;
  onRefreshStatuses: () => void;
}

export function EnvironmentRow({
  environment,
  browser,
  stats,
  scanning,
  launching,
  onLaunch,
  onEdit,
  onOpenDirectory,
  onCopyPath,
  onBackup,
  onRemove,
  onDelete,
  onRefreshStatuses,
}: EnvironmentRowProps) {
  const running = environment.lastStatus === "running";
  const unknown = environment.lastStatus === "unknown";
  const backupBlocked = environment.lastStatus !== "stopped";
  const launchBlocked = running || unknown || launching;

  return (
    <tr className="group border-b border-line/70 transition-colors last:border-b-0 hover:bg-panel-hover">
      <td className="px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <EnvironmentAvatar
            name={environment.name}
            color={environment.color}
            size="md"
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[12.5px] font-medium text-ink">
                {environment.name}
              </span>
              {environment.sourceType === "imported" ? (
                <Badge tone="neutral" className="shrink-0">
                  外部
                </Badge>
              ) : null}
            </div>
            <p
              className="mt-[1px] truncate text-[11px] leading-4 text-ink-subtle"
              title={environment.userDataDir}
            >
              {environment.description || environment.userDataDir}
            </p>
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5">
        {launching ? (
          <span className="inline-flex items-center gap-2 text-[12px] font-medium text-accent-ink">
            <Spinner className="h-3 w-3" label="正在启动" />
            启动中
          </span>
        ) : (
          <StatusIndicator status={environment.lastStatus} />
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
        {scanning ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-subtle">
            <Spinner className="h-3 w-3" label="正在统计" />
            统计中
          </span>
        ) : (
          <span title={stats ? `更新于 ${formatTime(stats.measuredAt, true)}` : undefined}>
            {stats ? formatBytes(stats.sizeBytes) : "—"}
          </span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <p
          className="text-[12px] text-ink-muted"
          title={
            environment.lastLaunchedAt
              ? formatTime(environment.lastLaunchedAt, true)
              : undefined
          }
        >
          {formatRelativeTime(environment.lastLaunchedAt)}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {running ? (
            <Button
              variant="accent"
              size="sm"
              disabled
              title="该环境正在运行。BrowserHub 不会重复启动同一个用户数据目录。"
              icon={
                <span
                  aria-hidden
                  className="inline-block h-[6px] w-[6px] rounded-full bg-success"
                />
              }
            >
              运行中
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={launchBlocked}
              loading={launching}
              title={
                unknown
                  ? "无法确认该环境是否已退出，请先刷新状态"
                  : undefined
              }
              icon={<Play className="h-3.5 w-3.5" strokeWidth={1.8} />}
              onClick={() => onLaunch(environment)}
            >
              启动
            </Button>
          )}

          <DropdownMenu
            menuLabel={`${environment.name} 操作`}
            trigger={(triggerProps) => (
              <IconButton {...triggerProps} label="更多操作" size="sm">
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
              </IconButton>
            )}
          >
            <DropdownMenuItem
              icon={Play}
              disabled={launchBlocked}
              onSelect={() => onLaunch(environment)}
            >
              启动环境
            </DropdownMenuItem>
            <DropdownMenuItem icon={Pencil} onSelect={() => onEdit(environment)}>
              编辑环境
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={FolderOpen}
              onSelect={() => onOpenDirectory(environment)}
            >
              打开数据目录
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={Copy}
              onSelect={() => onCopyPath(environment)}
            >
              复制目录路径
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={Archive}
              disabled={backupBlocked}
              onSelect={() => onBackup(environment)}
            >
              创建备份
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={RefreshCw}
              onSelect={onRefreshStatuses}
            >
              刷新运行状态
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={UserMinus} onSelect={() => onRemove(environment)}>
              从 BrowserHub 移除
            </DropdownMenuItem>
            <DropdownMenuItem
              danger
              icon={Trash2}
              onSelect={() => onDelete(environment)}
            >
              删除环境及数据
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
