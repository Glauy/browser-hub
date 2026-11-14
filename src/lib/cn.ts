/**
 * Minimal class-name combiner.
 *
 * The project intentionally avoids utility dependencies for something this
 * small. Later classes win for the handful of conflicting Tailwind properties
 * we actually override (display, text color, background, border and padding).
 */

type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

function flatten(value: ClassValue, output: string[]): void {
  if (!value) {
    return;
  }
  if (typeof value === "string" || typeof value === "number") {
    output.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      flatten(item, output);
    }
    return;
  }
  for (const [key, enabled] of Object.entries(value)) {
    if (enabled) {
      output.push(key);
    }
  }
}

export function cn(...values: ClassValue[]): string {
  const classes: string[] = [];
  for (const value of values) {
    flatten(value, classes);
  }
  return classes.join(" ");
}
