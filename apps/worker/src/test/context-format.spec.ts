import { displayNameFromContext } from '../tasks/context-format';

describe('displayNameFromContext', () => {
  it('prefers customerName', () => {
    expect(
      displayNameFromContext({
        customerName: 'Ada Lovelace',
        firstName: 'Ada',
      }),
    ).toBe('Ada Lovelace');
  });

  it('joins first + last when no full name', () => {
    expect(
      displayNameFromContext({ firstName: 'Ada', last_name: 'Lovelace' }),
    ).toBe('Ada Lovelace');
  });

  it('returns undefined when empty', () => {
    expect(displayNameFromContext(undefined)).toBeUndefined();
    expect(displayNameFromContext({})).toBeUndefined();
  });
});
