import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60",
        "disabled:pointer-events-none disabled:opacity-40",
        checked
          ? "border-accent bg-accent"
          : "border-line-strong bg-panel-muted",
      )}
    >
      <span
        className={cn(
          "block h-[16px] w-[16px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] transition-transform duration-150",
          "dark:bg-[#e8eae5]",
          checked ? "translate-x-[17px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}
