import { AlertCircle, FolderPlus, Plus, RefreshCw, SearchX, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { call, getErrorMessage } from "@/lib/ipc";
import { useEnvironmentStats } from "@/features/environments/hooks/useEnvironmentStats";
import { useSystemDefaultRow } from "./hooks/useSystemDefaultRow";
import type { EnvironmentSort } from "@/lib/constants";
import type { Backup, BackupEnvironmentInput } from "@/types/backup";
import type { BrowserConfig } from "@/types/browser";
import type {
  Environment,
  EnvironmentStatusInfo,
} from "@/types/environment";
import type { AppSettings } from "@/types/settings";
import { BackupEnvironmentDialog } from "@/features/backups/components/BackupEnvironmentDialog";
import { DeleteEnvironmentDialog } from "./components/DeleteEnvironmentDialog";
import { EnvironmentDialog } from "./components/EnvironmentDialog";
import { EnvironmentTable } from "./components/EnvironmentTable";
import { EnvironmentToolbar } from "./components/EnvironmentToolbar";
import { ImportEnvironmentDialog } from "./components/ImportEnvironmentDialog";

interface EnvironmentsPageProps {
  environments: Environment[];
  browsers: BrowserConfig[];
  settings: AppSettings;
  loading: boolean;
  error: string | null;
  refreshingStatus: boolean;
  lastStatusRefresh: Date | null;
  onReload: () => Promise<void>;
  onRefreshStatuses: () => Promise<void>;
  onApplyStatus: (info: EnvironmentStatusInfo) => void;
  onCreateBackup: (input: BackupEnvironmentInput) => Promise<Backup>;
  onOpenSettings: () => void;
}

interface DeleteTarget {
  environment: Environment;
  mode: "remove" | "delete";
}

function sortEnvironments(
  environments: Environment[],
  sort: EnvironmentSort,
): Environment[] {
  const copy = [...environments];
  switch (sort) {
    case "name":
      return copy.sort((left, right) =>
        left.name.localeCompare(right.name, "zh-CN"),
      );
    case "created":
      return copy.sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );
    case "recent":
    default:
      return copy.sort((left, right) => {
        const leftTime = left.lastLaunchedAt
          ? new Date(left.lastLaunchedAt).getTime()
          : 0;
        const rightTime = right.lastLaunchedAt
          ? new Date(right.lastLaunchedAt).getTime()
          : 0;
        return rightTime - leftTime;
      });
  }
}

