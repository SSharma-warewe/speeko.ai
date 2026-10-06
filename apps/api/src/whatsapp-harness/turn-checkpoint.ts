import { z } from 'zod';
import type { WhatsAppTurnCheckpoint } from '@call-agent/contracts';
const sessionSchema = z
  .object({
    state: z.record(z.unknown()),
    events: z.array(z.record(z.unknown())).max(2000),
  })
  .strict();
export const checkpointSchema = z.object({
  session: sessionSchema,
  reply: z.string().trim().min(1).max(4096).optional(),
  completion: z
    .object({
      outcome: z.string().min(1).max(64),
      fields: z.record(z.unknown()),
      evidence: z.string().min(1).max(4096).optional(),
    })
    .strict()
    .optional(),
  decline: z
    .object({ evidence: z.string().trim().min(1).max(4096) })
    .strict()
    .optional(),
});

export function stripThoughts(checkpoint: WhatsAppTurnCheckpoint) {
  for (const event of checkpoint.session.events) {
    const content = event.content as
      { parts?: Array<{ thought?: boolean }> } | undefined;
    if (Array.isArray(content?.parts))
      content.parts = content.parts.filter((part) => part && !part.thought);
  }
  return checkpoint;
}
