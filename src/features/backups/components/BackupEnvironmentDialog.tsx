import { AlertTriangle, Archive } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { getErrorMessage } from "@/lib/ipc";
import type { Backup, BackupEnvironmentInput } from "@/types/backup";
import type { Environment } from "@/types/environment";
import type { AppSettings } from "@/types/settings";

interface BackupEnvironmentDialogProps {
  open: boolean;
  environments: Environment[];
  fixedEnvironmentId?: string | null;
  settings: AppSettings;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: BackupEnvironmentInput) => Promise<Backup>;
  onCreated: (backup: Backup) => void;
}

export function BackupEnvironmentDialog({
  open,
  environments,
  fixedEnvironmentId,
  settings,
  onOpenChange,
  onCreate,
  onCreated,
}: BackupEnvironmentDialogProps) {
  const [environmentId, setEnvironmentId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const fallback =
      fixedEnvironmentId ??
      environments.find((environment) => environment.lastStatus === "stopped")?.id ??
      environments[0]?.id ??
      "";
    setEnvironmentId(fallback);
    setNote("");
    setSubmitting(false);
    setError(null);
  }, [open, fixedEnvironmentId, environments]);

  const environment = environments.find((item) => item.id === environmentId);
  const backupRoot = settings.backupRootDir ?? `${settings.environmentRootDir}\\backups`;
  const blocked =
    !environment ||
    environment.lastStatus === "running" ||
    environment.lastStatus === "unknown";
  const canSubmit = !blocked && !submitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!environment || !canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const backup = await onCreate({
        environmentId: environment.id,
        note: note.trim() || null,
      });
      onCreated(backup);
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
      title="创建环境备份"
      description="完整复制 Chrome 用户数据目录。备份期间请勿启动该环境的 Chrome。"
      initialFocusRef={noteRef}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            type="submit"
            form="backup-environment-form"
            variant="primary"
            loading={submitting}
            disabled={!canSubmit}
          >
            开始备份
          </Button>
        </>
      }
    >
      <form
        id="backup-environment-form"
        className="space-y-4 py-2"
        onSubmit={handleSubmit}
      >
        {fixedEnvironmentId ? (
          environment ? (
            <div className="rounded-[7px] border border-line bg-panel-muted px-3 py-2.5">
              <p className="text-[12.5px] font-medium text-ink">{environment.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <StatusIndicator status={environment.lastStatus} />
                <span className="text-[11px] text-ink-subtle">·</span>
                <span className="truncate font-mono text-[10.5px] text-ink-subtle">
                  {environment.userDataDir}
                </span>
              </div>
            </div>
          ) : null
        ) : (
          <Field label="选择环境" htmlFor="backup-environment">
            <select
              id="backup-environment"
              value={environmentId}
              onChange={(event) => setEnvironmentId(event.target.value)}
              className="h-9 w-full rounded-[7px] border border-line bg-panel px-2.5 text-[13px] text-ink focus:border-accent/70 focus:outline-none focus:ring-[3px] focus:ring-accent/12"
            >
              {environments.length === 0 ? (
                <option value="">暂无可备份的环境</option>
              ) : null}
              {environments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}（{item.lastStatus === "running" ? "运行中" : "已停止"}）
                </option>
              ))}
            </select>
          </Field>
        )}

        {environment ? (
          <Field label="源数据目录">
            <PathDisplay path={environment.userDataDir} />
          </Field>
        ) : null}

        <Field label="备份位置">
          <PathDisplay path={backupRoot} />
          <p className="pt-1 text-[11px] text-ink-subtle">
            可在“设置 → 备份”中修改默认备份目录。备份目录不会包含在环境列表中。
          </p>
        </Field>

        <Field
          label="备注"
          htmlFor="backup-note"
          optional
          hint={`${note.length}/120`}
        >
          <Textarea
            id="backup-note"
            ref={noteRef}
            value={note}
            maxLength={120}
            placeholder="例如：升级 Chrome 前备份"
            className="min-h-[60px]"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {environment?.lastStatus === "running" ? (
          <Notice tone="warning" title="请先关闭该环境的 Chrome">
            浏览器运行时会持续写入数据库，此时复制可能得到不一致的备份。关闭
            Chrome 并刷新状态后再试。
          </Notice>
        ) : null}

        {environment?.lastStatus === "unknown" ? (
          <Notice tone="warning" title="无法确认 Chrome 是否已退出">
            为保护数据一致性，状态未知时 BrowserHub 不允许创建备份。请刷新运行状态。
          </Notice>
        ) : null}

        <Notice tone="info">
          备份会包含 Cookies、登录状态、扩展程序和浏览历史。请将它保存在可信的本地磁盘，
          不要上传到公共位置。
        </Notice>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <div className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
          <AlertTriangle className="h-3 w-3" />
          大型环境可能需要数秒到数分钟，期间请保持 BrowserHub 打开。
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
          <Archive className="h-3 w-3" />
          备份按目录存放，可在“备份”页面恢复或删除。
        </div>
      </form>
    </Dialog>
  );
}
