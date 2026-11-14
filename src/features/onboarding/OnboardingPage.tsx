import {
  CheckCircle2,
  Chrome,
  FolderOpen,
  Loader2,
  RefreshCw,
  ShieldCheck,
  FolderTree,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TitleBar } from "@/components/layout/TitleBar";
import { Badge } from "@/components/ui/Badge";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { call, getErrorMessage } from "@/lib/ipc";
import { cn } from "@/lib/cn";
import type { DetectedChrome } from "@/types/browser";
import type { BootstrapState } from "@/types/settings";

interface OnboardingPageProps {
  bootstrap: BootstrapState;
  onCompleted: () => Promise<void>;
}

export function OnboardingPage({ bootstrap, onCompleted }: OnboardingPageProps) {
  const recommended = bootstrap.recommendedRoots;
  const initialRoot =
    recommended.find((root) => root.recommended && root.available)?.path ??
    recommended.find((root) => root.available)?.path ??
    bootstrap.settings.environmentRootDir ??
    "";

  const [root, setRoot] = useState(initialRoot);
  const [customRoot, setCustomRoot] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedChrome[]>([]);
  const [detecting, setDetecting] = useState(true);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [chromePath, setChromePath] = useState<string | null>(
    bootstrap.defaultBrowser?.executablePath ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detect = useCallback(async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const result = await call<DetectedChrome[]>("detect_chrome");
      setDetected(result);
      setChromePath((current) => current ?? result[0]?.executablePath ?? null);
    } catch (cause) {
      setDetectError(getErrorMessage(cause));
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  const chooseRoot = async () => {
    try {
      const selected = await call<string | null>("select_directory", {
        initialDir: root || null,
        title: "选择浏览器环境根目录",
      });
      if (selected) {
        setCustomRoot(selected);
        setRoot(selected);
      }
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const chooseChrome = async () => {
    try {
      const selected = await call<string | null>("select_executable", {
        title: "选择 Chrome 可执行文件",
      });
      if (selected) {
        setChromePath(selected);
      }
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const finish = async () => {
    if (!root.trim()) {
      setError("请先选择浏览器环境根目录。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await call("complete_setup", {
        environmentRootDir: root.trim(),
        backupRootDir: `${root.trim().replace(/[\\/]+$/, "")}\\backups`,
        chromeExecutablePath: chromePath,
      });
      await onCompleted();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const customOption = customRoot && !recommended.some((item) => item.path === customRoot);
  const hasChrome = chromePath !== null;

  return (
    <div className="flex h-full flex-col bg-canvas">
      <TitleBar />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-8">
          <div className="mx-auto w-full max-w-[720px]">
          <header className="flex items-start gap-4">
            <BrandMark size={38} />
            <div>
              <p className="text-[10.5px] font-medium tracking-[0.08em] text-accent-ink">
                首次设置
              </p>
              <h1 className="mt-1 text-[24px] font-semibold leading-8 tracking-[-0.02em] text-ink">
                开始使用 BrowserHub
              </h1>
              <p className="mt-1.5 max-w-[540px] text-[12.5px] leading-relaxed text-ink-muted">
                一个环境对应一个独立的 Chrome 用户数据目录。登录状态、扩展和浏览数据互不影响，
                无需再编写启动脚本。
              </p>
            </div>
          </header>

          <div className="mt-6 space-y-4">
            <section className="rounded-card border border-line bg-panel shadow-panel">
              <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-panel-muted text-[10.5px] font-semibold text-ink-muted">
                  1
                </span>
                <div>
                  <h2 className="text-[13px] font-semibold text-ink">选择环境存放位置</h2>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                    BrowserHub 建议将大型浏览器数据放在非系统盘。该位置只影响新建环境。
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 px-5 py-4">
                {recommended.map((option) => {
                  const selected = !customRoot && root === option.path;
                  return (
                    <button
                      key={option.path}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!option.available}
                      onClick={() => {
                        setCustomRoot(null);
                        setRoot(option.path);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[8px] border px-3 py-2.5 text-left transition-colors",
                        selected
                          ? "border-accent/50 bg-accent-soft/50"
                          : "border-line bg-panel hover:border-line-strong",
                        !option.available && "opacity-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          selected
                            ? "border-accent bg-accent text-accent-contrast"
                            : "border-line-strong bg-panel",
                        )}
                      >
                        {selected ? (
                          <CheckCircle2 className="h-3 w-3" strokeWidth={2.6} />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[12px] font-medium text-ink">
                            {option.label}
                          </span>
                          {option.recommended ? <Badge tone="accent">推荐</Badge> : null}
                          {!option.available ? (
                            <Badge tone="warning">不可用</Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-subtle">
                          {option.path}
                        </span>
                      </span>
                    </button>
                  );
                })}

                {customOption ? (
                  <div className="rounded-[8px] border border-accent/40 bg-accent-soft/40 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-accent" strokeWidth={2} />
                      <span className="text-[12px] font-medium text-ink">自定义位置</span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[10.5px] text-ink-muted">
                      {customRoot}
                    </p>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<FolderTree className="h-3.5 w-3.5" strokeWidth={1.7} />}
                    onClick={() => void chooseRoot()}
                  >
                    选择其他目录…
                  </Button>
                  <span className="text-[10.5px] text-ink-subtle">
                    备份默认保存到 <span className="font-mono">{root || "…"}\backups</span>
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-card border border-line bg-panel shadow-panel">
              <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-panel-muted text-[10.5px] font-semibold text-ink-muted">
                  2
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[13px] font-semibold text-ink">配置 Chrome</h2>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                    BrowserHub 使用本机已安装的 Google Chrome，不需要额外下载浏览器内核。
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw className={`h-3.5 w-3.5 ${detecting ? "animate-spin" : ""}`} strokeWidth={1.7} />}
                  onClick={() => void detect()}
                  disabled={detecting}
                >
                  重新检测
                </Button>
              </div>

              <div className="space-y-3 px-5 py-4">
                {detecting ? (
                  <div className="flex items-center gap-2 text-[12px] text-ink-muted">
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
                    正在检查本机 Chrome 安装…
                  </div>
                ) : hasChrome ? (
                  <div className="rounded-[8px] border border-success/25 bg-success-soft/50 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={2} />
                      <span className="text-[12px] font-medium text-ink">已找到 Chrome</span>
                    </div>
                    <p className="mt-1 break-all font-mono text-[10.5px] text-ink-muted">
                      {chromePath}
                    </p>
                  </div>
                ) : (
                  <Notice tone="warning" title="未自动检测到 Chrome">
                    你可以手动指定 chrome.exe，或先完成设置，稍后在“设置 → 浏览器”中配置。
                  </Notice>
                )}

                {detected.length > 1 ? (
                  <Field label="检测到的安装">
                    <div className="space-y-1.5">
                      {detected.map((item) => (
                        <button
                          key={item.executablePath}
                          type="button"
                          onClick={() => setChromePath(item.executablePath)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-[7px] border px-2.5 py-2 text-left transition-colors",
                            chromePath === item.executablePath
                              ? "border-accent/50 bg-accent-soft/40"
                              : "border-line hover:border-line-strong",
                          )}
                        >
                          <Chrome className="h-3.5 w-3.5 shrink-0 text-ink-subtle" strokeWidth={1.7} />
                          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-muted">
                            {item.executablePath}
                          </span>
                          {item.version ? (
                            <span className="shrink-0 text-[10px] text-ink-subtle">
                              {item.version}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </Field>
                ) : null}

                {detectError ? <Notice tone="danger">{detectError}</Notice> : null}

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<FolderOpen className="h-3.5 w-3.5" strokeWidth={1.7} />}
                    onClick={() => void chooseChrome()}
                  >
                    手动选择 chrome.exe…
                  </Button>
                  {hasChrome ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setChromePath(null)}
                    >
                      稍后配置
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>

            {error ? <Notice tone="danger">{error}</Notice> : null}

            <Notice tone="info" title="你的浏览器数据只保存在本机">
              SQLite 仅保存环境名称、绝对路径和配置。BrowserHub 不读取 Cookies 或密码，
              不上传任何浏览数据，也不会在未确认的情况下删除真实目录。
            </Notice>
          </div>

          </div>
        </div>

        <footer className="shrink-0 border-t border-line bg-surface px-6 py-3">
          <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.7} />
              关闭 BrowserHub 不影响正在运行的 Chrome
            </span>
            <div className="flex items-center gap-4">
              <span className="text-[10px] text-ink-subtle">
                BrowserHub {bootstrap.appVersion}
              </span>
              <Button
                variant="primary"
                size="lg"
                loading={submitting}
                disabled={!root.trim() || detecting}
                onClick={() => void finish()}
              >
                完成设置
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
