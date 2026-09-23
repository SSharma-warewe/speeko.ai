import { isRealtimeLlmModel } from '@call-agent/contracts';
import type { AgentJobMetadata } from '@call-agent/contracts';
import { personaSpeaksHindi } from '../common/persona.js';
import {
  classifyUserTurn,
  isUnusableUserTurn,
  type ClassifyUserTurnOptions,
} from './user-turn.js';

export const DEMO_SCRIPT_STEPS = ['good_time', 'ask_when', 'done'] as const;

export type DemoScriptStep = (typeof DEMO_SCRIPT_STEPS)[number];

export type DemoGoodTimeKind = 'yes' | 'callback' | 'declined';

export const DEMO_CHECK_LINE_EN = 'Let me check the calendar for that.';
export const DEMO_CHECK_LINE_HI = 'ज़रा कैलेंडर चेक कर लेती हूँ।';
export const DEMO_BOOK_LINE_EN = 'Booking that now.';
export const DEMO_BOOK_LINE_HI = 'वही स्लॉट बुक कर लेती हूँ।';
export const DEMO_ASK_WHEN_LINE_EN = 'When works for a 30-minute demo?';
export const DEMO_ASK_WHEN_LINE_HI = 'डेमो के लिए कौन सा समय ठीक रहेगा?';
export const DEMO_CALLBACK_LINE_EN = 'No problem — when should I call back?';
export const DEMO_CALLBACK_LINE_HI = 'कोई बात नहीं — कब वापस कॉल करूँ?';

export function isOutboundDemoBooking(meta: AgentJobMetadata): boolean {
  return meta.task === 'demo_booking' && meta.direction === 'outbound';
}

export function isOutboundDemoPipeline(meta: AgentJobMetadata): boolean {
  return isOutboundDemoBooking(meta) && !isRealtimeLlmModel(meta.model);
}

export function demoCheckLine(meta: AgentJobMetadata): string {
  return personaSpeaksHindi(meta) ? DEMO_CHECK_LINE_HI : DEMO_CHECK_LINE_EN;
}

export function demoBookLine(meta: AgentJobMetadata): string {
  return personaSpeaksHindi(meta) ? DEMO_BOOK_LINE_HI : DEMO_BOOK_LINE_EN;
}

export function demoAskWhenLine(meta: AgentJobMetadata): string {
  return personaSpeaksHindi(meta) ? DEMO_ASK_WHEN_LINE_HI : DEMO_ASK_WHEN_LINE_EN;
}

export function demoCallbackLine(meta: AgentJobMetadata): string {
  return personaSpeaksHindi(meta) ? DEMO_CALLBACK_LINE_HI : DEMO_CALLBACK_LINE_EN;
}

/** Phrases to REST-warm before pickup (exact strings sayCached will play). */
export function demoBookingCacheLines(meta: AgentJobMetadata): string[] {
  return [
    demoCheckLine(meta),
    demoBookLine(meta),
    demoAskWhenLine(meta),
    demoCallbackLine(meta),
  ];
}

export function resolveDemoScriptStep(
  userData: { demoScriptStep?: DemoScriptStep },
): DemoScriptStep {
  return userData.demoScriptStep ?? 'good_time';
}

/**
 * High-confidence good-time tokens only. A real datetime stays null so the
 * LLM + calendar tool own that turn.
 */
export function classifyDemoGoodTime(
  userText: string | null | undefined,
  options: ClassifyUserTurnOptions = {},
): DemoGoodTimeKind | null {
  const raw = (userText ?? '').trim();
  if (!raw || isUnusableUserTurn(raw)) {
    return null;
  }
  if (isDeclinedDemo(raw)) {
    return 'declined';
  }
  if (isCallbackDemo(raw)) {
    return 'callback';
  }
  const kind = classifyUserTurn(raw, options);
  if (kind === 'yes') {
    return 'yes';
  }
  if (kind === 'no') {
    return 'callback';
  }
  return null;
}

function isDeclinedDemo(raw: string): boolean {
  return /not interested|don't want|do not want|no thanks|no thank you|stop calling|don't call|नहीं चाहिए|नही चाहिए|nahi chahiye|मत करना|जरूरत नहीं|ज़रूरत नहीं/i.test(
    raw,
  );
}

function isCallbackDemo(raw: string): boolean {
  return /call back|callback|call me later|busy|later|not a good time|अभी व्यस्त|व्यस्त हूँ|व्यस्त हूं|बाद में|अभी नहीं|कल कॉल|वापस कॉल/i.test(
    raw,
  );
}
