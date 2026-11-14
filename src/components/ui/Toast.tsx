import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";

type ToastVariant = "default" | "success" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

const ICONS = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
} as const;

const ICON_CLASSES: Record<ToastVariant, string> = {
  default: "text-info",
  success: "text-success",
  error: "text-danger",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current.slice(-3), { ...options, id }]);
      const lifetime = options.variant === "error" ? 6500 : 4200;
      const timer = window.setTimeout(() => dismiss(id), lifetime);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach((timer) => window.clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[350px] flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((item) => {
          const variant = item.variant ?? "default";
          const Icon = ICONS[variant];
          return (
            <div
              key={item.id}
              role={variant === "error" ? "alert" : "status"}
              className="pointer-events-auto flex animate-toast-in items-start gap-2.5 rounded-[9px] border border-line bg-panel p-3 shadow-float"
            >
              <Icon
                className={cn("mt-[1px] h-4 w-4 shrink-0", ICON_CLASSES[variant])}
                strokeWidth={1.9}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium leading-5 text-ink">
                  {item.title}
                </p>
                {item.description ? (
                  <p className="mt-0.5 break-words text-[11.5px] leading-relaxed text-ink-muted">
                    {item.description}
                  </p>
                ) : null}
              </div>
              <IconButton
                label="关闭通知"
                size="sm"
                className="-mr-1 -mt-1"
                onClick={() => dismiss(item.id)}
              >
                <X className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
