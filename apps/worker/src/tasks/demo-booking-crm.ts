import type { AgentJobMetadata } from '@call-agent/contracts';
import { TOOL_IDS } from '../tools/tool-ids.js';
import { callCalendarApi } from '../tools/calendar-api-client.js';
import type { SessionUserData } from '../tools/types.js';
import { contextField, displayNameFromContext } from './context-format.js';
import { isOutboundDemoBooking } from './demo-booking-tracks.js';

/**
 * Fire-and-forget GHL lookup/upsert for outbound demo. Schedule awaits
 * `userData.crmPrefetch` so booking still has a contact id.
 */
export function startDemoCrmPrefetch(
  meta: AgentJobMetadata,
  userData: SessionUserData,
): void {
  if (!shouldPrefetchDemoCrm(meta, userData)) {
    return;
  }
  console.log(
    `[agent] demo crm prefetch start callId=${userData.callId ?? 'n/a'}`,
  );
  enqueueDemoCrm(userData, () => prefetchDemoBookingCrm(meta, userData));
}

export function shouldPrefetchDemoCrm(
  meta: AgentJobMetadata,
  userData: SessionUserData,
): boolean {
  if (!isOutboundDemoBooking(meta)) {
    return false;
  }
  if (readGhlContactId(userData)) {
    return false;
  }
  if (!hasGhlCrmTools(meta)) {
    return false;
  }
  if (!userData.callId) {
    return false;
  }
  return Boolean(demoCrmEmail(userData) || demoCrmPhone(userData));
}

export function enqueueDemoCrm(
  userData: SessionUserData,
  work: () => Promise<void>,
): void {
  const prev = userData.crmPrefetch ?? Promise.resolve();
  userData.crmPrefetch = prev.then(work).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[agent] demo crm background failed: ${message}`);
  });
}

export async function awaitDemoCrmPrefetch(
  userData: SessionUserData,
): Promise<void> {
  if (!userData.crmPrefetch) {
    return;
  }
  try {
    await userData.crmPrefetch;
  } catch {
    // Logged on enqueue.
  }
}

export function demoCrmAlreadySavedMessage(contactId: string): {
  ok: true;
  data: { found: true; contactId: string };
  message: string;
} {
  return {
    ok: true,
    data: { found: true, contactId },
    message:
      'Contact id is already on this call. Do not mention CRM. Proceed to check slots or book.',
  };
}

export function demoCrmPendingMessage(): {
  ok: true;
  pending: true;
  message: string;
} {
  return {
    ok: true,
    pending: true,
    message:
      'CRM update is running in the background. Do not mention CRM to the caller. Continue the conversation. schedule / create event waits for the contact id if needed.',
  };
}

export function readGhlContactId(
  userData: SessionUserData,
): string | undefined {
  return contextField(userData.context, 'ghlContactId');
}

async function prefetchDemoBookingCrm(
  meta: AgentJobMetadata,
  userData: SessionUserData,
): Promise<void> {
  const email = demoCrmEmail(userData);
  const phone = demoCrmPhone(userData);
  const ids = new Set(meta.enabledTools);

  if (ids.has(TOOL_IDS.lookupGhlContact)) {
    const found = await lookupDemoContact(userData, email, phone);
    if (found || !ids.has(TOOL_IDS.upsertGhlContact)) {
      return;
    }
  }
  if (ids.has(TOOL_IDS.upsertGhlContact)) {
    await upsertDemoContact(userData, email, phone);
  }
}

async function lookupDemoContact(
  userData: SessionUserData,
  email: string | undefined,
  phone: string | undefined,
): Promise<boolean> {
  const body: Record<string, unknown> = {};
  if (email) body.participantEmail = email;
  if (phone) body.phone = phone;
  const result = await callCalendarApi(
    userData.callId,
    'contacts/lookup',
    body,
    {
      userData,
      toolId: 'lookupGhlContact',
      namespace: 'ghl-calendar',
    },
  );
  const contactId = readContactId(result.data);
  if (result.ok && result.data && isFound(result.data) && contactId) {
    userData.context.ghlContactId = contactId;
    return true;
  }
  return false;
}

async function upsertDemoContact(
  userData: SessionUserData,
  email: string | undefined,
  phone: string | undefined,
): Promise<void> {
  const name = displayNameFromContext(userData.context);
  const body: Record<string, unknown> = {};
  if (name) body.participantName = name;
  if (email) body.participantEmail = email;
  if (phone) body.phone = phone;
  const company = contextField(userData.context, 'company', 'companyName');
  if (company) body.company = company;
  const result = await callCalendarApi(userData.callId, 'contacts', body, {
    userData,
    toolId: 'upsertGhlContact',
    namespace: 'ghl-calendar',
  });
  const contactId = readContactId(result.data);
  if (result.ok && contactId) {
    userData.context.ghlContactId = contactId;
  }
}

function hasGhlCrmTools(meta: AgentJobMetadata): boolean {
  const ids = new Set(meta.enabledTools);
  return (
    ids.has(TOOL_IDS.lookupGhlContact) || ids.has(TOOL_IDS.upsertGhlContact)
  );
}

function demoCrmEmail(userData: SessionUserData): string | undefined {
  return contextField(userData.context, 'email', 'participantEmail');
}

function demoCrmPhone(userData: SessionUserData): string | undefined {
  return contextField(userData.context, 'phone', 'phoneNumber');
}

function isFound(data: unknown): boolean {
  return (
    !!data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    (data as { found?: unknown }).found === true
  );
}

function readContactId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  const id = (data as { contactId?: unknown }).contactId;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}
