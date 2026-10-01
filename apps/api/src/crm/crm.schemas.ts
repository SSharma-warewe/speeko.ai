import { z } from 'zod';
import type { CrmAction } from '@call-agent/contracts';

const id = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().trim().max(255);
const date = z.string().datetime({ offset: true });
const page = {
  query: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().max(500).optional(),
};
const contact = z
  .object({
    firstName: text.optional(),
    lastName: text.optional(),
    email: z.union([z.string().email().max(255), z.literal('')]).optional(),
    phone: text.optional(),
    companyName: text.optional(),
    address1: text.optional(),
    city: text.optional(),
    state: text.optional(),
    postalCode: text.optional(),
    country: z.string().length(2).optional(),
    timezone: text.optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    dnd: z.boolean().optional(),
    customFields: z
      .array(
        z
          .object({
            id,
            fieldValue: z.union([
              z.string().max(5000),
              z.number(),
              z.boolean(),
              z.array(text).max(100),
            ]),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict();
const task = z
  .object({
    title: text.min(1),
    body: z.string().max(5000).optional(),
    dueDate: date,
    completed: z.boolean(),
    assignedTo: id.optional(),
  })
  .strict();
const event = z
  .object({
    calendarId: id,
    contactId: id,
    title: text.min(1),
    startTime: date,
    endTime: date,
    appointmentStatus: z
      .enum(['new', 'confirmed', 'cancelled', 'showed', 'noshow', 'completed'])
      .default('confirmed'),
    description: z.string().max(5000).optional(),
  })
  .strict()
  .refine(
    (p) => Date.parse(p.endTime) > Date.parse(p.startTime),
    'End must be after start',
  );
const eventUpdate = z
  .object({
    calendarId: id.optional(),
    title: text.min(1).optional(),
    startTime: date.optional(),
    endTime: date.optional(),
    appointmentStatus: z
      .enum(['new', 'confirmed', 'cancelled', 'showed', 'noshow', 'completed'])
      .optional(),
    description: z.string().max(5000).optional(),
  })
  .strict()
  .refine(
    (p) =>
      !(p.startTime && p.endTime) ||
      Date.parse(p.endTime) > Date.parse(p.startTime),
    'End must be after start',
  );
const opportunity = z
  .object({
    name: text.min(1),
    pipelineId: id,
    pipelineStageId: id,
    contactId: id,
    status: z.enum(['open', 'won', 'lost', 'abandoned']),
    monetaryValue: z.number().finite().nonnegative().max(1e12).default(0),
  })
  .strict();
const range = { calendarId: id, startTime: date, endTime: date };
const rangeSchema = z
  .object(range)
  .strict()
  .refine((p) => {
    const days = (Date.parse(p.endTime) - Date.parse(p.startTime)) / 86400000;
    return days > 0 && days <= 31;
  }, 'Choose a date range of up to 31 days');
const empty = z.object({}).strict();

export const CRM_SCHEMAS: Record<CrmAction, z.ZodTypeAny> = {
  'contacts.list': z.object(page).strict(),
  'contacts.get': z.object({ id }).strict(),
  'contacts.create': z
    .object({
      data: contact.refine(
        (p) => Boolean(p.email || p.phone),
        'Email or phone is required',
      ),
    })
    .strict(),
  'contacts.update': z.object({ id, data: contact }).strict(),
  'contacts.delete': z.object({ id }).strict(),
  'notes.list': z.object({ contactId: id }).strict(),
  'notes.create': z
    .object({
      contactId: id,
      data: z.object({ body: z.string().trim().min(1).max(10000) }).strict(),
    })
    .strict(),
  'notes.update': z
    .object({
      contactId: id,
      id,
      data: z.object({ body: z.string().trim().min(1).max(10000) }).strict(),
    })
    .strict(),
  'notes.delete': z.object({ contactId: id, id }).strict(),
  'tasks.list': z.object({ contactId: id }).strict(),
  'tasks.create': z.object({ contactId: id, data: task }).strict(),
  'tasks.update': z.object({ contactId: id, id, data: task }).strict(),
  'tasks.delete': z.object({ contactId: id, id }).strict(),
  'calendars.list': empty,
  'events.list': rangeSchema,
  'slots.list': z
    .object({ ...range, timezone: text.min(1) })
    .strict()
    .refine(
      (p) =>
        Date.parse(p.endTime) > Date.parse(p.startTime) &&
        Date.parse(p.endTime) - Date.parse(p.startTime) <= 31 * 86400000,
      'Choose a date range of up to 31 days',
    ),
  'events.create': z.object({ data: event }).strict(),
  'events.update': z.object({ id, data: eventUpdate }).strict(),
  'events.delete': z.object({ id }).strict(),
  'pipelines.list': empty,
  'opportunities.list': z
    .object({
      ...page,
      query: z.string().trim().max(75).optional(),
      page: z.number().int().min(1).max(10000).default(1),
      pipelineId: id.optional(),
      status: z.enum(['open', 'won', 'lost', 'abandoned', 'all']).optional(),
    })
    .strict(),
  'opportunities.create': z.object({ data: opportunity }).strict(),
  'opportunities.update': z
    .object({ id, data: opportunity.omit({ contactId: true }).partial() })
    .strict(),
  'opportunities.delete': z.object({ id }).strict(),
  'conversations.list': z.object(page).strict(),
  'messages.list': z
    .object({ id, limit: page.limit, cursor: id.optional() })
    .strict(),
  'messages.send': z
    .object({
      contactId: id,
      data: z
        .object({
          type: z.enum(['SMS', 'WhatsApp']),
          message: z.string().trim().min(1).max(5000),
        })
        .strict(),
    })
    .strict(),
  'workflows.list': empty,
  'workflows.enroll': z.object({ contactId: id, id }).strict(),
  'workflows.remove': z.object({ contactId: id, id }).strict(),
  'tags.list': empty,
  'fields.list': empty,
  'users.list': empty,
};
