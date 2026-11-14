import { Minus, Square, X } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { useWindowControls } from "@/hooks/useWindowControls";

export function TitleBar() {
  const { maximized, minimize, toggleMaximize, close } = useWindowControls();

  return (
    <header className="flex h-[42px] shrink-0 items-center border-b border-line bg-surface pl-3">
      <div
        className="flex h-full items-center gap-2.5"
        data-tauri-drag-region
      >
        <BrandMark size={19} />
        <span
          className="text-[12.5px] font-semibold tracking-[-0.01em] text-ink"
          data-tauri-drag-region
        >
          BrowserHub
        </span>
        <span className="h-4 w-px bg-line" aria-hidden />
        <span className="text-[11px] text-ink-subtle" data-tauri-drag-region>
          Chrome 环境管理器
        </span>
      </div>

      <div
        className="h-full flex-1"
        data-tauri-drag-region
        onDoubleClick={toggleMaximize}
      />

      <div className="flex h-full items-stretch">
        <button
          type="button"
          title="最小化"
          aria-label="最小化"
          onClick={minimize}
          className="flex w-[44px] items-center justify-center text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink"
        >
          <Minus className="h-[15px] w-[15px]" strokeWidth={1.7} />
        </button>
        <button
          type="button"
          title={maximized ? "还原" : "最大化"}
          aria-label={maximized ? "还原" : "最大化"}
          onClick={toggleMaximize}
          className="flex w-[44px] items-center justify-center text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink"
        >
          <Square className="h-[11px] w-[11px]" strokeWidth={1.9} />
        </button>
        <button
          type="button"
          title="关闭"
          aria-label="关闭"
          onClick={close}
          className="flex w-[46px] items-center justify-center text-ink-muted transition-colors hover:bg-[#c42b1c] hover:text-white"
        >
          <X className="h-[15px] w-[15px]" strokeWidth={1.7} />
        </button>
      </div>
    </header>
  );
}
