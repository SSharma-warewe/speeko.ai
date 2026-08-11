/**
 * Lightweight className merger (no external deps).
 * Falsy values are skipped; objects enable conditional classes.
 */
type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  const push = (value: ClassValue): void => {
    if (!value && value !== 0) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    if (typeof value === "object") {
      for (const [key, on] of Object.entries(value)) {
        if (on) out.push(key);
      }
    }
  };

  inputs.forEach(push);
  return out.join(" ");
}
