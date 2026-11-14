import { Archive, FolderOpen, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { copyText } from "@/lib/clipboard";
import { call, getErrorMessage } from "@/lib/ipc";
import { useToast } from "@/components/ui/Toast";
import type { AppSettings } from "@/types/settings";

interface BackupSettingsProps {
  settings: AppSettings;
  backupCount: number;
  saving: boolean;
  onPatch: (patch: Partial<AppSettings>) => void;
  onOpenBackups: () => void;
}

export function BackupSettings({
  settings,
  backupCount,
  saving,
  onPatch,
  onOpenBackups,
}: BackupSettingsProps) {
  const { toast } = useToast();
  const effectiveRoot = settings.backupRootDir ?? `${settings.environmentRootDir}\\backups`;

  const chooseRoot = async () => {
    try {
      const selected = await call<string | null>("select_directory", {
        initialDir: effectiveRoot || null,
        title: "选择默认备份目录",
      });
      if (selected && selected !== settings.backupRootDir) {
        onPatch({ backupRootDir: selected });
        toast({
          title: "默认备份目录已更新",
          description: "只影响以后创建的备份，已有备份不会被移动。",
          variant: "success",
        });
      }
    } catch (cause) {
      toast({
        title: "无法选择备份目录",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  const resetRoot = () => {
    if (!settings.environmentRootDir) {
      return;
    }
    onPatch({ backupRootDir: `${settings.environmentRootDir}\\backups` });
    toast({
      title: "已恢复默认备份位置",
      variant: "success",
    });
  };

  const openRoot = async () => {
    try {
      await call("open_directory", { path: effectiveRoot });
    } catch (cause) {
      toast({
        title: "无法打开备份目录",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  const copyRoot = async () => {
    const copied = await copyText(effectiveRoot);
    toast({
      title: copied ? "路径已复制" : "复制失败",
      description: copied ? effectiveRoot : "请手动选择路径后复制。",
      variant: copied ? "success" : "error",
    });
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">默认备份目录</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              新备份会创建在这个位置。已有备份保留原路径。
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.7} />}
            onClick={resetRoot}
            disabled={saving || !settings.environmentRootDir}
          >
            恢复默认
          </Button>
        </div>

        <div className="space-y-4 rounded-card border border-line bg-panel p-4 shadow-panel">
          <PathDisplay
            path={effectiveRoot || null}
            placeholder="尚未设置备份目录"
            onChange={() => void chooseRoot()}
            onOpen={() => void openRoot()}
            onCopy={() => void copyRoot()}
            changeLabel="更改目录…"
          />

          <div className="flex items-center justify-between gap-4 rounded-[7px] border border-line bg-panel-muted px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-ink-subtle" strokeWidth={1.7} />
              <div>
                <p className="text-[12px] font-medium text-ink">{backupCount} 份备份</p>
                <p className="text-[10.5px] text-ink-subtle">
                  完整目录副本，包含环境中的浏览数据
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={onOpenBackups}>
              管理备份
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4 text-[10.5px] text-ink-subtle">
            <span>默认：环境根目录下的 backups 文件夹</span>
            <span className="flex items-center gap-1">
              <FolderOpen className="h-3 w-3" />
              {saving ? "正在保存…" : "自动保存"}
            </span>
          </div>
        </div>
      </section>

      <Notice tone="warning" title="备份前必须完全退出对应环境的 Chrome">
        浏览器运行时，Cookies、历史记录等数据库仍在写入。BrowserHub 会拒绝在“运行中”
        或“状态未知”时备份，避免产生不一致的副本。
      </Notice>

      <Notice tone="info" title="备份内容属于敏感本地数据">
        备份包含登录状态和 Cookies。请使用可信磁盘，不要让备份目录同步到公共云盘。
      </Notice>
    </div>
  );
}
