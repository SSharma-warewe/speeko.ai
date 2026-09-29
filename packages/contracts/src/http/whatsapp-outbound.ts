/** Contact fields a template variable may be mapped to. */
export const WHATSAPP_CONTACT_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'phone',
  'email',
  'company',
] as const;
export type WhatsAppContactField = (typeof WHATSAPP_CONTACT_FIELDS)[number];

export type WhatsAppTemplateVariable = {
  /** `1`, `2`, … for positional templates or the `{{name}}` for named ones. */
  key: string;
  /** Example value from Meta (for preview), if any. */
  example: string | null;
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  parameterFormat: 'POSITIONAL' | 'NAMED';
  /** Body text with `{{…}}` placeholders. */
  bodyText: string;
  bodyVariables: WhatsAppTemplateVariable[];
  /** Dynamic suffix variable of a URL button (index 0), if any. */
  urlButtonVariable: boolean;
  urlButtonIndex: number | null;
  /** True when the template can be sent by this platform. */
  sendable: boolean;
  /** Why it is not sendable (e.g. media header). */
  unsendableReason: string | null;
};

export type WhatsAppTemplatesResponse = {
  templates: WhatsAppTemplate[];
};

export type GhlContactRow = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  dnd: boolean;
};

export type GhlContactsResponse = {
  contacts: GhlContactRow[];
  /** Opaque cursor for the next page; null when there is no more. */
  nextCursor: string | null;
  total: number | null;
};

/** How one template variable is filled per recipient. */
export type WhatsAppVariableSource =
  | { type: 'field'; field: WhatsAppContactField }
  | { type: 'text'; text: string };

export type SendWhatsAppRecipient = {
  ghlContactId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
  company?: string;
  dnd?: boolean;
};

export type SendWhatsAppTemplateRequest = {
  templateName: string;
  language: string;
  /** Body variables keyed by variable key (`1`, `2`, `first_name`). */
  bodyVariables?: Record<string, WhatsAppVariableSource>;
  /** Source for the URL button suffix variable, when the template has one. */
  urlButtonVariable?: WhatsAppVariableSource;
  recipients: SendWhatsAppRecipient[];
};

export type WhatsAppOutboundStatus = 'sent' | 'failed' | 'skipped';

export type WhatsAppOutboundResult = {
  name: string | null;
  phone: string;
  ghlContactId: string | null;
  status: WhatsAppOutboundStatus;
  wamid: string | null;
  error: string | null;
};

export type SendWhatsAppTemplateResponse = {
  batchKey: string;
  sent: number;
  failed: number;
  skipped: number;
  results: WhatsAppOutboundResult[];
};

export type WhatsAppOutboundMessage = {
  id: string;
  batchKey: string;
  contactName: string | null;
  phone: string;
  ghlContactId: string | null;
  templateName: string;
  language: string;
  status: WhatsAppOutboundStatus;
  wamid: string | null;
  error: string | null;
  createdAt: string;
};
