import { FolderSync, Link2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { call, getErrorMessage } from "@/lib/ipc";
import type { SystemDefaultState } from "@/types/environment";

interface SystemDefaultCardProps {
  /** Called after a successful operation so the parent can refresh. */
  onChanged: () => void;
}

/**
 * Settings card for the system-default Chrome takeover.
 *
 * Model: chrome.exe is one engine; each user-data folder is a separate set of
 * user info. `env_default` permanently hosts the SYSTEM default Chrome (the
 * plain shortcut, other apps' links). There is no "switching" - env_default
 * is fixed after takeover; BrowserHub environments (env_*) are separate and
 * launched from the environments page, in parallel with the default Chrome.
 */
export function SystemDefaultCard({ onChanged }: SystemDefaultCardProps) {
  const { toast } = useToast();
  const [state, setState] = useState<SystemDefaultState | null>(null);
  const [busy, setBusy] = useState<"takeover" | "sync" | "restore" | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await call<SystemDefaultState>("get_system_default_state");
      setState(result);
      return result;
    } catch (cause) {
      toast({
        title: "无法读取系统默认 Chrome 状态",
        description: getErrorMessage(cause),
        variant: "error",
      });
      return null;
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleTakeOver = async () => {
    setBusy("takeover");
    try {
      const target = await call<string>("take_over_system_default");
      await refresh();
      onChanged();
      toast({
        title: "已托管系统默认 Chrome",
        description: `双击 Chrome 图标将使用 %LOCALAPPDATA% 下的受管目录（${target}）。`,
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "托管失败",
        description: getErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleSync = async () => {
    setBusy("sync");
    try {
      const [files, bytes] = await call<[number, number]>(
        "sync_system_default_profile",
      );
      await refresh();
      toast({
        title: "同步完成",
        description: `已复制 ${files} 个文件（${(bytes / 1024 / 1024).toFixed(1)} MB）到 env_default。`,
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "同步失败",
        description: getErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    setBusy("restore");
    try {
      await call("restore_system_default");
      await refresh();
      onChanged();
      toast({
        title: "已还原系统默认 Chrome",
        description: state?.originalBackupPath
          ? "原数据已从备份还原，联接已移除。"
          : "已还原为全新的默认 Chrome 数据。",
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "还原失败",
        description: getErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  if (!state) {
    return (
      <section>
        <div className="flex items-center gap-2 text-[12px] text-ink-muted">
          <Spinner className="h-3.5 w-3.5" label="读取系统默认 Chrome 状态" />
          正在读取系统默认 Chrome 状态…
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">系统默认 Chrome</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            将 Chrome 的默认用户数据目录托管到应用管理的 env_default
            目录：桌面图标、任务栏、其他程序打开的链接都使用这份独立数据，
            与下方环境列表完全并行。
          </p>
        </div>
        {state.isManaged ? (
          <Badge tone="accent">
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3 w-3" /> 已托管
            </span>
          </Badge>
        ) : (
          <Badge tone="neutral">未托管</Badge>
        )}
      </div>

      <div className="space-y-4 rounded-card border border-line bg-panel p-4 shadow-panel">
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-ink">
            Chrome 默认用户数据目录
          </p>
          <PathDisplay path="%LOCALAPPDATA%\Google\Chrome\User Data" />
          <p className="break-all font-mono text-[10.5px] leading-relaxed text-ink-subtle">
            {state.linkTarget ?? "（普通目录，尚未托管）"}
          </p>
          {state.originalBackupPath ? (
            <p className="text-[10.5px] leading-relaxed text-ink-subtle">
              原始数据备份：{state.originalBackupPath}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {state.isManaged ? (
            <>
              <Badge tone="accent">指向 env_default</Badge>
              <Button
                variant="secondary"
                size="sm"
                icon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.7} />}
                loading={busy === "restore"}
                disabled={busy !== null}
                onClick={() => void handleRestore()}
              >
                还原系统默认
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                size="sm"
                icon={<Link2 className="h-3.5 w-3.5" strokeWidth={1.7} />}
                loading={busy === "takeover"}
                disabled={busy !== null}
                onClick={() => void handleTakeOver()}
              >
                托管默认 Chrome
              </Button>
              {state.isOriginalRealDir ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FolderSync className="h-3.5 w-3.5" strokeWidth={1.7} />}
                  loading={busy === "sync"}
                  disabled={busy !== null}
                  onClick={() => void handleSync()}
                >
                  先同步现有数据到 env_default
                </Button>
              ) : null}
            </>
          )}
        </div>

        {state.defaultChromeRunning ? (
          <Notice tone="warning" title="默认 Chrome 正在运行">
            检测到不带环境参数的 Chrome 实例。托管/同步/还原操作前请先关闭它们。
          </Notice>
        ) : null}

        {state.isManaged ? (
          <Notice tone="info" title="托管后的工作方式">
            双击 Chrome 图标 = 打开 env_default（独立于环境列表）。环境列表中的
            env_* 环境可同时启动多个实例，互不影响。
          </Notice>
        ) : (
          <Notice tone="info" title="托管是可逆的">
            托管会将 Chrome 原生数据目录改名备份（.account0.bak）并建立指向
            env_default 的目录联接；“还原”一键恢复原状。可选先“同步现有数据”
            把登录状态和书签带入受管目录。
          </Notice>
        )}
      </div>
    </section>
  );
}
