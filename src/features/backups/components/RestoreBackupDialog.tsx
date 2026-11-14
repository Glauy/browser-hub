import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { getErrorMessage } from "@/lib/ipc";
import type { Backup } from "@/types/backup";
import type { Environment } from "@/types/environment";

interface RestoreBackupDialogProps {
  open: boolean;
  backup: Backup | null;
  environment: Environment | null;
  onOpenChange: (open: boolean) => void;
  onRestore: (backupId: string) => Promise<void>;
  onRestored: (backup: Backup) => void;
}

export function RestoreBackupDialog({
  open,
  backup,
  environment,
  onOpenChange,
  onRestore,
  onRestored,
}: RestoreBackupDialogProps) {
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
  }, [open, backup?.id]);

  if (!backup) {
    return null;
  }

  const missingEnvironment = !environment;
  const running = environment?.lastStatus === "running";
  const unknown = environment?.lastStatus === "unknown";
  const blocked = missingEnvironment || running || unknown;
  const canSubmit = !blocked && confirmed && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onRestore(backup.id);
      onRestored(backup);
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
      title="恢复备份"
      description="将备份内容写回目标环境的数据目录，覆盖其当前内容。"
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
            variant="danger"
            loading={submitting}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            覆盖并恢复
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div className="rounded-[7px] border border-line bg-panel-muted px-3 py-2.5">
          <p className="text-[12.5px] font-medium text-ink">{backup.environmentName}</p>
          {environment ? (
            <div className="mt-1 flex items-center gap-2">
              <StatusIndicator status={environment.lastStatus} />
              <span className="text-[11px] text-ink-subtle">·</span>
              <span className="text-[11px] text-ink-subtle">
                当前环境数据将被备份内容替换
              </span>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-danger">目标环境已被移除，无法恢复。</p>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-ink">备份来源</p>
          <PathDisplay path={backup.path} />
        </div>

        {environment ? (
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-ink">将被覆盖的数据目录</p>
            <PathDisplay path={environment.userDataDir} tone="danger" />
          </div>
        ) : null}

        <Notice tone="warning" title="恢复会替换目标环境的全部浏览数据">
          当前的 Cookies、登录状态、扩展与浏览历史会被备份中的内容覆盖。备份文件本身会保留，
          但目标目录中较新的数据无法撤销。
        </Notice>

        {running ? (
          <Notice tone="danger" title="环境正在运行">
            请先完全关闭该环境的 Chrome，等待状态变为“已停止”后再恢复。
          </Notice>
        ) : null}

        {unknown ? (
          <Notice tone="danger" title="无法确认 Chrome 是否已退出">
            为避免写入正在使用的 Chrome 数据库，状态未知时禁止恢复。请先刷新状态。
          </Notice>
        ) : null}

        {missingEnvironment ? (
          <Notice tone="danger" title="目标环境不存在">
            只能将备份恢复到仍然存在的环境。你可以重新导入对应的浏览器目录。
          </Notice>
        ) : null}

        <label className="flex select-none items-start gap-2.5 rounded-[7px] border border-line px-3 py-2.5">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={blocked || submitting}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-[1px] h-3.5 w-3.5 accent-[var(--bh-accent)]"
          />
          <span className="text-[11.5px] leading-relaxed text-ink-muted">
            我已确认要用这个备份覆盖目标环境的当前数据。
          </span>
        </label>

        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
    </Dialog>
  );
}
