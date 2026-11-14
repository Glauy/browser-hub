import { X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";

type DialogSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: "w-[400px]",
  md: "w-[520px]",
  lg: "w-[620px]",
  xl: "w-[720px]",
};

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  initialFocusRef,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
      if (initialFocusRef?.current) {
        const element = initialFocusRef.current;
        window.setTimeout(() => element.focus(), 30);
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocusRef]);

  useEffect(() => {
    return () => {
      const dialog = dialogRef.current;
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) {
          onOpenChange(false);
        }
      }}
      onClose={() => {
        if (open) {
          onOpenChange(false);
        }
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && dismissible) {
          onOpenChange(false);
        }
      }}
      className={cn(
        "m-auto max-w-[calc(100vw-40px)] animate-dialog-in bg-transparent p-0",
        SIZE_CLASSES[size],
      )}
    >
      <div className="overflow-hidden rounded-[12px] border border-line bg-panel shadow-float">
        <header className="flex items-start gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-[15px] font-semibold leading-6 text-ink"
            >
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-1 text-[12px] leading-relaxed text-ink-muted"
              >
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            label="关闭"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={!dismissible}
            className="-mr-1 -mt-0.5"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </IconButton>
        </header>

        <div className="max-h-[min(64vh,600px)] overflow-y-auto px-5 py-1">
          {children}
        </div>

        {footer ? (
          <footer className="mt-4 flex items-center justify-end gap-2 border-t border-line bg-panel-muted/60 px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
