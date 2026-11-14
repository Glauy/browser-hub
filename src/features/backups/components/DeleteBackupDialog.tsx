import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { formatBytes, formatDateTime } from "@/lib/format";
import { getErrorMessage } from "@/lib/ipc";
import type { Backup } from "@/types/backup";

interface DeleteBackupDialogProps {
  open: boolean;
  backup: Backup | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (backupId: string) => Promise<void>;
  onDeleted: (backup: Backup) => void;
}

export function DeleteBackupDialog({
  open,
  backup,
  onOpenChange,
  onDelete,
  onDeleted,
}: DeleteBackupDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSubmitting(false);
    setError(null);
  }, [open, backup?.id]);

  if (!backup) {
    return null;
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onDelete(backup.id);
      onDeleted(backup);
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
      size="sm"
      dismissible={!submitting}
      title="删除备份"
      description="永久删除磁盘上的备份目录，此操作无法撤销。"
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
            onClick={() => void handleSubmit()}
          >
            永久删除备份
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-ink">备份目录</p>
          <PathDisplay path={backup.path} tone="danger" />
        </div>

        <dl className="grid grid-cols-[86px_1fr] gap-y-1.5 text-[11.5px]">
          <dt className="text-ink-subtle">所属环境</dt>
          <dd className="text-ink">{backup.environmentName}</dd>
          <dt className="text-ink-subtle">创建时间</dt>
          <dd className="text-ink">{formatDateTime(backup.createdAt)}</dd>
          <dt className="text-ink-subtle">占用空间</dt>
          <dd className="tabular text-ink">{formatBytes(backup.sizeBytes)}</dd>
          {backup.note ? (
            <>
              <dt className="text-ink-subtle">备注</dt>
              <dd className="text-ink">{backup.note}</dd>
            </>
          ) : null}
        </dl>

        <Notice tone="danger" title="不会影响当前环境">
          删除备份只移除这份副本，不会修改或删除环境正在使用的浏览器数据。
        </Notice>

        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
    </Dialog>
  );
}
