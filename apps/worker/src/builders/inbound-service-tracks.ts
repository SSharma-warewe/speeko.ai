export const INBOUND_SERVICE_TRACKS = ['list', 'sell', 'buy', 'rent'] as const;

export type InboundServiceTrack = (typeof INBOUND_SERVICE_TRACKS)[number];

const BUY_LINE = 'गुरुग्राम में कौन सा सेक्टर या लोकैलिटी देखना चाहते हो?';
const RENT_LINE = BUY_LINE;
const SELL_LINE = 'आपकी प्रॉपर्टी गुरुग्राम के किस सेक्टर या एरिया में है?';
const LIST_LINE =
  'आप कौन सी प्रॉपर्टी लिस्ट करवाना चाहते हो — सेक्टर या एरिया बताइए?';

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
  { track: 'buy', tokens: ['खरीदना', 'खरीद', 'बाय', 'purchase', 'buy'] },
  { track: 'rent', tokens: ['किराये', 'किराया', 'रेंट', 'rent'] },
];

export function inboundServiceTrackLine(track: InboundServiceTrack): string {
  return TRACK_LINES[track];
}

export function inboundServiceTrackLines(): string[] {
  return INBOUND_SERVICE_TRACKS.map((track) => TRACK_LINES[track]);
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

function tokenIndex(text: string, token: string): number {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    'iu',
  ).exec(text);
  return match?.index ?? -1;
}
