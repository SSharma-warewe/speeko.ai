import type {
  SendWhatsAppRecipient,
  WhatsAppContactField,
  WhatsAppTemplate,
  WhatsAppVariableSource,
} from '@call-agent/contracts';

/** Meta rejects newlines, tabs, and 4+ consecutive spaces in template params. */
export function sanitizeTemplateParam(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim()
    .slice(0, 1024);
}

export function recipientFieldValue(
  recipient: SendWhatsAppRecipient,
  field: WhatsAppContactField,
): string {
  const first = recipient.firstName?.trim() ?? '';
  const last = recipient.lastName?.trim() ?? '';
  switch (field) {
    case 'firstName':
      return first || (recipient.name?.trim().split(/\s+/)[0] ?? '');
    case 'lastName':
      return last;
    case 'fullName':
      return (
        recipient.name?.trim() || [first, last].filter(Boolean).join(' ')
      );
    case 'phone':
      return recipient.phone.trim();
    case 'email':
      return recipient.email?.trim() ?? '';
    case 'company':
      return recipient.company?.trim() ?? '';
  }
}

export function resolveSource(
  source: WhatsAppVariableSource,
  recipient: SendWhatsAppRecipient,
): string {
  const raw =
    source.type === 'text'
      ? source.text
      : recipientFieldValue(recipient, source.field);
  return sanitizeTemplateParam(raw);
}

export type BuiltComponents =
  | { ok: true; components: unknown[] }
  | { ok: false; error: string };

/**
 * Build the Cloud API `components` for one recipient. Any variable that
 * resolves to empty text fails the recipient (Meta rejects empty params).
 */
export function buildTemplateComponents(
  template: WhatsAppTemplate,
  bodyVariables: Record<string, WhatsAppVariableSource>,
  urlButtonVariable: WhatsAppVariableSource | undefined,
  recipient: SendWhatsAppRecipient,
): BuiltComponents {
  const components: unknown[] = [];

  if (template.bodyVariables.length > 0) {
    const parameters: unknown[] = [];
    for (const variable of template.bodyVariables) {
      const source = bodyVariables[variable.key];
      const text = source ? resolveSource(source, recipient) : '';
      if (!text) {
        return {
          ok: false,
          error: `No value for {{${variable.key}}} on this contact.`,
        };
      }
      parameters.push(
        template.parameterFormat === 'NAMED'
          ? { type: 'text', parameter_name: variable.key, text }
          : { type: 'text', text },
      );
    }
    components.push({ type: 'body', parameters });
  }

  if (template.urlButtonVariable && template.urlButtonIndex !== null) {
    const text = urlButtonVariable
      ? resolveSource(urlButtonVariable, recipient)
      : '';
    if (!text) {
      return { ok: false, error: 'No value for the URL button variable.' };
    }
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(template.urlButtonIndex),
      parameters: [{ type: 'text', text }],
    });
  }

  return { ok: true, components };
}
