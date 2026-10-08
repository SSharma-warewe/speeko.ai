/** Keep inheritance distinct from an explicit off when editing/saving. */
export function speechCacheSelection(value: boolean | null): string {
  return value === null ? 'default' : value ? 'on' : 'off';
}

export function speechCachePreference(value: string): boolean | null {
  return value === 'on' ? true : value === 'off' ? false : null;
}
