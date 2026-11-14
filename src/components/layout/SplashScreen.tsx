import type { ReactNode } from "react";
import { TitleBar } from "@/components/layout/TitleBar";

export function SplashScreen() {
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-ink-muted">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p className="text-[12px]">正在加载 BrowserHub…</p>
        </div>
      </div>
    </div>
  );
}

interface FatalScreenProps {
  title?: string;
  message: string;
  action?: ReactNode;
}

export function FatalScreen({
  title = "BrowserHub 无法启动",
  message,
  action,
}: FatalScreenProps) {
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-[420px] rounded-card border border-line bg-panel p-6 shadow-panel">
          <h1 className="text-[15px] font-semibold text-ink">{title}</h1>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">{message}</p>
          {action ? <div className="mt-4 flex gap-2">{action}</div> : null}
          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-subtle">
            诊断日志位于 %LOCALAPPDATA%\BrowserHub\logs。浏览器数据不会被修改。
          </p>
        </div>
      </div>
    </div>
  );
}
