import { Copy, FolderOpen } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PathDisplay } from "@/components/ui/PathDisplay";
import { copyText } from "@/lib/clipboard";
import { getErrorMessage, call } from "@/lib/ipc";
import { DEFAULT_ENVIRONMENT_COLOR } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { ColorPicker } from "./ColorPicker";
import type { Environment } from "@/types/environment";
import type { AppSettings } from "@/types/settings";

interface EnvironmentDialogProps {
  open: boolean;
  mode: "create" | "edit";
  environment?: Environment;
  settings: AppSettings;
  onOpenChange: (open: boolean) => void;
  onSaved: (environment: Environment, mode: "create" | "edit") => void;
}

export function EnvironmentDialog({
  open,
  mode,
  environment,
  settings,
  onOpenChange,
  onSaved,
}: EnvironmentDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(DEFAULT_ENVIRONMENT_COLOR);
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(environment?.name ?? "");
    setDescription(environment?.description ?? "");
    setColor(environment?.color ?? DEFAULT_ENVIRONMENT_COLOR);
    setParentDirectory(null);
    setError(null);
    setSubmitting(false);
  }, [open, environment]);

  const targetRoot = parentDirectory ?? settings.environmentRootDir;
  const previewPath = targetRoot
    ? `${targetRoot.replace(/[\\/]+$/, "")}\\env_xxxxxxxx`
    : "";

  const handleChooseParent = async () => {
    try {
      const selected = await call<string | null>("select_directory", {
        initialDir: targetRoot || null,
        title: "选择新环境的存放位置",
      });
      if (selected) {
        setParentDirectory(selected);
      }
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const handleCopy = async () => {
    const path = mode === "edit" ? environment?.userDataDir : previewPath;
    if (!path) {
      return;
    }
    await copyText(path);
  };

  const handleOpen = async () => {
    if (!environment) {
      return;
    }
    try {
      await call("open_directory", { path: environment.userDataDir });
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("请输入环境名称。");
      nameRef.current?.focus();
      return;
    }
    if (trimmedName.length > 40) {
      setError("环境名称不能超过 40 个字符。");
      return;
    }
    if (mode === "create" && !targetRoot) {
      setError("尚未设置环境根目录，请先前往设置选择一个目录。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let saved: Environment;
      if (mode === "create") {
        saved = await call<Environment>("create_environment", {
          input: {
            name: trimmedName,
            description: description.trim() || null,
            color,
            parentDirectory: parentDirectory,
          },
        });
      } else if (environment) {
        saved = await call<Environment>("update_environment", {
          input: {
            id: environment.id,
            name: trimmedName,
            description: description.trim() || null,
            color,
          },
        });
      } else {
        throw new Error("Environment is required for edit mode");
      }

      onSaved(saved, mode);
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
      title={mode === "create" ? "新建浏览器环境" : "编辑环境"}
      description={
        mode === "create"
          ? "BrowserHub 会为环境创建一个独立的 Chrome 用户数据目录。"
          : "名称、描述和颜色只影响 BrowserHub 中的展示，不会移动浏览器数据。"
      }
      initialFocusRef={nameRef}
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
            variant="primary"
            type="submit"
            form="environment-form"
            loading={submitting}
          >
            {mode === "create" ? "创建环境" : "保存更改"}
          </Button>
        </>
      }
    >
      <form id="environment-form" className="space-y-4 py-2" onSubmit={handleSubmit}>
        <Field label="环境名称" htmlFor="environment-name">
          <Input
            id="environment-name"
            ref={nameRef}
            value={name}
            maxLength={40}
            placeholder="例如：Google 工作账号"
            onChange={(event) => setName(event.target.value)}
            invalid={name.trim().length === 0 && error !== null}
          />
        </Field>

        <Field
          label="描述"
          htmlFor="environment-description"
          optional
          hint={`${description.length}/160`}
        >
          <Textarea
            id="environment-description"
            value={description}
            maxLength={160}
            placeholder="这个环境用于什么？"
            className="min-h-[64px]"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <div className="space-y-1.5">
          <span className="text-[12px] font-medium text-ink">颜色标识</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        {mode === "create" ? (
          <Field
            label="存放位置"
            hint="将自动创建 env_xxxxxxxx 子目录"
          >
            <PathDisplay
              path={previewPath || null}
              placeholder="尚未配置环境根目录"
              onChange={() => void handleChooseParent()}
              onCopy={() => void handleCopy()}
            />
            <p className="pt-1 text-[11px] leading-relaxed text-ink-subtle">
              当前根目录：{settings.environmentRootDir || "未设置"}。更改位置只影响这个新环境。
            </p>
          </Field>
        ) : environment ? (
          <Field label="真实数据目录">
            <PathDisplay
              path={environment.userDataDir}
              onCopy={() => void handleCopy()}
              onOpen={() => void handleOpen()}
            />
            <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] text-ink-subtle">
              <Badge tone={environment.sourceType === "managed" ? "accent" : "neutral"}>
                {environment.sourceType === "managed" ? "BrowserHub 创建" : "引用外部目录"}
              </Badge>
              <span>创建于 {formatDateTime(environment.createdAt)}</span>
              <span className="inline-flex items-center gap-1">
                <Copy className="h-3 w-3" /> 路径不会随重命名改变
              </span>
            </div>
          </Field>
        ) : null}

        {error ? <Notice tone="danger">{error}</Notice> : null}

        {mode === "create" ? (
          <Notice tone="info">
            环境创建后，点击“启动”即可生成 Chrome 数据。BrowserHub 不会提前伪造
            Local State、Cookies 等文件。
          </Notice>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
            <FolderOpen className="h-3 w-3" />
            如需迁移目录，请使用独立的备份与恢复流程。
          </div>
        )}
      </form>
    </Dialog>
  );
}
