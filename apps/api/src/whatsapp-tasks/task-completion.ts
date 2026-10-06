import {
  whatsAppCompletionErrors,
  type WhatsAppSessionSnapshot,
  type WhatsAppTaskCompletion,
  type WhatsAppTaskDefinition,
} from '@call-agent/contracts';
import { isExplicitBookingDecline } from '../whatsapp-harness/task-decline';

export function explicitTaskRefusal(
  body: string,
  evidence: string,
  session: WhatsAppSessionSnapshot,
): boolean {
  if (isExplicitBookingDecline(body, evidence, session)) return true;
  const quote = evidence.trim().toLowerCase();
  if (!quote || !body.toLowerCase().includes(quote)) return false;
  // A fragment such as "stop" inside a hypothetical question is not refusal.
  if (body.trim().toLowerCase() !== quote) return false;
  if (/\b(?:do not|don't|don’t)\s+(?:stop|cancel)\b/.test(body.toLowerCase()))
    return false;
  return /^(?:please\s+)?(?:stop(?: messaging| asking| contacting me)?|cancel(?: this| the task| this conversation)?|leave me alone|not interested|बस करो|बंद करो)[.!\s]*$/i.test(
    quote,
  );
}
export function validateTaskCompletion(
  definition: WhatsAppTaskDefinition,
  completion: WhatsAppTaskCompletion,
  body: string,
  session: WhatsAppSessionSnapshot,
  receipt: Record<string, unknown> | null,
): string[] {
  return whatsAppCompletionErrors(
    definition,
    completion,
    body,
    receipt,
    explicitTaskRefusal(body, completion.evidence ?? '', session),
  );
}
