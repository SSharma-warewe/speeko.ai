/** class-transformer `@Transform` helper: trim strings, pass other values through. */
export function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
