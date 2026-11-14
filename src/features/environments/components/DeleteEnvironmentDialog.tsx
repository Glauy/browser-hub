import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { call, getErrorMessage } from "@/lib/ipc";
import type { Environment } from "@/types/environment";

interface DeleteEnvironmentDialogProps {
  open: boolean;
  mode: "remove" | "delete";
  environment: Environment | null;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}

export function DeleteEnvironmentDialog({
  open,
  mode,
  environment,
  onOpenChange,
  onCompleted,
}: DeleteEnvironmentDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setConfirmed(false);
    setSubmitting(false);
    setError(null);
  }, [open, environment?.id]);

  if (!environment) {
    return null;
  }

  const isDelete = mode === "delete";
  const isRunning = environment.lastStatus === "running";
  const isUnknown = environment.lastStatus === "unknown";
  const blocked = isRunning || (isDelete && isUnknown);
  const canSubmit = !blocked && !submitting && (!isDelete || confirmed);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await call(
        isDelete ? "delete_environment" : "remove_environment",
        { environmentId: environment.id },
      );
      onCompleted();
      onOpenChange(false);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      dismissible={!submitting}
      title={isDelete ? "删除环境及其数据" : "从 BrowserHub 移除环境"}
      description={
        isDelete
          ? "此操作会永久删除数据库记录和真实的 Chrome 数据目录。"
          : "只删除管理记录，浏览器数据仍保留在原位置。"
      }
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            variant={isDelete ? "danger" : "primary"}
            loading={submitting}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {isDelete ? "永久删除" : "从列表移除"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div className="rounded-[7px] border border-line bg-panel-muted px-3 py-2.5">
          <p className="text-[12.5px] font-medium text-ink">{environment.name}</p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-subtle">
            <StatusIndicator status={environment.lastStatus} />
            <span>·</span>
            <span>
              {environment.sourceType === "managed"
                ? "BrowserHub 创建"
                : "引用外部目录"}
            </span>
          </div>
        </div>

        {isDelete ? (
          <>
            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-ink">将被永久删除的目录</p>
              <PathDisplay path={environment.userDataDir} tone="danger" />
            </div>

            <Notice tone="danger" title="该目录包含真实浏览数据">
              Cookies、登录状态、扩展程序和浏览历史都会一起删除，无法通过
              BrowserHub 恢复。请先创建备份，或改用“从 BrowserHub 移除”。
            </Notice>

            <label className="flex select-none items-start gap-2.5 rounded-[7px] border border-line px-3 py-2.5">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={blocked || submitting}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-[1px] h-3.5 w-3.5 accent-[var(--bh-accent)]"
              />
              <span className="text-[11.5px] leading-relaxed text-ink-muted">
                我已确认要永久删除上述目录及其中的全部数据。
              </span>
            </label>
          </>
        ) : (
          <Notice tone="info" title="不会删除任何文件">
            原目录 {environment.userDataDir} 会保留在磁盘上，之后仍可通过“导入环境”重新引用。
          </Notice>
        )}

        {isRunning ? (
          <Notice tone="warning" title="环境正在运行">
            请先在 Chrome 中关闭这个环境，等待状态变为“已停止”后再执行操作。
          </Notice>
        ) : null}

        {isUnknown && isDelete ? (
          <Notice tone="warning" title="无法确认 Chrome 是否已退出">
            为避免数据损坏，BrowserHub 拒绝执行删除。请关闭可能使用该目录的
            Chrome，刷新状态后再试。
          </Notice>
        ) : null}

        {isUnknown && !isDelete ? (
          <Notice tone="warning" title="运行状态未知">
            移除记录不会删除数据，但可能会失去对正在运行的 Chrome 实例的追踪。
          </Notice>
        ) : null}

        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
    </Dialog>
  );
}
