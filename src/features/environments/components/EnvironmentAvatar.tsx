import { cn } from "@/lib/cn";
import { environmentInitial } from "@/lib/format";

type AvatarSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: "h-6 w-6 rounded-[5px] text-[10.5px]",
  md: "h-[30px] w-[30px] rounded-[7px] text-[12px]",
  lg: "h-10 w-10 rounded-[9px] text-[15px]",
};

interface EnvironmentAvatarProps {
  name: string;
  color: string | null;
  size?: AvatarSize;
  className?: string;
}

export function EnvironmentAvatar({
  name,
  color,
  size = "md",
  className,
}: EnvironmentAvatarProps) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: color ?? "#6B6F68" }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-semibold text-white/95",
        "shadow-[inset_0_0_0_1px_rgba(255,255,255,.12),0_1px_2px_rgba(20,24,20,.12)]",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {environmentInitial(name)}
    </span>
  );
}
