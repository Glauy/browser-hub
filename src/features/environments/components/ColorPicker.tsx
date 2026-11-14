import { Check, Palette } from "lucide-react";
import { cn } from "@/lib/cn";
import { ENVIRONMENT_COLORS } from "@/lib/constants";

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Palette className="h-3.5 w-3.5 text-ink-subtle" strokeWidth={1.7} />
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="环境颜色">
        {ENVIRONMENT_COLORS.map((color) => {
          const selected = color.value.toUpperCase() === value.toUpperCase();
          return (
            <button
              key={color.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={color.label}
              title={color.label}
              onClick={() => onChange(color.value)}
              style={{ backgroundColor: color.value }}
              className={cn(
                "flex h-[22px] w-[22px] items-center justify-center rounded-full transition-transform",
                "hover:scale-[1.08]",
                selected
                  ? "ring-2 ring-ink/45 ring-offset-2 ring-offset-panel"
                  : "ring-1 ring-black/10",
              )}
            >
              {selected ? (
                <Check className="h-3 w-3 text-white" strokeWidth={2.6} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
