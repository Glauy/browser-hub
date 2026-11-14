import { cn } from "@/lib/cn";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * BrowserHub mark: an ink tile with a browser frame and a teal status dot.
 * Kept as a single SVG so the in-app mark and the application icon share the
 * same geometry.
 */
export function BrandMark({ size = 24, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" fill="#17211D" />
      <rect
        x="6.75"
        y="8.25"
        width="18.5"
        height="15.5"
        rx="2.6"
        stroke="#E9F0E8"
        strokeWidth="1.5"
      />
      <path d="M6.75 12.5H25.25" stroke="#E9F0E8" strokeWidth="1.5" />
      <circle cx="9.6" cy="10.4" r="0.85" fill="#74C1AD" />
      <circle cx="12.2" cy="10.4" r="0.85" fill="#E9F0E8" opacity="0.45" />
      <circle cx="14.8" cy="10.4" r="0.85" fill="#E9F0E8" opacity="0.45" />
      <path
        d="M10.4 17.2H18.9"
        stroke="#E9F0E8"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.65"
      />
      <path
        d="M10.4 20.3H16.4"
        stroke="#E9F0E8"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.35"
      />
      <circle cx="22" cy="20.5" r="2.35" fill="#74C1AD" />
    </svg>
  );
}
