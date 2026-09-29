import type {
  WhatsAppTemplate,
  WhatsAppTemplateVariable,
} from '@call-agent/contracts';
import type {
  MetaTemplate,
  MetaTemplateButton,
  MetaTemplateComponent,
} from '../../meta-whatsapp/meta-whatsapp.client';

const NAMED_VAR = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;
const POSITIONAL_VAR = /\{\{\s*(\d+)\s*\}\}/g;

function findComponent(
  components: MetaTemplateComponent[],
  type: string,
): MetaTemplateComponent | undefined {
  return components.find((c) => c.type?.toUpperCase() === type);
}

function uniqueMatches(text: string, re: RegExp): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const key = m[1];
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/** Variable keys in a text (`1`, `2` or `first_name`), in order of first use. */
export function extractVariableKeys(
  text: string,
  format: 'POSITIONAL' | 'NAMED',
): string[] {
  if (format === 'NAMED') return uniqueMatches(text, NAMED_VAR);
  return uniqueMatches(text, POSITIONAL_VAR).sort(
    (a, b) => Number(a) - Number(b),
  );
}

function bodyExamples(
  body: MetaTemplateComponent | undefined,
  format: 'POSITIONAL' | 'NAMED',
): Map<string, string> {
  const out = new Map<string, string>();
  const example = body?.example;
  if (!example || typeof example !== 'object') return out;
  if (format === 'NAMED') {
    const named = (example as { body_text_named_params?: unknown })
      .body_text_named_params;
    if (Array.isArray(named)) {
      for (const item of named) {
        const p = item as { param_name?: unknown; example?: unknown };
        if (typeof p.param_name === 'string' && typeof p.example === 'string') {
          out.set(p.param_name, p.example);
        }
      }
    }
    return out;
  }
  const rows = (example as { body_text?: unknown }).body_text;
  const first = Array.isArray(rows) ? rows[0] : undefined;
  if (Array.isArray(first)) {
    first.forEach((value: unknown, i: number) => {
      if (typeof value === 'string') out.set(String(i + 1), value);
    });
  }
  return out;
}

type ButtonScan = {
  urlVariableIndex: number | null;
  dynamicUrlButtons: number;
  unsupported: string | null;
};

const UNSUPPORTED_BUTTONS = new Set([
  'COPY_CODE',
  'OTP',
  'FLOW',
  'MPM',
  'SPM',
  'CATALOG',
  'ORDER_DETAILS',
]);

function scanButtons(components: MetaTemplateComponent[]): ButtonScan {
  const buttons: MetaTemplateButton[] =
    findComponent(components, 'BUTTONS')?.buttons ?? [];
  const scan: ButtonScan = {
    urlVariableIndex: null,
    dynamicUrlButtons: 0,
    unsupported: null,
  };
  buttons.forEach((button, index) => {
    const type = button.type?.toUpperCase() ?? '';
    if (UNSUPPORTED_BUTTONS.has(type)) {
      scan.unsupported = `Buttons of type ${type} are not supported yet.`;
      return;
    }
    if (type === 'URL' && typeof button.url === 'string') {
      if (/\{\{\s*\d+\s*\}\}/.test(button.url)) {
        scan.dynamicUrlButtons += 1;
        if (scan.urlVariableIndex === null) scan.urlVariableIndex = index;
      }
    }
  });
  if (scan.dynamicUrlButtons > 1) {
    scan.unsupported = 'Templates with more than one dynamic URL button are not supported yet.';
  }
  return scan;
}

function unsendableReason(
  template: MetaTemplate,
  components: MetaTemplateComponent[],
  scan: ButtonScan,
): string | null {
  if (template.status !== 'APPROVED') {
    return `Template status is ${template.status || 'unknown'} (only APPROVED can be sent).`;
  }
  if (template.category === 'AUTHENTICATION') {
    return 'Authentication templates carry one-time codes and are not sent from here.';
  }
  const body = findComponent(components, 'BODY');
  if (!body || typeof body.text !== 'string') {
    return 'Template has no text body.';
  }
  const header = findComponent(components, 'HEADER');
  if (header) {
    const format = header.format?.toUpperCase() ?? 'TEXT';
    if (format !== 'TEXT') {
      return `Templates with a ${format.toLowerCase()} header are not supported yet.`;
    }
    if (typeof header.text === 'string' && /\{\{/.test(header.text)) {
      return 'Templates with header variables are not supported yet.';
    }
  }
  for (const c of components) {
    const type = c.type?.toUpperCase() ?? '';
    if (
      type === 'CAROUSEL' ||
      type === 'LIMITED_TIME_OFFER' ||
      type === 'ALBUM' ||
      type === 'GREETING'
    ) {
      return `Templates with a ${type.toLowerCase().replace(/_/g, ' ')} component are not supported yet.`;
    }
  }
  return scan.unsupported;
}

/** Convert a Meta template into the portal-facing shape (variables + sendability). */
export function toWhatsAppTemplate(template: MetaTemplate): WhatsAppTemplate {
  const components = template.components ?? [];
  const parameterFormat: 'POSITIONAL' | 'NAMED' =
    template.parameter_format?.toUpperCase() === 'NAMED'
      ? 'NAMED'
      : 'POSITIONAL';
  const body = findComponent(components, 'BODY');
  const bodyText = typeof body?.text === 'string' ? body.text : '';
  const examples = bodyExamples(body, parameterFormat);
  const bodyVariables: WhatsAppTemplateVariable[] = extractVariableKeys(
    bodyText,
    parameterFormat,
  ).map((key) => ({ key, example: examples.get(key) ?? null }));
  const scan = scanButtons(components);
  const reason = unsendableReason(template, components, scan);
  return {
    id: template.id,
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    parameterFormat,
    bodyText,
    bodyVariables,
    urlButtonVariable: scan.urlVariableIndex !== null && scan.dynamicUrlButtons === 1,
    urlButtonIndex: scan.dynamicUrlButtons === 1 ? scan.urlVariableIndex : null,
    sendable: reason === null,
    unsendableReason: reason,
  };
}
