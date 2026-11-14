import { FolderOpen, HardDrive, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { Spinner } from "@/components/ui/Spinner";
import { copyText } from "@/lib/clipboard";
import { call, getErrorMessage } from "@/lib/ipc";
import { formatBytes } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import type { StorageInfo } from "@/types/environment";
import type { AppSettings } from "@/types/settings";

interface StorageSettingsProps {
  settings: AppSettings;
  environmentCount: number;
  saving: boolean;
  onPatch: (patch: Partial<AppSettings>) => void;
}

export function StorageSettings({
  settings,
  environmentCount,
  saving,
  onPatch,
}: StorageSettingsProps) {
  const { toast } = useToast();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const root = settings.environmentRootDir;

  const loadInfo = useCallback(async () => {
    if (!root) {
      setInfo(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await call<StorageInfo>("get_storage_info", { path: root });
      setInfo(result);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  const chooseRoot = async () => {
    try {
      const selected = await call<string | null>("select_directory", {
        initialDir: root || null,
        title: "选择浏览器环境根目录",
      });
      if (selected && selected !== root) {
        onPatch({ environmentRootDir: selected });
        toast({
          title: "环境根目录已更新",
          description: "只影响以后新建的环境，已有环境的绝对路径不会改变。",
          variant: "success",
        });
      }
    } catch (cause) {
      toast({
        title: "无法选择目录",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  const openRoot = async () => {
    try {
      await call("open_directory", { path: root });
    } catch (cause) {
      toast({
        title: "无法打开环境根目录",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  const copyRoot = async () => {
    const copied = await copyText(root);
    toast({
      title: copied ? "路径已复制" : "复制失败",
      description: copied ? root : "请手动选择路径后复制。",
      variant: copied ? "success" : "error",
    });
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">浏览器环境根目录</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              BrowserHub 新建的环境默认创建在这里。
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={1.7} />}
            onClick={() => void loadInfo()}
            disabled={loading || !root}
          >
            刷新空间
          </Button>
        </div>

        <div className="space-y-4 rounded-card border border-line bg-panel p-4 shadow-panel">
          <PathDisplay
            path={root || null}
            placeholder="尚未设置环境根目录"
            onChange={() => void chooseRoot()}
            onOpen={root ? () => void openRoot() : undefined}
            onCopy={root ? () => void copyRoot() : undefined}
            changeLabel="更改根目录…"
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[7px] border border-line bg-panel-muted px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
                <HardDrive className="h-3.5 w-3.5" strokeWidth={1.7} />
                可用空间
              </div>
              <p className="tabular mt-1 text-[15px] font-semibold text-ink">
                {loading ? (
                  <Spinner className="h-3.5 w-3.5" label="读取空间" />
                ) : (
                  formatBytes(info?.availableBytes)
                )}
              </p>
            </div>
            <div className="rounded-[7px] border border-line bg-panel-muted px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
                <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.7} />
                环境数量
              </div>
              <p className="tabular mt-1 text-[15px] font-semibold text-ink">
                {environmentCount}
              </p>
            </div>
            <div className="rounded-[7px] border border-line bg-panel-muted px-3 py-2.5">
              <div className="text-[10.5px] text-ink-subtle">目录状态</div>
              <p className="mt-1 text-[13px] font-medium text-ink">
                {loading ? (
                  <Spinner className="h-3.5 w-3.5" label="检查目录" />
                ) : info?.accessible ? (
                  <span className="text-success">可访问</span>
                ) : (
                  <span className="text-danger">不可访问</span>
                )}
              </p>
            </div>
          </div>

          {error ? <Notice tone="danger">{error}</Notice> : null}

          {!loading && info && !info.accessible && root ? (
            <Notice tone="danger" title="环境根目录不可访问">
              磁盘可能已断开，或当前用户没有访问权限。已有环境仍使用各自保存的绝对路径，
              但新建环境前请选择一个可用目录。
            </Notice>
          ) : null}

          <Notice tone="info" title="修改根目录不会移动已有环境">
            BrowserHub 为每个环境单独保存完整绝对路径。修改根目录只影响未来新建的环境，
            导入的环境可以位于任意磁盘。
          </Notice>

          <div className="flex items-center justify-between gap-4 text-[10.5px] text-ink-subtle">
            <span>总容量：{formatBytes(info?.totalBytes)}</span>
            <span>{saving ? "正在保存设置…" : "设置会自动保存"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
