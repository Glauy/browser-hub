import {
  Archive,
  ChevronRight,
  FolderOpen,
  Globe2,
  PanelsTopLeft,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AppSettings } from "@/types/settings";
import type { BrowserConfig } from "@/types/browser";
import type { AppView } from "@/app/navigation";

interface SidebarProps {
  activeView: AppView;
  environmentCount: number;
  runningCount: number;
  backupCount: number;
  settings: AppSettings;
  defaultBrowser: BrowserConfig | null;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onOpenDataDirectory: () => void;
}

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

function NavItem({ icon: Icon, label, active, count, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[32px] w-full items-center gap-2.5 rounded-[6px] border px-2.5 text-left text-[12.5px] transition-colors duration-100",
        active
          ? "border-line bg-panel font-medium text-ink shadow-panel"
          : "border-transparent text-ink-muted hover:bg-panel/70 hover:text-ink",
      )}
    >
      <Icon
        className={cn("h-[15px] w-[15px]", active ? "text-accent" : "text-ink-subtle")}
        strokeWidth={1.7}
      />
      <span className="flex-1 truncate">{label}</span>
      {count != null && count > 0 ? (
        <span
          className={cn(
            "tabular rounded-[4px] px-1 py-[1px] text-[10px] leading-4",
            active
              ? "bg-accent-soft text-accent-ink"
              : "text-ink-subtle",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pb-1.5 pt-0.5 text-[10px] font-medium tracking-[0.06em] text-ink-subtle">
      {children}
    </p>
  );
}

export function Sidebar({
  activeView,
  environmentCount,
  runningCount,
  backupCount,
  settings,
  defaultBrowser,
  onNavigate,
  onOpenSettings,
  onOpenDataDirectory,
}: SidebarProps) {
  return (
    <aside className="flex w-[214px] shrink-0 flex-col border-r border-line bg-surface">
      <nav className="space-y-0.5 px-2.5 pt-4" aria-label="主导航">
        <SectionLabel>工作台</SectionLabel>
        <NavItem
          icon={PanelsTopLeft}
          label="浏览器环境"
          active={activeView === "environments"}
          count={environmentCount}
          onClick={() => onNavigate("environments")}
        />
        <NavItem
          icon={Archive}
          label="备份"
          active={activeView === "backups"}
          count={backupCount}
          onClick={() => onNavigate("backups")}
        />
      </nav>

      <div className="mt-auto space-y-2 px-2.5 pb-2.5">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full rounded-card border border-line bg-panel p-2.5 text-left shadow-panel transition-colors hover:border-line-strong"
          title={defaultBrowser ? defaultBrowser.executablePath : "打开浏览器设置"}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-panel-muted">
              <Globe2
                className={cn(
                  "h-[15px] w-[15px]",
                  defaultBrowser ? "text-accent" : "text-warning",
                )}
                strokeWidth={1.7}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-medium text-ink">
                {defaultBrowser?.name ?? "Chrome 未配置"}
              </span>
              <span className="block truncate text-[10px] text-ink-subtle">
                {defaultBrowser?.version
                  ? `版本 ${defaultBrowser.version}`
                  : "前往设置选择 Chrome"}
              </span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenDataDirectory}
          title={settings.environmentRootDir || "尚未设置数据目录"}
          className="flex w-full items-start gap-1.5 rounded-[5px] px-1.5 py-1 text-left text-[10.5px] text-ink-subtle transition-colors hover:text-ink"
        >
          <FolderOpen className="mt-[1px] h-3 w-3 shrink-0" strokeWidth={1.7} />
          <span className="min-w-0 flex-1 truncate font-mono">
            {settings.environmentRootDir || "尚未设置数据目录"}
          </span>
        </button>
      </div>

      <div className="border-t border-line px-2.5 py-2">
        <NavItem
          icon={Settings2}
          label="设置"
          active={activeView === "settings"}
          onClick={onOpenSettings}
        />
        <p className="px-2.5 pt-1.5 text-[10px] text-ink-subtle">
          {runningCount > 0 ? `${runningCount} 个环境正在运行` : "所有环境均已停止"}
        </p>
      </div>
    </aside>
  );
}
