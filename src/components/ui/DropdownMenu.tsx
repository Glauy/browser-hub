import { createPortal } from "react-dom";
import type { ButtonHTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode, Ref } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";

export interface DropdownTriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
}

interface DropdownMenuProps {
  trigger: (props: DropdownTriggerProps) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  menuLabel?: string;
}

interface MenuContextValue {
  close: (returnFocus?: boolean) => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext(): MenuContextValue {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error("DropdownMenu components must be used inside DropdownMenu");
  }
  return context;
}

export function DropdownMenu({
  trigger,
  children,
  align = "end",
  className,
  menuLabel = "操作菜单",
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const update = () => {
      const anchor = triggerRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) {
        return;
      }

      const anchorRect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const gap = 5;
      const padding = 8;

      let left =
        align === "end" ? anchorRect.right - menuRect.width : anchorRect.left;
      let top = anchorRect.bottom + gap;

      if (top + menuRect.height > window.innerHeight - padding) {
        top = anchorRect.top - menuRect.height - gap;
      }

      left = Math.max(
        padding,
        Math.min(left, window.innerWidth - menuRect.width - padding),
      );
      top = Math.max(padding, Math.min(top, window.innerHeight - menuRect.height - padding));

      setPosition((current) =>
        current?.left === left && current?.top === top
          ? current
          : { left, top },
      );
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => {
      menuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
        ?.focus();
    }, 20);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open, close]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      close(true);
      return;
    }
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    if (items.length === 0) {
      return;
    }

    event.preventDefault();
    const activeIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );

    if (event.key === "Home") {
      items[0].focus();
      return;
    }
    if (event.key === "End") {
      items[items.length - 1].focus();
      return;
    }
    if (event.key === "ArrowDown") {
      items[(activeIndex + 1 + items.length) % items.length].focus();
      return;
    }
    items[(activeIndex - 1 + items.length) % items.length].focus();
  };

  const triggerProps: DropdownTriggerProps = {
    ref: triggerRef,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen((value) => !value);
    },
  };

  return (
    <MenuContext.Provider value={{ close }}>
      {trigger(triggerProps)}
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={menuLabel}
              onKeyDown={handleMenuKeyDown}
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                visibility: position ? "visible" : "hidden",
              }}
              className={cn(
                "fixed z-[90] min-w-[190px] rounded-[9px] border border-line bg-panel p-1 shadow-menu animate-fade-in",
                className,
              )}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </MenuContext.Provider>
  );
}

interface DropdownMenuItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  danger?: boolean;
  shortcut?: string;
  onSelect?: () => void;
}

export function DropdownMenuItem({
  icon: Icon,
  danger = false,
  shortcut,
  children,
  onSelect,
  className,
  disabled,
  ...props
}: DropdownMenuItemProps) {
  const { close } = useMenuContext();

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        "flex w-full select-none items-center gap-2.5 rounded-[5px] px-2 py-[6px] text-left text-[12.5px] transition-colors duration-75",
        "disabled:pointer-events-none disabled:opacity-40",
        danger
          ? "text-danger hover:bg-danger-soft"
          : "text-ink hover:bg-panel-muted",
        className,
      )}
      onClick={(event) => {
        onSelect?.();
        close(event.detail === 0);
      }}
      {...props}
    >
      {Icon ? (
        <Icon
          className={cn(
            "h-[15px] w-[15px] shrink-0",
            danger ? "text-danger" : "text-ink-subtle",
          )}
          strokeWidth={1.8}
        />
      ) : (
        <span className="h-[15px] w-[15px] shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? (
        <span className="shrink-0 text-[10.5px] tracking-wide text-ink-subtle">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-line" role="separator" />;
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-1.5 text-[10.5px] font-medium tracking-wide text-ink-subtle">
      {children}
    </div>
  );
}
