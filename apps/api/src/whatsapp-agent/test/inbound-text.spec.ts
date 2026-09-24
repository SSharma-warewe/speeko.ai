import {
  listInboundTextMessages,
  phoneNumberIdFromMessagesUrl,
} from '../lib/inbound-text';

const PHONE_ID = '106540352242922';

function textPayload(overrides?: {
  type?: string;
  body?: string;
  from?: string;
  id?: string;
  phoneNumberId?: string | number | null;
}) {
  const message: Record<string, unknown> = {
    from: overrides?.from ?? '919876543210',
    id: overrides?.id ?? 'wamid.1',
    type: overrides?.type ?? 'text',
    text: { body: overrides?.body ?? 'Hi' },
  };
  if (overrides && 'id' in overrides && overrides.id === undefined) {
    delete message.id;
  }
  return {
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata:
                overrides?.phoneNumberId === null
                  ? {}
                  : {
                      phone_number_id:
                        overrides?.phoneNumberId ?? PHONE_ID,
                    },
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

describe('inbound WhatsApp text', () => {
  it('reads a text message and the phone number id on the messages URL', () => {
    expect(listInboundTextMessages(textPayload())).toEqual([
      {
        id: 'wamid.1',
        from: '919876543210',
        body: 'Hi',
        phoneNumberId: PHONE_ID,
      },
    ]);
    expect(
      phoneNumberIdFromMessagesUrl(
        `https://graph.facebook.com/v25.0/${PHONE_ID}/messages`,
      ),
    ).toBe(PHONE_ID);
  });

  it('skips status callbacks, non-text, empty bodies, and messages without an id', () => {
    expect(
      listInboundTextMessages({
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: { statuses: [{ id: 'wamid.status', status: 'sent' }] },
              },
            ],
          },
        ],
      }),
    ).toEqual([]);
    expect(listInboundTextMessages(textPayload({ type: 'image' }))).toEqual(
      [],
    );
    expect(listInboundTextMessages(textPayload({ body: '  ' }))).toEqual([]);
    expect(listInboundTextMessages(textPayload({ id: undefined }))).toEqual(
      [],
    );
    expect(phoneNumberIdFromMessagesUrl('https://example.com/messages')).toBe(
      null,
    );
  });
});
