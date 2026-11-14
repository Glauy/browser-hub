import { Badge } from "@/components/ui/Badge";
import { Check, FolderOpen, LogOut, MinusSquare } from "lucide-react";
import { SystemDefaultCard } from "./SystemDefaultCard";
import { IconButton } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { call, getErrorMessage } from "@/lib/ipc";
import { cn } from "@/lib/cn";
import type { AppSettings, CloseBehavior } from "@/types/settings";

interface ApplicationSettingsProps {
  settings: AppSettings;
  saving: boolean;
  appDataDir: string;
  installDir: string | null;
  appVersion: string;
  onEnvironmentsChanged: () => void;
  onPatch: (patch: Partial<AppSettings>) => void;
}

const CLOSE_OPTIONS: Array<{
  value: CloseBehavior;
  title: string;
  description: string;
  icon: typeof LogOut;
}> = [
  {
    value: "minimize",
    title: "关闭时隐藏到托盘（推荐）",
    description:
      "关闭和最小化都会隐藏窗口，任务栏不保留图标；从托盘图标左键单击恢复。已启动的 Chrome 继续运行。",
    icon: MinusSquare,
  },
  {
    value: "exit",
    title: "关闭时退出 BrowserHub",
    description:
      "关闭主窗口即退出管理器（任务栏和托盘图标一并消失）。已启动的 Chrome 会继续运行。",
    icon: LogOut,
  },
];

export function ApplicationSettings({
  settings,
  saving,
  appDataDir,
  installDir,
  appVersion,
  onEnvironmentsChanged,
  onPatch,
}: ApplicationSettingsProps) {
  const { toast } = useToast();

  const openAppData = async () => {
    try {
      await call("open_directory", { path: appDataDir });
    } catch (cause) {
      toast({
        title: "无法打开应用数据目录",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  const openInstallDir = async () => {
    if (!installDir) {
      return;
    }
    try {
      await call("open_directory", { path: installDir });
    } catch (cause) {
      toast({
        title: "无法打开安装目录",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-6">
      <SystemDefaultCard onChanged={onEnvironmentsChanged} />

      <section>
        <div className="mb-2">
          <h2 className="text-[14px] font-semibold text-ink">关闭窗口时</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            无论选择哪一种，都不会结束正在运行的 Chrome 进程。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {CLOSE_OPTIONS.map((option) => {
            const selected = settings.closeBehavior === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={saving}
                onClick={() => onPatch({ closeBehavior: option.value })}
                className={cn(
                  "relative rounded-card border p-3.5 text-left transition-colors",
                  selected
                    ? "border-accent/50 bg-accent-soft/50"
                    : "border-line bg-panel hover:border-line-strong",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon
                    className={cn(
                      "mt-[1px] h-4 w-4 shrink-0",
                      selected ? "text-accent" : "text-ink-subtle",
                    )}
                    strokeWidth={1.7}
                  />
                  <div>
                    <p className="text-[12.5px] font-medium text-ink">{option.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                      {option.description}
                    </p>
                  </div>
                </div>
                {selected ? (
                  <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-contrast">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2">
          <h2 className="text-[14px] font-semibold text-ink">窗口与启动</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            这些设置会立即保存，并在下次启动时继续生效。
          </p>
        </div>

        <div className="divide-y divide-line rounded-card border border-line bg-panel shadow-panel">
          <div className="flex items-center justify-between gap-6 px-4 py-3">
            <div>
              <p className="text-[12.5px] font-medium text-ink">开机时启动 BrowserHub</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                登录 Windows 后自动启动管理器。不会自动启动任何 Chrome 环境。
              </p>
            </div>
            <Switch
              label="开机时启动 BrowserHub"
              checked={settings.launchOnStartup}
              disabled={saving}
              onCheckedChange={(checked) => onPatch({ launchOnStartup: checked })}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2">
          <h2 className="text-[14px] font-semibold text-ink">安装位置与应用数据</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            程序与数据分开存放。两个路径由系统决定，不能在应用内修改。
          </p>
        </div>

        <div className="space-y-4 rounded-card border border-line bg-panel p-4 shadow-panel">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11.5px] text-ink-muted">
                <FolderOpen className="h-3.5 w-3.5 text-ink-subtle" strokeWidth={1.7} />
                安装目录
                <Badge tone="neutral">只读</Badge>
              </div>
              {installDir ? (
                <IconButton
                  label="打开安装目录"
                  size="sm"
                  onClick={() => void openInstallDir()}
                >
                  <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.7} />
                </IconButton>
              ) : null}
            </div>
            {installDir ? (
              <PathDisplay path={installDir} />
            ) : (
              <p className="text-[11px] text-ink-subtle">
                未通过安装包安装（便携运行），无安装目录记录。
              </p>
            )}
            <p className="text-[10.5px] leading-relaxed text-ink-subtle">
              程序文件所在位置，含卸载器。由安装包写入注册表，应用内不可修改。
            </p>
          </div>

          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11.5px] text-ink-muted">
                <FolderOpen className="h-3.5 w-3.5 text-ink-subtle" strokeWidth={1.7} />
                应用数据目录
                <Badge tone="neutral">只读</Badge>
              </div>
              <IconButton label="打开应用数据目录" size="sm" onClick={() => void openAppData()}>
                <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.7} />
              </IconButton>
            </div>
            <PathDisplay path={appDataDir} />
            <p className="text-[10.5px] leading-relaxed text-ink-subtle">
              元数据、配置和诊断日志所在位置。只保存管理信息，不包含浏览器 Cookies 或密码；
              浏览器数据在各自环境的 User Data Directory 中。
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3 text-[10.5px] text-ink-subtle">
            <span>BrowserHub {appVersion}</span>
            <span>SQLite 元数据 · 本地日志</span>
          </div>
        </div>
      </section>

      <Notice tone="info" title="Chrome 不受 BrowserHub 生命周期影响">
        退出或关闭 BrowserHub 不会结束任何 Chrome 进程。只有你手动关闭 Chrome 窗口，
        对应环境才会变为“已停止”。
      </Notice>
    </div>
  );
}
