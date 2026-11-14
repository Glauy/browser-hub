import {
  CheckCircle2,
  Chrome,
  CircleAlert,
  FolderOpen,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { call, getErrorMessage } from "@/lib/ipc";
import type { BrowserConfig, DetectedChrome } from "@/types/browser";

interface BrowserSettingsProps {
  browsers: BrowserConfig[];
  defaultBrowser: BrowserConfig | null;
  onBootstrapReload: () => Promise<void>;
}

export function BrowserSettings({
  browsers,
  defaultBrowser,
  onBootstrapReload,
}: BrowserSettingsProps) {
  const { toast } = useToast();
  const [detected, setDetected] = useState<DetectedChrome[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [busyBrowserId, setBusyBrowserId] = useState<string | null>(null);

  const detect = useCallback(async () => {
    setDetecting(true);
    setError(null);
    try {
      const result = await call<DetectedChrome[]>("detect_chrome");
      setDetected(result);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  const addBrowser = async (path: string) => {
    setBusyPath(path);
    setError(null);
    try {
      await call<BrowserConfig>("create_browser_config", {
        input: { executablePath: path },
      });
      toast({
        title: "Chrome 安装已添加",
        description: path,
        variant: "success",
      });
      await onBootstrapReload();
      await detect();
    } catch (cause) {
      toast({
        title: "无法添加 Chrome",
        description: getErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setBusyPath(null);
    }
  };

  const chooseManual = async () => {
    try {
      const selected = await call<string | null>("select_executable", {
        title: "选择 Chrome 可执行文件",
      });
      if (selected) {
        await addBrowser(selected);
      }
    } catch (cause) {
      toast({
        title: "无法选择 Chrome",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  const makeDefault = async (browser: BrowserConfig) => {
    setBusyBrowserId(browser.id);
    try {
      await call<BrowserConfig>("update_browser_config", {
        input: { id: browser.id, isDefault: true },
      });
      await onBootstrapReload();
      toast({
        title: "默认浏览器已更新",
        description: browser.name,
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "无法设为默认",
        description: getErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setBusyBrowserId(null);
    }
  };

  const removeBrowser = async (browser: BrowserConfig) => {
    setBusyBrowserId(browser.id);
    try {
      await call("delete_browser_config", { browserConfigId: browser.id });
      await onBootstrapReload();
      toast({
        title: "已删除 Chrome 配置",
        description: browser.executablePath,
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "无法删除 Chrome 配置",
        description: getErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setBusyBrowserId(null);
    }
  };

  const openExecutable = async (path: string) => {
    try {
      await call("open_directory", { path });
    } catch (cause) {
      toast({
        title: "无法打开安装位置",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  const configuredPaths = new Set(
    browsers.map((browser) => browser.executablePath.toLocaleLowerCase()),
  );
  const extraDetected = detected.filter(
    (item) => !configuredPaths.has(item.executablePath.toLocaleLowerCase()),
  );

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">默认浏览器</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              新建环境与启动时默认使用这个 Chrome 安装。
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className={`h-3.5 w-3.5 ${detecting ? "animate-spin" : ""}`} strokeWidth={1.7} />}
              onClick={() => void detect()}
              disabled={detecting}
            >
              重新检测
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<FolderOpen className="h-3.5 w-3.5" strokeWidth={1.7} />}
              onClick={() => void chooseManual()}
            >
              手动选择
            </Button>
          </div>
        </div>

        <div className="rounded-card border border-line bg-panel p-4 shadow-panel">
          {defaultBrowser ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-line bg-panel-muted">
                  <Chrome className="h-[18px] w-[18px] text-accent" strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-ink">{defaultBrowser.name}</p>
                    <Badge tone="accent">默认</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-subtle">
                    {defaultBrowser.version
                      ? `版本 ${defaultBrowser.version}`
                      : "版本信息不可用"}
                  </p>
                </div>
              </div>
              <PathDisplay
                path={defaultBrowser.executablePath}
                onOpen={() => void openExecutable(defaultBrowser.executablePath)}
              />
            </div>
          ) : (
            <Notice tone="warning" title="尚未配置 Chrome">
              新建环境需要 Chrome。点击“手动选择”指定 chrome.exe，或重新检测本机安装。
            </Notice>
          )}
        </div>
      </section>

      <section>
        <div className="mb-2">
          <h2 className="text-[14px] font-semibold text-ink">已配置的 Chrome 安装</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            可以登记多个安装位置，但同一个环境始终只使用一个 Chrome。
          </p>
        </div>

        <div className="overflow-hidden rounded-card border border-line bg-panel shadow-panel">
          {browsers.length === 0 ? (
            <p className="px-4 py-5 text-[12px] text-ink-muted">
              还没有可用的 Chrome 配置。
            </p>
          ) : (
            browsers.map((browser) => (
              <div
                key={browser.id}
                className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0"
              >
                <Chrome
                  className={`h-4 w-4 shrink-0 ${browser.isDefault ? "text-accent" : "text-ink-subtle"}`}
                  strokeWidth={1.7}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[12.5px] font-medium text-ink">
                      {browser.name}
                    </p>
                    {browser.isDefault ? <Badge tone="accent">默认</Badge> : null}
                  </div>
                  <p
                    className="mt-0.5 truncate font-mono text-[10.5px] text-ink-subtle"
                    title={browser.executablePath}
                  >
                    {browser.executablePath}
                  </p>
                </div>
                <p className="hidden shrink-0 text-[11px] text-ink-subtle sm:block">
                  {browser.version ?? "版本未知"}
                </p>
                {browser.isDefault ? (
                  <span className="flex h-7 w-[70px] items-center justify-center text-[11px] text-ink-subtle">
                    当前默认
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={busyBrowserId === browser.id}
                    icon={<Star className="h-3.5 w-3.5" strokeWidth={1.7} />}
                    onClick={() => void makeDefault(browser)}
                  >
                    设为默认
                  </Button>
                )}
                <IconButton
                  label="删除此 Chrome 配置"
                  variant="dangerGhost"
                  size="sm"
                  disabled={busyBrowserId === browser.id || browsers.length <= 1}
                  onClick={() => void removeBrowser(browser)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                </IconButton>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">自动检测结果</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              检测常见安装目录、用户目录和 Windows 注册表。
            </p>
          </div>
          {detecting ? <Spinner label="正在检测 Chrome" /> : null}
        </div>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        {!detecting && extraDetected.length > 0 ? (
          <div className="overflow-hidden rounded-card border border-line bg-panel shadow-panel">
            {extraDetected.map((item) => (
              <div
                key={item.executablePath}
                className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={1.7} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-ink">
                    {item.version ? `Chrome ${item.version}` : "Google Chrome"}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10.5px] text-ink-subtle">
                    {item.executablePath}
                  </p>
                </div>
                <Badge tone="neutral">{item.source}</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busyPath === item.executablePath}
                  icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.8} />}
                  onClick={() => void addBrowser(item.executablePath)}
                >
                  添加
                </Button>
              </div>
            ))}
          </div>
        ) : !detecting ? (
          <div className="flex items-center gap-2 rounded-card border border-line bg-panel-muted px-4 py-3 text-[11.5px] text-ink-muted">
            <CircleAlert className="h-4 w-4 shrink-0 text-ink-subtle" strokeWidth={1.7} />
            {browsers.length > 0
              ? "没有发现其他未登记的 Chrome 安装。"
              : "未发现 Chrome。请确认已安装 Google Chrome，或手动选择 chrome.exe。"}
          </div>
        ) : null}
      </section>
    </div>
  );
}
