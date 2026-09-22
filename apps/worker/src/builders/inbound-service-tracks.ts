export const INBOUND_SERVICE_TRACKS = ['list', 'sell', 'buy', 'rent'] as const;

export type InboundServiceTrack = (typeof INBOUND_SERVICE_TRACKS)[number];

export const INBOUND_SCRIPT_STEPS = [
  'service',
  'location',
  'timing',
  'bhk_budget',
  'done',
] as const;

export type InboundScriptStep = (typeof INBOUND_SCRIPT_STEPS)[number];

export type InboundLocationKind = 'sector' | 'locality' | 'anywhere';

export type InboundTimingKind = 'this_week' | 'this_month' | 'later';

export type InboundBhkBudgetKind = 'bhk' | 'budget' | 'both' | 'refuse';

const BUY_LINE = 'गुरुग्राम में कौन सा सेक्टर या लोकैलिटी देखना चाहते हो?';
const RENT_LINE = BUY_LINE;
const SELL_LINE = 'आपकी प्रॉपर्टी गुरुग्राम के किस सेक्टर या एरिया में है?';
const LIST_LINE =
  'आप कौन सी प्रॉपर्टी लिस्ट करवाना चाहते हो — सेक्टर या एरिया बताइए?';

export const INBOUND_TIMING_LINE =
  'आप कब देखना या खरीदना चाहते हो — इस हफ्ते विजिट, इस महीने, या बाद में?';
export const INBOUND_TIMING_CLARIFY_LINE =
  'माफ़ कीजिये, कब देखना है — इस हफ्ते, इस महीने, या बाद में?';
export const INBOUND_BHK_BUDGET_LINE =
  'आप कितने BHK का घर देख रहे हैं और आपका बजट क्या है?';
export const INBOUND_LOCATION_CLARIFY_LINE =
  'माफ़ कीजिये, मुझे समझ नहीं आया। क्या आप फिर से बता सकते हैं कि आप कौन सा सेक्टर या एरिया देखना चाहते हैं?';
export const INBOUND_BUDGET_ONLY_LINE = 'आपका बजट क्या है?';
export const INBOUND_SELL_BHK_LINE = 'आपकी प्रॉपर्टी कितने BHK की है?';
export const INBOUND_LIST_TYPE_LINE =
  'कौन सा टाइप है — फ्लैट, प्लॉट, या विला?';

const TRACK_LINES: Record<InboundServiceTrack, string> = {
  buy: BUY_LINE,
  rent: RENT_LINE,
  sell: SELL_LINE,
  list: LIST_LINE,
};

/** Longer tokens first so लिस्टिंग / बेचना win over लिस्ट / बेच. */
const TRACK_TOKENS: { track: InboundServiceTrack; tokens: string[] }[] = [
  { track: 'list', tokens: ['लिस्टिंग', 'लिस्ट', 'listing', 'list'] },
  { track: 'sell', tokens: ['बेचना', 'बेच', 'सेल', 'sell'] },
  {
    track: 'buy',
    tokens: ['खरीदना', 'खरीद', 'बाय', 'बाए', 'बये', 'purchase', 'buy'],
  },
  { track: 'rent', tokens: ['किराये', 'किराया', 'रेंट', 'rent'] },
];

const SECTOR_MIN = 1;
const SECTOR_MAX = 88;

const LOCALITY_TOKENS = ['golf', 'sohna', 'dlf', 'dwarka', 'mg'];
const ANYWHERE_TOKENS = ['कहीं भी', 'कोई भी', 'anywhere'];

const TIMING_TOKENS: { kind: InboundTimingKind; tokens: string[] }[] = [
  {
    kind: 'this_week',
    tokens: [
      'हफ्ते',
      'हफ्ता',
      'हफ़्ते',
      'हफ़्ता',
      'वास्ते',
      'हस्ते',
      'week',
      'weeks',
      'आज',
      'कल',
      'अभी',
    ],
  },
  {
    kind: 'this_month',
    tokens: ['महीने', 'महीना', 'महिने', 'महिना', 'month'],
  },
  { kind: 'later', tokens: ['बाद', 'later'] },
];

const BHK_TOKENS = ['bhk', 'बीएचके', 'बेडरूम', 'bedroom'];
const BUDGET_TOKENS = [
  'करोड़',
  'crore',
  'लाख',
  'lakh',
  'मिलियन',
  'million',
  'cr',
];
const REFUSE_TOKENS = ['नहीं बताना', 'नही बताना', 'nahi batana'];

export function inboundServiceTrackLine(track: InboundServiceTrack): string {
  return TRACK_LINES[track];
}

export function inboundServiceTrackLines(): string[] {
  return INBOUND_SERVICE_TRACKS.map((track) => TRACK_LINES[track]);
}

export function inboundScriptCacheLines(): string[] {
  return [
    INBOUND_TIMING_LINE,
    INBOUND_TIMING_CLARIFY_LINE,
    INBOUND_BHK_BUDGET_LINE,
    INBOUND_LOCATION_CLARIFY_LINE,
    INBOUND_BUDGET_ONLY_LINE,
    INBOUND_SELL_BHK_LINE,
    INBOUND_LIST_TYPE_LINE,
  ];
}

