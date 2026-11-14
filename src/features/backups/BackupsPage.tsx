import {
  Archive,
  Clock3,
  FolderOpen,
  HardDrive,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { useToast } from "@/components/ui/Toast";
import { call, getErrorMessage } from "@/lib/ipc";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { Backup, BackupEnvironmentInput } from "@/types/backup";
import type { Environment } from "@/types/environment";
import type { AppSettings } from "@/types/settings";
import { BackupEnvironmentDialog } from "@/features/backups/components/BackupEnvironmentDialog";
import { DeleteBackupDialog } from "@/features/backups/components/DeleteBackupDialog";
import { RestoreBackupDialog } from "@/features/backups/components/RestoreBackupDialog";

interface BackupsPageProps {
  backups: Backup[];
  environments: Environment[];
  settings: AppSettings;
  loading: boolean;
  error: string | null;
  onReload: () => Promise<void>;
  onCreateBackup: (input: BackupEnvironmentInput) => Promise<Backup>;
  onRestoreBackup: (backupId: string) => Promise<void>;
  onDeleteBackup: (backupId: string) => Promise<void>;
  onEnvironmentsChanged: () => void;
}

export function BackupsPage({
  backups,
  environments,
  settings,
  loading,
  error,
  onReload,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
  onEnvironmentsChanged,
}: BackupsPageProps) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);

  const environmentById = new Map(
    environments.map((environment) => [environment.id, environment]),
  );
  const totalSize = backups.reduce((sum, backup) => sum + backup.sizeBytes, 0);
  const backupRoot = settings.backupRootDir ?? `${settings.environmentRootDir}\\backups`;

  const openBackupDirectory = async (path: string) => {
    try {
      await call("open_directory", { path });
    } catch (cause) {
      toast({
        title: "无法打开备份目录",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  return (
    <>
      <PageHeader
        title="备份"
        description="完整保存 Chrome 用户数据目录，可恢复到仍存在的环境。"
        actions={
          <>
            <IconButton
              label="刷新备份列表"
              variant="secondary"
              onClick={() => void onReload()}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                strokeWidth={1.7}
              />
            </IconButton>
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" strokeWidth={2} />}
              onClick={() => setCreateOpen(true)}
              disabled={environments.length === 0}
            >
              创建备份
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-4 pt-1">
        <div className="grid shrink-0 grid-cols-3 gap-3">
          <div className="rounded-card border border-line bg-panel px-4 py-3 shadow-panel">
            <div className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
              <Archive className="h-3.5 w-3.5" strokeWidth={1.7} />
              备份数量
            </div>
            <p className="tabular mt-1 text-[21px] font-semibold leading-7 tracking-[-0.02em] text-ink">
              {backups.length}
            </p>
          </div>
          <div className="rounded-card border border-line bg-panel px-4 py-3 shadow-panel">
            <div className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
              <HardDrive className="h-3.5 w-3.5" strokeWidth={1.7} />
              备份总占用
            </div>
            <p className="tabular mt-1 text-[21px] font-semibold leading-7 tracking-[-0.02em] text-ink">
              {formatBytes(totalSize)}
            </p>
          </div>
          <div className="min-w-0 rounded-card border border-line bg-panel px-4 py-3 shadow-panel">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
                <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.7} />
                备份目录
              </div>
              <IconButton
                label="打开备份目录"
                size="sm"
                onClick={() => void openBackupDirectory(backupRoot)}
              >
                <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.7} />
              </IconButton>
            </div>
            <p
              className="mt-2 truncate font-mono text-[11px] text-ink-muted"
              title={backupRoot}
            >
              {backupRoot}
            </p>
          </div>
        </div>

        {error ? (
          <Notice
            tone="danger"
            title="无法读取备份列表"
            actions={
              <Button size="sm" variant="secondary" onClick={() => void onReload()}>
                重试
              </Button>
            }
          >
            {error}
          </Notice>
        ) : null}

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-panel shadow-panel">
          {loading && backups.length === 0 ? (
            <div>
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="flex h-[52px] items-center gap-3 border-b border-line/70 px-3 last:border-b-0"
                >
                  <div className="h-2.5 w-[140px] animate-pulse rounded bg-panel-muted" />
                  <div className="ml-auto h-2.5 w-[100px] animate-pulse rounded bg-panel-muted" />
                  <div className="h-7 w-[64px] animate-pulse rounded-[6px] bg-panel-muted" />
                </div>
              ))}
            </div>
          ) : backups.length === 0 ? (
            <EmptyState
              icon={Archive}
              title="还没有备份"
              description="备份是完整目录副本。创建前必须先关闭目标环境的 Chrome，避免复制到正在写入的数据。"
              actions={
                <Button
                  variant="primary"
                  icon={<Plus className="h-4 w-4" strokeWidth={2} />}
                  onClick={() => setCreateOpen(true)}
                  disabled={environments.length === 0}
                >
                  创建第一个备份
                </Button>
              }
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[820px] table-fixed border-collapse">
                <colgroup>
                  <col />
                  <col className="w-[150px]" />
                  <col className="w-[92px]" />
                  <col className="w-[190px]" />
                  <col className="w-[104px]" />
                  <col className="w-[172px]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-panel">
                  <tr className="border-b border-line text-left">
                    <th className="px-3 py-2 text-[10.5px] font-medium tracking-wide text-ink-subtle">
                      环境
                    </th>
                    <th className="px-3 py-2 text-[10.5px] font-medium tracking-wide text-ink-subtle">
                      创建时间
                    </th>
                    <th className="px-3 py-2 text-[10.5px] font-medium tracking-wide text-ink-subtle">
                      大小
                    </th>
                    <th className="px-3 py-2 text-[10.5px] font-medium tracking-wide text-ink-subtle">
                      备注
                    </th>
                    <th className="px-3 py-2 text-[10.5px] font-medium tracking-wide text-ink-subtle">
                      状态
                    </th>
                    <th className="px-3 py-2 text-right text-[10.5px] font-medium tracking-wide text-ink-subtle">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => {
                    const environment = environmentById.get(backup.environmentId);
                    const exists = backup.environmentExists && environment;
                    const canRestore =
                      exists &&
                      environment.lastStatus !== "running" &&
                      environment.lastStatus !== "unknown";
                    return (
                      <tr
                        key={backup.id}
                        className="border-b border-line/70 transition-colors last:border-b-0 hover:bg-panel-hover"
                      >
                        <td className="px-3 py-2.5">
                          <p className="truncate text-[12.5px] font-medium text-ink">
                            {backup.environmentName}
                          </p>
                          <p
                            className="mt-0.5 truncate font-mono text-[10.5px] text-ink-subtle"
                            title={backup.path}
                          >
                            {backup.path}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                            <Clock3 className="h-3 w-3 text-ink-subtle" strokeWidth={1.7} />
                            {formatDateTime(backup.createdAt)}
                          </p>
                        </td>
                        <td className="tabular px-3 py-2.5 text-[12px] text-ink-muted">
                          {formatBytes(backup.sizeBytes)}
                        </td>
                        <td className="px-3 py-2.5">
                          <p
                            className="truncate text-[11.5px] text-ink-muted"
                            title={backup.note ?? undefined}
                          >
                            {backup.note || "—"}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          {!backup.environmentExists ? (
                            <Badge tone="warning">环境已移除</Badge>
                          ) : environment?.lastStatus === "running" ? (
                            <StatusIndicator status="running" />
                          ) : environment?.lastStatus === "unknown" ? (
                            <StatusIndicator status="unknown" />
                          ) : (
                            <Badge tone="success">可恢复</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Undo2 className="h-3.5 w-3.5" strokeWidth={1.8} />}
                              disabled={!canRestore}
                              title={
                                !exists
                                  ? "目标环境已被移除，无法恢复"
                                  : !canRestore
                                    ? "请先关闭目标环境的 Chrome 并刷新状态"
                                    : undefined
                              }
                              onClick={() => setRestoreTarget(backup)}
                            >
                              恢复
                            </Button>
                            <DropdownMenu
                              menuLabel={`${backup.environmentName} 备份操作`}
                              trigger={(triggerProps) => (
                                <IconButton {...triggerProps} label="更多操作" size="sm">
                                  <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
                                </IconButton>
                              )}
                            >
                              <DropdownMenuItem
                                icon={FolderOpen}
                                onSelect={() => void openBackupDirectory(backup.path)}
                              >
                                打开备份目录
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                danger
                                icon={Trash2}
                                onSelect={() => setDeleteTarget(backup)}
                              >
                                删除备份
                              </DropdownMenuItem>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <footer className="flex h-9 shrink-0 items-center gap-2 border-t border-line bg-panel-muted/60 px-3 text-[10.5px] text-ink-subtle">
            <span>{backups.length} 份备份</span>
            <span>·</span>
            <span>共 {formatBytes(totalSize)}</span>
            <span className="ml-auto">备份目录可在设置中修改，已有备份不会移动</span>
          </footer>
        </section>
      </div>

      <BackupEnvironmentDialog
        open={createOpen}
        environments={environments}
        settings={settings}
        onOpenChange={setCreateOpen}
        onCreate={onCreateBackup}
        onCreated={(backup) => {
          toast({
            title: "备份已创建",
            description: `${backup.environmentName} · ${formatBytes(backup.sizeBytes)}`,
            variant: "success",
          });
        }}
      />

      <RestoreBackupDialog
        open={restoreTarget !== null}
        backup={restoreTarget}
        environment={
          restoreTarget ? environmentById.get(restoreTarget.environmentId) ?? null : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setRestoreTarget(null);
          }
        }}
        onRestore={onRestoreBackup}
        onRestored={(backup) => {
          toast({
            title: "备份已恢复",
            description: `${backup.environmentName} 的数据目录已替换为所选备份。`,
            variant: "success",
          });
          onEnvironmentsChanged();
        }}
      />

      <DeleteBackupDialog
        open={deleteTarget !== null}
        backup={deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onDelete={onDeleteBackup}
        onDeleted={(backup) => {
          toast({
            title: "备份已删除",
            description: `${backup.environmentName} · ${formatBytes(backup.sizeBytes)} 已释放。`,
            variant: "success",
          });
        }}
      />
    </>
  );
}
