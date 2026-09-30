import type { WhatsAppSessionSnapshot } from '@call-agent/contracts';

/** Require a literal quote from the current customer, never an LLM-only claim. */
export function isExplicitBookingDecline(
  body: string,
  evidence: string,
  session: WhatsAppSessionSnapshot,
): boolean {
  const quote = evidence.trim().toLowerCase();
  if (!quote || !body.toLowerCase().includes(quote)) return false;
  if (
    /\b(?:don['’]?t|do not|not)\s+(?:want\s+to\s+)?cancel\b/.test(
      body.toLowerCase(),
    )
  )
    return false;
  if (
    /\b(?:(?:don['’]?t|do not)\s+(?:want|need|wish|book|schedule)|not interested in (?:a |an |the |any )?(?:booking|appointment|meeting)|no need (?:for|to)|decline (?:the |a |an )?(?:booking|appointment|meeting)|cancel (?:the |my |this )?(?:booking|appointment|meeting))\b/.test(
      quote,
    ) &&
    /\b(?:book|booking|appointment|meeting|schedule)\b/.test(quote)
  )
    return true;
  if (
    /^(?:no(?: thanks| thank you)?|not now|maybe later|nahi|nahin)[.!\s]*$/.test(
      body.trim().toLowerCase(),
    )
  ) {
    // Short refusals must answer the latest agent booking invitation.
    const model = [...session.events]
      .reverse()
      .find(
        (event) =>
          (event.content as { role?: string } | undefined)?.role === 'model',
      );
    const parts =
      (model?.content as { parts?: { text?: string }[] } | undefined)?.parts ??
      [];
    const invitation = parts.map((part) => part.text ?? '').join(' ');
    return (
      /\b(?:book|schedule|appointment|meeting)\b/i.test(invitation) &&
      /\?/.test(invitation)
    );
  }
  return false;
}
