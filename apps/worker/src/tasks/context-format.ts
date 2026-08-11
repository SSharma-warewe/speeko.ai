/** Format runtime context for task instructions (not spoken raw JSON). */
export function formatContextForInstructions(
  context: Record<string, unknown> | undefined,
  maxLen = 1500,
): string {
  if (!context || Object.keys(context).length === 0) {
    return 'No additional call context was provided.';
  }
  try {
    const json = JSON.stringify(context, null, 0);
    return json.length > maxLen ? `${json.slice(0, maxLen)}…` : json;
  } catch {
    return 'Call context could not be serialized.';
  }
}

export function contextField(
  context: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!context) return undefined;
  for (const key of keys) {
    const v = context[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  }
  return undefined;
}
