import { z } from 'zod';
import {
  WHATSAPP_AGENT_TOOL_IDS,
  WHATSAPP_TASK_KEYS,
  isWhatsAppTaskSnapshot,
} from '@call-agent/contracts';
const snapshot = z.object({
  state: z.record(z.unknown()),
  events: z.array(z.record(z.unknown())),
});
export const turnSchema = z
  .object({
    taskProtocolVersion: z.literal(2).optional(),
    sandbox: z.literal(true).optional(),
    task: z
      .object({
        sessionId: z.string().uuid(),
        key: z.enum([...WHATSAPP_TASK_KEYS, 'configured']),
        version: z.number().int().nonnegative(),
        objective: z.string().min(1).max(20000),
        completionRule: z.enum(['ghl_appointment_created', 'configured']),
        snapshot: z
          .custom<import('@call-agent/contracts').WhatsAppTaskSnapshot>(
            isWhatsAppTaskSnapshot,
          )
          .optional(),
        context: z.record(z.unknown()).optional(),
        status: z.enum(['active', 'completed', 'cancelled']),
        result: z.record(z.unknown()).nullable(),
      })
      .nullable(),
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    generation: z.number().int().positive(),
    leaseToken: z.string().uuid(),
    sender: z.string().regex(/^\d{6,20}$/),
    body: z.string().min(1).max(4096),
    prompt: z.string().min(1).max(20_000),
    enabledTools: z.array(z.enum(WHATSAPP_AGENT_TOOL_IDS)),
    session: snapshot,
    checkpoint: z
      .object({
        session: snapshot,
        reply: z.string().max(4096).optional(),
        completion: z
          .object({
            outcome: z.string().min(1).max(64),
            fields: z.record(z.unknown()),
            evidence: z.string().min(1).max(4096).optional(),
          })
          .strict()
          .optional(),
        decline: z.object({ evidence: z.string().min(1).max(4096) }).optional(),
      })
      .nullable(),
  })
  .superRefine((turn, ctx) => {
    const task = turn.task;
    if (task?.key === 'configured') {
      if (
        !task.snapshot ||
        task.completionRule !== 'configured' ||
        turn.taskProtocolVersion !== 2 ||
        task.version !== task.snapshot.version ||
        (task.status === 'active' &&
          task.snapshot.definition.toolIds.some(
            (id) => !turn.enabledTools.includes(id),
          )) ||
        (task.status !== 'active' && !turn.checkpoint?.reply)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid configurable task projection',
        });
      if (
        task.snapshot &&
        ((task.snapshot.version === 0) !== (turn.sandbox === true) ||
          turn.enabledTools.some(
            (id) => !task.snapshot!.definition.toolIds.includes(id),
          ))
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid snapshot purpose or capability',
        });
    } else if (
      task &&
      (task.snapshot ||
        task.version !== 1 ||
        task.completionRule !== 'ghl_appointment_created')
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid legacy task' });
  });