export function EnvironmentsPage({
  environments,
  browsers,
  settings,
  loading,
  error,
  refreshingStatus,
  lastStatusRefresh,
  onReload,
  onRefreshStatuses,
  onApplyStatus,
  onCreateBackup,
  onOpenSettings,
}: EnvironmentsPageProps) {
  const { toast } = useToast();
  const stats = useEnvironmentStats(environments);
  const systemDefault = useSystemDefaultRow();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<EnvironmentSort>("recent");
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Environment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [backupTarget, setBackupTarget] = useState<Environment | null>(null);

  const runningCount = environments.filter(
    (environment) => environment.lastStatus === "running",
  ).length;

  const visibleEnvironments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("zh-CN");
    const filtered = query
      ? environments.filter((environment) =>
          [environment.name, environment.description, environment.userDataDir]
            .filter(Boolean)
            .some((value) =>
              value!.toLocaleLowerCase("zh-CN").includes(query),
            ),
        )
      : environments;
    return sortEnvironments(filtered, sort);
  }, [environments, search, sort]);

  const handleLaunch = async (environment: Environment) => {
    if (launchingId) {
      return;
    }
    setLaunchingId(environment.id);
    try {
      const status = await call<EnvironmentStatusInfo>("launch_environment", {
        environmentId: environment.id,
      });
      onApplyStatus(status);
      toast({
        title: `已启动「${environment.name}」`,
        description: "Chrome 使用该环境独立的用户数据目录运行。",
        variant: "success",
      });
      void onReload();
    } catch (cause) {
      toast({
        title: "无法启动环境",
        description: getErrorMessage(cause),
        variant: "error",
      });
      void onRefreshStatuses();
    } finally {
      setLaunchingId(null);
    }
  };

  const handleOpenDirectory = async (environment: Environment) => {
    try {
      await call("open_directory", { path: environment.userDataDir });
    } catch (cause) {
      toast({
        title: "无法打开目录",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  const handleCopyPath = async (environment: Environment) => {
    const copied = await copyText(environment.userDataDir);
    toast({
      title: copied ? "路径已复制" : "复制失败",
      description: copied ? environment.userDataDir : "请手动选择路径后复制。",
      variant: copied ? "success" : "error",
    });
  };

  const handleRefreshStats = async () => {
    if (environments.length === 0) {
      return;
    }
    await stats.refreshAll();
    toast({ title: "空间统计已更新", variant: "success" });
  };

  const showEmpty = !loading && environments.length === 0;

  return (
    <>
      <PageHeader
        title="浏览器环境"
        description="每个环境使用独立的 Chrome 用户数据目录，登录状态互不影响。"
        actions={
          <>
            <IconButton
              label="刷新运行状态"
              variant="secondary"
              onClick={() => void onRefreshStatuses()}
              disabled={refreshingStatus}
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshingStatus ? "animate-spin" : ""}`}
                strokeWidth={1.7}
              />
            </IconButton>
            <Button
              variant="secondary"
              icon={<Upload className="h-4 w-4" strokeWidth={1.7} />}
              onClick={() => setImportOpen(true)}
            >
              导入环境
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" strokeWidth={2} />}
              onClick={() => setCreateOpen(true)}
            >
              新建环境
            </Button>
          </>
        }
      />

      <EnvironmentToolbar
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        refreshingStatus={refreshingStatus}
        lastStatusRefresh={lastStatusRefresh}
        onRefreshStatuses={() => void onRefreshStatuses()}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-4 pt-4">
        {browsers.length === 0 ? (
          <Notice
            tone="warning"
            title="尚未配置 Chrome"
            actions={
              <Button size="sm" variant="secondary" onClick={onOpenSettings}>
                前往设置
              </Button>
            }
          >
            创建环境需要至少一个 Chrome 安装。请先指定 chrome.exe，已有环境仍可查看但无法启动。
          </Notice>
        ) : null}

        {error ? (
          <Notice
            tone="danger"
            title="无法读取环境列表"
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
          {loading && environments.length === 0 ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="flex h-[58px] items-center gap-3 border-b border-line/70 px-3 last:border-b-0"
                >
                  <div className="h-[30px] w-[30px] animate-pulse rounded-[7px] bg-panel-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-[160px] animate-pulse rounded bg-panel-muted" />
                    <div className="h-2 w-[260px] animate-pulse rounded bg-panel-muted" />
                  </div>
                  <div className="h-2.5 w-[52px] animate-pulse rounded bg-panel-muted" />
                  <div className="h-7 w-[72px] animate-pulse rounded-[6px] bg-panel-muted" />
                </div>
              ))}
            </div>
          ) : showEmpty ? (
            <EmptyState
              icon={FolderPlus}
              title="还没有浏览器环境"
              description="新建一个独立环境，或导入之前通过命令行创建的 Chrome User Data Directory。原目录不会被复制。"
              actions={
                <>
                  <Button
                    variant="secondary"
                    icon={<Upload className="h-4 w-4" strokeWidth={1.7} />}
                    onClick={() => setImportOpen(true)}
                  >
                    导入已有环境
                  </Button>
                  <Button
                    variant="primary"
                    icon={<Plus className="h-4 w-4" strokeWidth={2} />}
                    onClick={() => setCreateOpen(true)}
                  >
                    新建环境
                  </Button>
                </>
              }
            />
          ) : visibleEnvironments.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="没有匹配的环境"
              description={`没有找到与“${search.trim()}”相关的结果。`}
              actions={
                <Button variant="secondary" onClick={() => setSearch("")}>
                  清除搜索
                </Button>
              }
            />
          ) : (
            <EnvironmentTable
              environments={visibleEnvironments}
              browsers={browsers}
              stats={stats.stats}
              loadingIds={stats.loadingIds}
              launchingId={launchingId}
              systemDefaultRow={systemDefault.row}
              systemDefaultLoading={systemDefault.loading}
              systemDefaultLaunching={systemDefault.launching}
              onLaunchSystemDefault={() => {
                void systemDefault.launch().catch((cause) => {
                  toast({
                    title: "无法启动默认 Chrome",
                    description: String(cause?.message ?? cause),
                    variant: "error",
                  });
                });
              }}
              onRefreshSystemDefault={() => void systemDefault.refresh()}
              onOpenSettings={onOpenSettings}
              onLaunch={(environment) => void handleLaunch(environment)}
              onEdit={setEditTarget}
              onOpenDirectory={(environment) => void handleOpenDirectory(environment)}
              onCopyPath={(environment) => void handleCopyPath(environment)}
              onBackup={setBackupTarget}
              onRemove={(environment) =>
                setDeleteTarget({ environment, mode: "remove" })
              }
              onDelete={(environment) =>
                setDeleteTarget({ environment, mode: "delete" })
              }
              onRefreshStatuses={() => void onRefreshStatuses()}
            />
          )}

          <footer className="flex h-9 shrink-0 items-center gap-3 border-t border-line bg-panel-muted/60 px-3 text-[10.5px] text-ink-subtle">
            <span>
              {environments.length} 个环境 · {runningCount} 个运行中
            </span>
            {search ? (
              <span>
                · 显示 {visibleEnvironments.length} 个
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-1.5">
              <span className="max-w-[280px] truncate font-mono" title={settings.environmentRootDir}>
                {settings.environmentRootDir || "尚未设置环境根目录"}
              </span>
              <IconButton
                label="刷新空间统计"
                size="sm"
                onClick={() => void handleRefreshStats()}
                disabled={stats.isScanning || environments.length === 0}
              >
                <RefreshCw
                  className={`h-3 w-3 ${stats.isScanning ? "animate-spin" : ""}`}
                  strokeWidth={1.8}
                />
              </IconButton>
            </span>
          </footer>
        </section>

        {stats.isScanning ? (
          <p className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
            <AlertCircle className="h-3 w-3" />
            正在后台统计目录大小，不会阻塞启动或编辑操作。
          </p>
        ) : null}
      </div>

      <EnvironmentDialog
        open={createOpen || editTarget !== null}
        mode={editTarget ? "edit" : "create"}
        environment={editTarget ?? undefined}
        settings={settings}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditTarget(null);
          }
        }}
        onSaved={(environment, mode) => {
          toast({
            title: mode === "create" ? "环境已创建" : "环境已更新",
            description:
              mode === "create"
                ? `首次启动时会在此目录生成 Chrome 数据：${environment.userDataDir}`
                : "名称与描述已保存，实际数据目录保持不变。",
            variant: "success",
          });
          void onReload();
        }}
      />

      <ImportEnvironmentDialog
        open={importOpen}
        settings={settings}
        onOpenChange={setImportOpen}
        onImported={(environment) => {
          toast({
            title: "环境已导入",
            description: `BrowserHub 正在引用原目录：${environment.userDataDir}`,
            variant: "success",
          });
          void onReload();
          void onRefreshStatuses();
        }}
      />

      <DeleteEnvironmentDialog
        open={deleteTarget !== null}
        mode={deleteTarget?.mode ?? "remove"}
        environment={deleteTarget?.environment ?? null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onCompleted={() => {
          toast({
            title:
              deleteTarget?.mode === "delete" ? "环境及数据已删除" : "已从 BrowserHub 移除",
            description:
              deleteTarget?.mode === "delete"
                ? "数据库记录与磁盘目录均已永久删除。"
                : "浏览器数据仍保留在原目录，可随时重新导入。",
            variant: "success",
          });
          setDeleteTarget(null);
          void onReload();
        }}
      />

      <BackupEnvironmentDialog
        open={backupTarget !== null}
        environments={environments}
        fixedEnvironmentId={backupTarget?.id ?? null}
        settings={settings}
        onOpenChange={(open) => {
          if (!open) {
            setBackupTarget(null);
          }
        }}
        onCreate={onCreateBackup}
        onCreated={(backup) => {
          toast({
            title: "备份已创建",
            description: `${backup.environmentName} · ${backup.path}`,
            variant: "success",
          });
        }}
      />
    </>
  );
}