export function inboundLocationFollowUpLine(
  track: InboundServiceTrack | undefined,
): string {
  if (track === 'sell') {
    return INBOUND_SELL_BHK_LINE;
  }
  if (track === 'list') {
    return INBOUND_LIST_TYPE_LINE;
  }
  return INBOUND_TIMING_LINE;
}

export function inboundLocationNextStep(
  track: InboundServiceTrack | undefined,
): InboundScriptStep {
  if (track === 'sell' || track === 'list') {
    return 'done';
  }
  return 'timing';
}

/**
 * First token occurrence in the utterance wins.
 * Word-ish boundaries so भाई does not match बाय and listen does not match list.
 */
export function classifyInboundServiceTrack(
  userText: string | null | undefined,
): InboundServiceTrack | null {
  const text = (userText ?? '').trim();
  if (!text) {
    return null;
  }

  let best: { track: InboundServiceTrack; index: number } | null = null;
  for (const { track, tokens } of TRACK_TOKENS) {
    for (const token of tokens) {
      const index = tokenIndex(text, token);
      if (index < 0) {
        continue;
      }
      if (!best || index < best.index) {
        best = { track, index };
      }
    }
  }
  return best?.track ?? null;
}

/**
 * Location keyword is sector 1–88 (not a specific sector number).
 * Optional sector / सेक्टर / hector prefix; bare 1–88 also hits.
 */
export function classifyInboundLocation(
  userText: string | null | undefined,
): InboundLocationKind | null {
  const text = (userText ?? '').trim();
  if (!text) {
    return null;
  }

  let best: { kind: InboundLocationKind; index: number } | null = null;
  const sectorIndex = sectorIndexIn(text);
  if (sectorIndex >= 0) {
    best = { kind: 'sector', index: sectorIndex };
  }
  for (const token of ANYWHERE_TOKENS) {
    const index = tokenIndex(text, token);
    if (index >= 0 && (!best || index < best.index)) {
      best = { kind: 'anywhere', index };
    }
  }
  for (const token of LOCALITY_TOKENS) {
    const index = tokenIndex(text, token);
    if (index >= 0 && (!best || index < best.index)) {
      best = { kind: 'locality', index };
    }
  }
  return best?.kind ?? null;
}

export function classifyInboundTiming(
  userText: string | null | undefined,
): InboundTimingKind | null {
  const text = (userText ?? '').trim();
  if (!text) {
    return null;
  }

  let best: { kind: InboundTimingKind; index: number } | null = null;
  for (const { kind, tokens } of TIMING_TOKENS) {
    for (const token of tokens) {
      const index = tokenIndex(text, token);
      if (index < 0) {
        continue;
      }
      if (!best || index < best.index) {
        best = { kind, index };
      }
    }
  }
  return best?.kind ?? null;
}

export function classifyInboundBhkBudget(
  userText: string | null | undefined,
): InboundBhkBudgetKind | null {
  const text = (userText ?? '').trim();
  if (!text) {
    return null;
  }

  const refuse = firstTokenIndex(text, REFUSE_TOKENS) >= 0;
  const hasBhk = firstTokenIndex(text, BHK_TOKENS) >= 0;
  const hasBudget = firstTokenIndex(text, BUDGET_TOKENS) >= 0;
  if (refuse) {
    return 'refuse';
  }
  if (hasBhk && hasBudget) {
    return 'both';
  }
  if (hasBhk) {
    return 'bhk';
  }
  if (hasBudget) {
    return 'budget';
  }
  return null;
}

function sectorIndexIn(text: string): number {
  const prefixed =
    /(?:sector|सेक्टर|hector)\s*(\d{1,2})/giu;
  let best = -1;
  let match: RegExpExecArray | null;
  while ((match = prefixed.exec(text)) !== null) {
    if (isSectorNumber(match[1]) && (best < 0 || match.index < best)) {
      best = match.index;
    }
  }
  const bare = /(?<![\p{L}\p{N}])(\d{1,2})(?![\p{L}\p{N}])/gu;
  while ((match = bare.exec(text)) !== null) {
    if (isSectorNumber(match[1]) && (best < 0 || match.index < best)) {
      best = match.index;
    }
  }
  return best;
}

function isSectorNumber(raw: string): boolean {
  const n = Number(raw);
  return Number.isInteger(n) && n >= SECTOR_MIN && n <= SECTOR_MAX;
}

function firstTokenIndex(text: string, tokens: string[]): number {
  let best = -1;
  for (const token of tokens) {
    const index = tokenIndex(text, token);
    if (index >= 0 && (best < 0 || index < best)) {
      best = index;
    }
  }
  return best;
}

function tokenIndex(text: string, token: string): number {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    'iu',
  ).exec(text);
  return match?.index ?? -1;
}
