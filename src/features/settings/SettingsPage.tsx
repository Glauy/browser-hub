import {
  Archive,
  Globe2,
  HardDrive,
  MonitorCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Spinner";
import { call, getErrorMessage } from "@/lib/ipc";
import { cn } from "@/lib/cn";
import type { AppView, SettingsSection } from "@/app/navigation";
import type { BrowserConfig } from "@/types/browser";
import type { AppSettings } from "@/types/settings";
import { ApplicationSettings } from "./components/ApplicationSettings";
import { BackupSettings } from "./components/BackupSettings";
import { BrowserSettings } from "./components/BrowserSettings";
import { StorageSettings } from "./components/StorageSettings";

interface SettingsPageProps {
  settings: AppSettings;
  browsers: BrowserConfig[];
  defaultBrowser: BrowserConfig | null;
  appDataDir: string;
  installDir: string | null;
  appVersion: string;
  environmentCount: number;
  backupCount: number;
  onEnvironmentsChanged: () => void;
  onSettingsUpdated: (settings: AppSettings) => void;
  onBootstrapReload: () => Promise<void>;
  onNavigate: (view: AppView) => void;
}

const SECTIONS: Array<{
  value: SettingsSection;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "browser", label: "浏览器", description: "Chrome 安装", icon: Globe2 },
  { value: "storage", label: "存储", description: "环境根目录", icon: HardDrive },
  { value: "application", label: "应用", description: "窗口与启动", icon: MonitorCog },
  { value: "backup", label: "备份", description: "默认位置", icon: Archive },
];

export function SettingsPage({
  settings,
  browsers,
  defaultBrowser,
  appDataDir,
  installDir,
  appVersion,
  environmentCount,
  backupCount,
  onEnvironmentsChanged,
  onSettingsUpdated,
  onBootstrapReload,
  onNavigate,
}: SettingsPageProps) {
  const { toast } = useToast();
  const [section, setSection] = useState<SettingsSection>("browser");
  const [saving, setSaving] = useState(false);
  const latestRef = useRef(settings);
  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    latestRef.current = settings;
  }, [settings]);

  const patchSettings = (patch: Partial<AppSettings>) => {
    pendingRef.current += 1;
    setSaving(true);
    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const next = { ...latestRef.current, ...patch };
          const updated = await call<AppSettings>("update_app_settings", {
            settings: next,
          });
          latestRef.current = updated;
          onSettingsUpdated(updated);
        } catch (cause) {
          toast({
            title: "设置保存失败",
            description: getErrorMessage(cause),
            variant: "error",
          });
        } finally {
          pendingRef.current -= 1;
          if (pendingRef.current === 0) {
            setSaving(false);
          }
        }
      });
  };

  const activeSection = SECTIONS.find((item) => item.value === section) ?? SECTIONS[0];

  return (
    <>
      <PageHeader
        title="设置"
        description="管理 Chrome 安装、存储位置、桌面行为和备份。"
        actions={
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
            {saving ? (
              <>
                <Spinner className="h-3 w-3" label="正在保存" />
                正在保存…
              </>
            ) : (
              "所有更改已自动保存"
            )}
          </span>
        }
      />

      <div className="flex min-h-0 flex-1 gap-6 px-6 pb-5 pt-1">
        <nav className="w-[168px] shrink-0" aria-label="设置分区">
          <div className="space-y-0.5">
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              const active = item.value === section;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSection(item.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[6px] border px-2.5 py-2 text-left transition-colors",
                    active
                      ? "border-line bg-panel text-ink shadow-panel"
                      : "border-transparent text-ink-muted hover:bg-panel/70 hover:text-ink",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[15px] w-[15px] shrink-0",
                      active ? "text-accent" : "text-ink-subtle",
                    )}
                    strokeWidth={1.7}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium">{item.label}</span>
                    <span className="block truncate text-[10px] text-ink-subtle">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 border-t border-line pt-3 text-[10px] leading-relaxed text-ink-subtle">
            <p className="px-1">BrowserHub {appVersion}</p>
            <p className="mt-1 px-1">Chrome 环境管理器 · 本地优先</p>
          </div>
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto pb-4 pr-1">
          <div className="max-w-[760px]">
            <div className="mb-4 border-b border-line pb-3">
              <h2 className="text-[15px] font-semibold text-ink">{activeSection.label}设置</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {activeSection.value === "browser"
                  ? "指定 Chrome 可执行文件并管理多个本机安装。"
                  : activeSection.value === "storage"
                    ? "控制新建环境的默认位置，不影响已有环境。"
                    : activeSection.value === "application"
                      ? "调整关闭行为、托盘和开机启动。"
                      : "设置备份位置并管理目录副本。"}
              </p>
            </div>

            {section === "browser" ? (
              <BrowserSettings
                browsers={browsers}
                defaultBrowser={defaultBrowser}
                onBootstrapReload={onBootstrapReload}
              />
            ) : null}

            {section === "storage" ? (
              <StorageSettings
                settings={settings}
                environmentCount={environmentCount}
                saving={saving}
                onPatch={patchSettings}
              />
            ) : null}

            {section === "application" ? (
              <ApplicationSettings
                settings={settings}
                saving={saving}
                appDataDir={appDataDir}
                installDir={installDir}
                appVersion={appVersion}
                onEnvironmentsChanged={onEnvironmentsChanged}
                onPatch={patchSettings}
              />
            ) : null}

            {section === "backup" ? (
              <BackupSettings
                settings={settings}
                backupCount={backupCount}
                saving={saving}
                onPatch={patchSettings}
                onOpenBackups={() => onNavigate("backups")}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
