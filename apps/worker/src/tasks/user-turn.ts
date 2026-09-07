export type UserTurnKind =
  | 'empty'
  | 'filler'
  | 'yes'
  | 'no'
  | 'wrong_person'
  | 'already_paid'
  | 'content';

const FILLER_EXACT = new Set([
  'hello',
  'hello?',
  'hi',
  'hey',
  'so',
  'a',
  'ah',
  'uh',
  'uh huh',
  'uhhuh',
  'hmm',
  'mm',
  'mhm',
  'huh',
  'thank you',
  'thanks',
  'thankyou',
]);

/**
 * Last user utterance from a LiveKit session / chat history / item list.
 * Fail closed: missing history is empty.
 */
export function lastUserTranscript(source: unknown): string {
  const items = collectChatItems(source);
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (String(rec.role ?? '') !== 'user') continue;
    const text = chatItemText(rec);
    if (text.trim()) return text;
  }
  return '';
}

export function classifyUserTurn(text: string | null | undefined): UserTurnKind {
  const raw = (text ?? '').trim();
  if (!raw) return 'empty';

  const normalized = normalizeTurn(raw);
  if (!normalized || normalized.length <= 1) return 'filler';
  if (FILLER_EXACT.has(normalized)) return 'filler';

  if (isAlreadyPaid(raw, normalized)) return 'already_paid';
  if (isWrongPerson(raw, normalized)) return 'wrong_person';
  if (isNo(raw, normalized)) return 'no';
  if (isYes(normalized)) return 'yes';
  return 'content';
}

export function isUnusableUserTurn(text: string | null | undefined): boolean {
  const kind = classifyUserTurn(text);
  return kind === 'empty' || kind === 'filler';
}

function collectChatItems(source: unknown): unknown[] {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  if (typeof source !== 'object') return [];
  const rec = source as Record<string, unknown>;
  if (Array.isArray(rec.items)) return rec.items;
  if (rec.history) return collectChatItems(rec.history);
  if (rec.chatCtx) return collectChatItems(rec.chatCtx);
  return [];
}

function chatItemText(rec: Record<string, unknown>): string {
  const content = rec.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text ?? '');
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }
  if (typeof rec.text === 'string') return rec.text;
  return '';
}

function normalizeTurn(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,!?;:…"'"'।\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isYes(normalized: string): boolean {
  return /^(हाँ|हां|जी|जी हाँ|जी हां|haan|han|ha|yes|yeah|yep|ji|ji haan|ji han)$/u.test(
    normalized,
  );
}

function isNo(raw: string, normalized: string): boolean {
  if (
    /not interested|nahi chahiye|नहीं चाहिए|नही चाहिए|merko nahi|mujhe nahi/i.test(
      raw,
    )
  ) {
    return true;
  }
  return /^(नहीं|नही|nahi|no|nope|nahin)$/u.test(normalized);
}

function isWrongPerson(raw: string, normalized: string): boolean {
  if (
    /wrong person|wrong number|not the right person|this is not\b|i(?:'m| am) not\b/i.test(
      raw,
    )
  ) {
    return true;
  }
  if (/गलत\s*(व्यक्ति|आदमी|नंबर|व्यक्ति)/u.test(raw)) return true;
  if (/नहीं हूँ|नही हूँ|nahi hun|nahi hoon|nahin hun/i.test(raw)) return true;
  if (/\bnot\s+[a-z\u0900-\u097f]{2,}/i.test(normalized) && !/not interested/i.test(raw)) {
    return /wrong|galat|नहीं हूँ|i am not|i'm not/i.test(raw);
  }
  return false;
}

function isAlreadyPaid(raw: string, normalized: string): boolean {
  if (
    /already paid|i(?:'ve| have) paid|i paid|payment (is )?done|paid already/i.test(
      raw,
    )
  ) {
    return true;
  }
  return (
    /हो चुका|हो चुकी|हो गया|हो गई|हो गयी|जमा हो|जमा कर|भुगत|भुगतान|दे दिया|पेमेंट हो/u.test(
      raw,
    ) ||
    /\bpaid\b/i.test(normalized)
  );
}
