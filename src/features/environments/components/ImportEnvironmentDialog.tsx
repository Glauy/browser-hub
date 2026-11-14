import { FolderSearch } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { copyText } from "@/lib/clipboard";
import { call, getErrorMessage } from "@/lib/ipc";
import type {
  DirectoryInspection,
  Environment,
  ImportEnvironmentInput,
} from "@/types/environment";
import type { AppSettings } from "@/types/settings";
import { ColorPicker } from "./ColorPicker";

const IMPORT_COLOR = "#4A6670";

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

interface ImportEnvironmentDialogProps {
  open: boolean;
  settings: AppSettings;
  onOpenChange: (open: boolean) => void;
  onImported: (environment: Environment) => void;
}

export function ImportEnvironmentDialog({
  open,
  settings,
  onOpenChange,
  onImported,
}: ImportEnvironmentDialogProps) {
  const [path, setPath] = useState<string | null>(null);
  const [inspection, setInspection] = useState<DirectoryInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(IMPORT_COLOR);
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPath(null);
    setInspection(null);
    setInspecting(false);
    setName("");
    setDescription("");
    setColor(IMPORT_COLOR);
    setNameTouched(false);
    setSubmitting(false);
    setError(null);
  }, [open]);

  const inspect = async (target: string) => {
    setInspecting(true);
    setError(null);
    setInspection(null);

    try {
      const result = await call<DirectoryInspection>(
        "inspect_environment_directory",
        { path: target },
      );
      setInspection(result);
      if (!nameTouched) {
        setName(basename(result.path));
      }
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setInspecting(false);
    }
  };

  const chooseDirectory = async () => {
    try {
      const selected = await call<string | null>("select_directory", {
        initialDir: settings.environmentRootDir || null,
        title: "选择已有的 Chrome 用户数据目录",
      });
      if (!selected) {
        return;
      }
      setPath(selected);
      await inspect(selected);
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const useSuggestedParent = async () => {
    const suggested = inspection?.suggestedUserDataDir;
    if (!suggested) {
      return;
    }
    setPath(suggested);
    await inspect(suggested);
  };

  const isValidDirectory =
    inspection !== null &&
    inspection.exists &&
    inspection.isDirectory &&
    inspection.writable &&
    !inspection.isProfileDirectory &&
    !inspection.alreadyManaged;
  const canImport =
    isValidDirectory && name.trim().length > 0 && !submitting && !inspecting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!path || !canImport) {
      return;
    }
    if (name.trim().length > 40) {
      setError("环境名称不能超过 40 个字符。");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const input: ImportEnvironmentInput = {
        userDataDir: path,
        name: name.trim(),
        description: description.trim() || null,
        color,
      };
      const environment = await call<Environment>("import_environment", { input });
      onImported(environment);
      onOpenChange(false);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const showProfileWarning = inspection?.isProfileDirectory ?? false;
  const showUnknownWarning =
    isValidDirectory && inspection !== null && !inspection.isChromeUserDataDir;
  const showManagedError = inspection?.alreadyManaged ?? false;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      dismissible={!submitting}
      title="导入已有环境"
      description="引用已有的 Chrome User Data Directory，不复制、不移动任何浏览器数据。"
      initialFocusRef={chooseRef}
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
            form="import-environment-form"
            variant="primary"
            loading={submitting}
            disabled={!canImport}
          >
            导入环境
          </Button>
        </>
      }
    >
      <form id="import-environment-form" className="space-y-4 py-2" onSubmit={handleSubmit}>
        <Field
          label="Chrome 用户数据目录"
          hint="请选择包含 Local State 的上级目录"
        >
          <div className="flex items-center gap-2">
            <Button
              ref={chooseRef}
              variant="secondary"
              icon={<FolderSearch className="h-4 w-4" strokeWidth={1.7} />}
              onClick={() => void chooseDirectory()}
              loading={inspecting}
            >
              {path ? "重新选择目录" : "选择目录…"}
            </Button>
            {path ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void copyText(path)}
              >
                复制路径
              </Button>
            ) : null}
          </div>
          {path ? (
            <PathDisplay
              className="mt-2"
              path={path}
              tone={showProfileWarning || showManagedError ? "danger" : "default"}
            />
          ) : (
            <p className="pt-1 text-[11px] leading-relaxed text-ink-subtle">
              例如：D:\chrome-accounts\account2。若选择了 Default 或 Profile 1
              子目录，BrowserHub 会提示正确的上级目录。
            </p>
          )}
        </Field>

        {showProfileWarning ? (
          <Notice
            tone="warning"
            title="这是 Chrome 的 Profile 子目录"
            actions={
              inspection?.suggestedUserDataDir ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void useSuggestedParent()}
                >
                  使用上一级目录
                </Button>
              ) : null
            }
          >
            单独选择 Default 或 Profile 目录会遗漏 Local State
            等共享数据，请选择它的上一级 User Data Directory。
          </Notice>
        ) : null}

        {showManagedError ? (
          <Notice tone="danger" title="该目录已被 BrowserHub 管理">
            同一个 Chrome 用户数据目录不能同时供两个环境使用。请先在环境列表中移除原有记录。
          </Notice>
        ) : null}

        {inspection && !inspection.exists ? (
          <Notice tone="danger" title="目录不存在">
            请确认磁盘已连接，或重新选择其他目录。
          </Notice>
        ) : null}

        {inspection && inspection.exists && !inspection.isDirectory ? (
          <Notice tone="danger" title="选择的路径不是目录">
            请选择 Chrome User Data Directory 的文件夹。
          </Notice>
        ) : null}

        {inspection && inspection.exists && inspection.isDirectory && !inspection.writable ? (
          <Notice tone="danger" title="目录不可写">
            当前用户没有写入权限，Chrome 将无法在此目录保存登录状态。
          </Notice>
        ) : null}

        {showUnknownWarning ? (
          <Notice tone="warning" title="未检测到完整的 Chrome 数据特征">
            这里没有发现 Local State，但目录存在且可写。若它确实是 Chrome
            数据目录，可以继续导入；否则 Chrome 可能在此生成一套新数据。
          </Notice>
        ) : null}

        {isValidDirectory && inspection?.isChromeUserDataDir ? (
          <Notice tone="success" title="已识别为 Chrome 用户数据目录">
            包含 {inspection.profileCount} 个浏览器 Profile，将直接引用原目录。
          </Notice>
        ) : null}

        {isValidDirectory ? (
          <>
            <Field label="环境名称" htmlFor="import-name">
              <Input
                id="import-name"
                value={name}
                maxLength={40}
                placeholder="例如：客户账号 A"
                onChange={(event) => {
                  setNameTouched(true);
                  setName(event.target.value);
                }}
              />
            </Field>

            <Field
              label="描述"
              htmlFor="import-description"
              optional
              hint={`${description.length}/160`}
            >
              <Textarea
                id="import-description"
                value={description}
                maxLength={160}
                className="min-h-[58px]"
                placeholder="可选"
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <div className="flex items-center justify-between gap-4">
              <ColorPicker value={color} onChange={setColor} />
              <Badge tone="neutral">引用目录 · 不复制数据</Badge>
            </div>
          </>
        ) : null}

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <Notice tone="info" title="BrowserHub 会保留原始目录">
          导入只登记绝对路径。之后无论修改环境名称还是默认根目录，都不会改变这个
          Chrome 数据的实际位置。
        </Notice>
      </form>
    </Dialog>
  );
}
