import type { BrowserConfig } from "@/types/browser";
import type { Environment, EnvironmentStats, SystemDefaultRow } from "@/types/environment";
import { EnvironmentRow } from "./EnvironmentRow";
import { SystemDefaultRow as SystemDefaultRowComponent } from "./SystemDefaultRow";

interface EnvironmentTableProps {
  environments: Environment[];
  browsers: BrowserConfig[];
  stats: Record<string, EnvironmentStats>;
  loadingIds: string[];
  launchingId: string | null;
  systemDefaultRow: SystemDefaultRow | null;
  systemDefaultLoading: boolean;
  systemDefaultLaunching: boolean;
  onLaunchSystemDefault: () => void;
  onRefreshSystemDefault: () => void;
  onOpenSettings: () => void;
  onLaunch: (environment: Environment) => void;
  onEdit: (environment: Environment) => void;
  onOpenDirectory: (environment: Environment) => void;
  onCopyPath: (environment: Environment) => void;
  onBackup: (environment: Environment) => void;
  onRemove: (environment: Environment) => void;
  onDelete: (environment: Environment) => void;
  onRefreshStatuses: () => void;
}

export function EnvironmentTable({
  environments,
  browsers,
  stats,
  loadingIds,
  launchingId,
  systemDefaultRow,
  systemDefaultLoading,
  systemDefaultLaunching,
  onLaunchSystemDefault,
  onRefreshSystemDefault,
  onOpenSettings,
  onLaunch,
  onEdit,
  onOpenDirectory,
  onCopyPath,
  onBackup,
  onRemove,
  onDelete,
  onRefreshStatuses,
}: EnvironmentTableProps) {
  const browserById = new Map(browsers.map((browser) => [browser.id, browser]));

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[880px] table-fixed border-collapse">
        <colgroup>
          <col />
          <col className="w-[108px]" />
          <col className="w-[136px]" />
          <col className="w-[92px]" />
          <col className="w-[126px]" />
          <col className="w-[180px]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-panel">
          <tr className="border-b border-line text-left">
            <th className="px-3 py-2 text-[10.5px] font-medium tracking-wide text-ink-subtle">
              环境
            </th>
            <th className="px-3 py-2 text-[10.5px] font-medium tracking-wide text-ink-subtle">
              状态
            </th>
            <th className="px-3 py-2 text-[10.5px] font-medium tracking-wide text-ink-subtle">
              浏览器
            </th>
            <th className="px-3 py-2 text-[10.5px] font-medium tracking-wide text-ink-subtle">
              占用空间
            </th>
            <th className="px-3 py-2 text-[10.5px] font-medium tracking-wide text-ink-subtle">
              最近启动
            </th>
            <th className="px-3 py-2 text-right text-[10.5px] font-medium tracking-wide text-ink-subtle">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <SystemDefaultRowComponent
            row={systemDefaultRow}
            loading={systemDefaultLoading}
            launching={systemDefaultLaunching}
            browser={browsers.find((b) => b.isDefault) ?? browsers[0]}
            measuredAt={systemDefaultRow ? undefined : undefined}
            onLaunch={onLaunchSystemDefault}
            onOpenDirectory={() => {
              if (systemDefaultRow) {
                onOpenDirectory({
                  id: "__system_default__",
                  name: "系统默认 Chrome",
                  description: null,
                  userDataDir: systemDefaultRow.userDataDir,
                  sourceType: "managed",
                  browserConfigId: browsers[0]?.id ?? "",
                  color: null,
                  icon: null,
                  createdAt: "",
                  updatedAt: "",
                  lastLaunchedAt: null,
                  lastStatus: systemDefaultRow.status,
                  isDefaultProfile: true,
                });
              }
            }}
            onCopyPath={() => {
              if (systemDefaultRow) {
                void navigator.clipboard.writeText(systemDefaultRow.userDataDir);
              }
            }}
            onRefreshStatuses={onRefreshSystemDefault}
            onOpenSettings={onOpenSettings}
          />
          {environments.map((environment) => (
            <EnvironmentRow
              key={environment.id}
              environment={environment}
              browser={browserById.get(environment.browserConfigId)}
              stats={stats[environment.id]}
              scanning={loadingIds.includes(environment.id)}
              launching={launchingId === environment.id}
              onLaunch={onLaunch}
              onEdit={onEdit}
              onOpenDirectory={onOpenDirectory}
              onCopyPath={onCopyPath}
              onBackup={onBackup}
              onRemove={onRemove}
              onDelete={onDelete}
              onRefreshStatuses={onRefreshStatuses}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
