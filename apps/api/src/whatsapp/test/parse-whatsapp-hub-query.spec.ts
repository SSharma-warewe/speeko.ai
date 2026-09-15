import { parseWhatsAppHubQuery } from '../lib/parse-whatsapp-hub-query';

describe('parseWhatsAppHubQuery', () => {
  it('1. reads dotted hub.* keys (Express 5 simple parser / Meta GET)', () => {
    expect(
      parseWhatsAppHubQuery({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wa_secret',
        'hub.challenge': '1158201444',
      }),
    ).toEqual({
      mode: 'subscribe',
      token: 'wa_secret',
      challenge: '1158201444',
    });
  });

  it('2. reads nested hub object (extended query parser)', () => {
    expect(
      parseWhatsAppHubQuery({
        hub: {
          mode: 'subscribe',
          verify_token: 'wa_secret',
          challenge: 1158201444,
        },
      }),
    ).toEqual({
      mode: 'subscribe',
      token: 'wa_secret',
      challenge: '1158201444',
    });
  });

  it('3. prefers nested hub when both shapes are present', () => {
    expect(
      parseWhatsAppHubQuery({
        hub: { mode: 'subscribe', verify_token: 'nested', challenge: '1' },
        'hub.mode': 'other',
        'hub.verify_token': 'dotted',
        'hub.challenge': '2',
      }),
    ).toEqual({ mode: 'subscribe', token: 'nested', challenge: '1' });
  });

  it('4. uses the first value when Express repeats a key', () => {
    expect(
      parseWhatsAppHubQuery({
        'hub.mode': ['subscribe', 'unsubscribe'],
        'hub.verify_token': ['wa_a', 'wa_b'],
        'hub.challenge': ['99'],
      }),
    ).toEqual({ mode: 'subscribe', token: 'wa_a', challenge: '99' });
  });

  it('5. returns empty fields for missing or non-object query', () => {
    expect(parseWhatsAppHubQuery(undefined)).toEqual({});
    expect(parseWhatsAppHubQuery(null)).toEqual({});
    expect(parseWhatsAppHubQuery('hub.mode=subscribe')).toEqual({});
    expect(parseWhatsAppHubQuery({})).toEqual({
      mode: undefined,
      token: undefined,
      challenge: undefined,
    });
  });
});
