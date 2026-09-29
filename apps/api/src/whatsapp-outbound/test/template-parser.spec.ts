import type { MetaTemplate } from '../../meta-whatsapp/meta-whatsapp.client';
import { buildTemplateComponents } from '../lib/build-components';
import { normalizeWhatsAppPhone } from '../lib/phone';
import { toWhatsAppTemplate } from '../lib/template-parser';

function tpl(over: Partial<MetaTemplate> = {}): MetaTemplate {
  return {
    id: 't1',
    name: 'reminder',
    language: 'en_US',
    category: 'UTILITY',
    status: 'APPROVED',
    components: [{ type: 'BODY', text: 'Hi {{1}}, see you at {{2}}.' }],
    ...over,
  };
}

describe('toWhatsAppTemplate', () => {
  it('parses positional body variables in numeric order with examples', () => {
    const t = toWhatsAppTemplate(
      tpl({
        components: [
          {
            type: 'BODY',
            text: 'Hi {{2}} and {{1}} and {{2}}',
            example: { body_text: [['Ada', '3pm']] },
          },
        ],
      }),
    );
    expect(t.parameterFormat).toBe('POSITIONAL');
    expect(t.bodyVariables).toEqual([
      { key: '1', example: 'Ada' },
      { key: '2', example: '3pm' },
    ]);
    expect(t.sendable).toBe(true);
  });

  it('parses named variables', () => {
    const t = toWhatsAppTemplate(
      tpl({
        parameter_format: 'NAMED',
        components: [
          {
            type: 'BODY',
            text: 'Hello {{first_name}}, {{offer}} awaits',
            example: {
              body_text_named_params: [
                { param_name: 'first_name', example: 'Ada' },
              ],
            },
          },
        ],
      }),
    );
    expect(t.parameterFormat).toBe('NAMED');
    expect(t.bodyVariables).toEqual([
      { key: 'first_name', example: 'Ada' },
      { key: 'offer', example: null },
    ]);
  });

  it('detects a single dynamic URL button and its index', () => {
    const t = toWhatsAppTemplate(
      tpl({
        components: [
          { type: 'BODY', text: 'Your code' },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Stop' },
              { type: 'URL', text: 'Open', url: 'https://x.io/{{1}}' },
            ],
          },
        ],
      }),
    );
    expect(t.urlButtonVariable).toBe(true);
    expect(t.urlButtonIndex).toBe(1);
    expect(t.sendable).toBe(true);
  });

  it.each([
    ['not approved', tpl({ status: 'PENDING' }), /PENDING/],
    ['authentication', tpl({ category: 'AUTHENTICATION' }), /Authentication/],
    [
      'media header',
      tpl({
        components: [
          { type: 'HEADER', format: 'IMAGE' },
          { type: 'BODY', text: 'x' },
        ],
      }),
      /image header/,
    ],
    [
      'header variables',
      tpl({
        components: [
          { type: 'HEADER', format: 'TEXT', text: 'Hi {{1}}' },
          { type: 'BODY', text: 'x' },
        ],
      }),
      /header variables/,
    ],
    [
      'copy code button',
      tpl({
        components: [
          { type: 'BODY', text: 'x' },
          { type: 'BUTTONS', buttons: [{ type: 'COPY_CODE' }] },
        ],
      }),
      /COPY_CODE/,
    ],
    ['no body', tpl({ components: [] }), /no text body/],
  ])('marks %s as not sendable', (_label, template, reason) => {
    const t = toWhatsAppTemplate(template);
    expect(t.sendable).toBe(false);
    expect(t.unsendableReason).toMatch(reason);
  });
});

describe('buildTemplateComponents', () => {
  const recipient = {
    phone: '+15550100',
    name: 'Ada Lovelace',
    firstName: 'Ada',
  };

  it('builds positional body params from contact fields and text', () => {
    const t = toWhatsAppTemplate(tpl());
    const built = buildTemplateComponents(
      t,
      {
        '1': { type: 'field', field: 'firstName' },
        '2': { type: 'text', text: '3pm\nsharp' },
      },
      undefined,
      recipient,
    );
    expect(built).toEqual({
      ok: true,
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Ada' },
            { type: 'text', text: '3pm sharp' },
          ],
        },
      ],
    });
  });

  it('adds parameter_name for named templates', () => {
    const t = toWhatsAppTemplate(
      tpl({
        parameter_format: 'NAMED',
        components: [{ type: 'BODY', text: 'Hi {{first_name}}' }],
      }),
    );
    const built = buildTemplateComponents(
      t,
      { first_name: { type: 'field', field: 'firstName' } },
      undefined,
      recipient,
    );
    expect(built).toMatchObject({
      ok: true,
      components: [
        {
          parameters: [
            { type: 'text', parameter_name: 'first_name', text: 'Ada' },
          ],
        },
      ],
    });
  });

  it('adds the URL button component with its index', () => {
    const t = toWhatsAppTemplate(
      tpl({
        components: [
          { type: 'BODY', text: 'Hello' },
          { type: 'BUTTONS', buttons: [{ type: 'URL', url: 'https://x/{{1}}' }] },
        ],
      }),
    );
    const built = buildTemplateComponents(
      t,
      {},
      { type: 'field', field: 'phone' },
      recipient,
    );
    expect(built).toEqual({
      ok: true,
      components: [
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: '+15550100' }],
        },
      ],
    });
  });

  it('fails the recipient when a variable resolves empty', () => {
    const t = toWhatsAppTemplate(tpl());
    const built = buildTemplateComponents(
      t,
      {
        '1': { type: 'field', field: 'company' },
        '2': { type: 'text', text: 'x' },
      },
      undefined,
      recipient,
    );
    expect(built).toEqual({
      ok: false,
      error: 'No value for {{1}} on this contact.',
    });
  });
});

describe('normalizeWhatsAppPhone', () => {
  it.each([
    ['+91 98765 43210', '91', '919876543210'],
    ['9876543210', '91', '919876543210'],
    ['09876543210', '91', '919876543210'],
    ['00919876543210', '91', '919876543210'],
    ['+1 (555) 010-0199', '91', '15550100199'],
    ['919876543210', '91', '919876543210'],
  ])('normalizes %s', (raw, cc, expected) => {
    expect(normalizeWhatsAppPhone(raw, cc)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '123', '+1234567890123456789'])(
    'rejects %j',
    (raw) => {
      expect(normalizeWhatsAppPhone(raw, '91')).toBeNull();
    },
  );
});
