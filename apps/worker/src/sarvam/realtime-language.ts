/**
 * Map portal/catalog speech language ids onto Sarvam realtime STT wire codes.
 * Realtime uses `auto` (not `unknown`) and Odia `or-IN` (not legacy `od-IN`).
 */
export function toSarvamRealtimeLanguage(language: string): string {
  const trimmed = language.trim();
  if (!trimmed || trimmed === 'unknown') return 'auto';
  if (trimmed === 'od-IN') return 'or-IN';
  return trimmed;
}
