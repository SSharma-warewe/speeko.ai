export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return formatDateTime(value);
}

export function shortId(id: string, n = 8): string {
  return id.length > n ? `${id.slice(0, n)}…` : id;
}

export function initialsFromName(
  name?: string | null,
  email?: string | null,
): string {
  const source = (name?.trim() || email?.trim() || "?").replace(/\s+/g, " ");
  const parts = source.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const last = parts[parts.length - 1]?.[0] ?? "";
    return `${first}${last}`.toUpperCase();
  }
  const token = parts[0] ?? "?";
  return token.slice(0, 2).toUpperCase();
}

export function formatUsd(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value === 0) return "$0.00";
  const abs = Math.abs(value);
  const digits = abs >= 0.01 ? 2 : abs >= 0.0001 ? 4 : 6;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCostQuantity(input: {
  quantity: number;
  unit: string;
}): string {
  const q = input.quantity;
  if (!Number.isFinite(q)) return "—";
  switch (input.unit) {
    case "minutes":
      return `${trimQty(q, 3)} min`;
    case "tokens_in":
    case "tokens_cached":
    case "tokens_out":
      return `${trimQty(q, 0)} tok`;
    case "characters":
      return `${trimQty(q, 0)} chars`;
    case "requests":
      return `${trimQty(q, 0)} req`;
    default:
      return `${trimQty(q, 2)} ${input.unit}`;
  }
}

function trimQty(n: number, maxFrac: number): string {
  if (maxFrac <= 0) {
    return Math.round(n).toLocaleString("en-US");
  }
  const rounded = Number(n.toFixed(maxFrac));
  return rounded.toLocaleString("en-US", {
    maximumFractionDigits: maxFrac,
  });
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
