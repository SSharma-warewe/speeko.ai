import {
  generateVerifyToken,
  hashVerifyToken,
  verifyTokenMatches,
  verifyTokenPrefixFrom,
} from '../verify-token.util';

describe('verify-token.util', () => {
  it('1. generateVerifyToken returns wa_ token, prefix, and 64-char hash', () => {
    const generated = generateVerifyToken();

    expect(generated.verifyToken.startsWith('wa_')).toBe(true);
    expect(generated.verifyToken.length).toBeGreaterThan(16);
    expect(generated.verifyTokenHash).toHaveLength(64);
    expect(generated.verifyTokenPrefix).toBe(
      verifyTokenPrefixFrom(generated.verifyToken),
    );
    expect(generated.verifyTokenHash).toBe(
      hashVerifyToken(generated.verifyToken),
    );
  });

  it('2. each generateVerifyToken call is unique', () => {
    const a = generateVerifyToken();
    const b = generateVerifyToken();

    expect(a.verifyToken).not.toBe(b.verifyToken);
    expect(a.verifyTokenHash).not.toBe(b.verifyTokenHash);
  });

  it('3. verifyTokenMatches accepts the matching token and rejects others', () => {
    const generated = generateVerifyToken();

    expect(verifyTokenMatches(generated.verifyToken, generated.verifyTokenHash)).toBe(
      true,
    );
    expect(verifyTokenMatches('wa_wrong', generated.verifyTokenHash)).toBe(false);
    expect(verifyTokenMatches(generated.verifyToken, '0'.repeat(64))).toBe(false);
    expect(verifyTokenMatches('', generated.verifyTokenHash)).toBe(false);
    expect(verifyTokenMatches(generated.verifyToken, 'short')).toBe(false);
  });

  it('4. verifyTokenPrefixFrom uses first 8 chars plus ellipsis', () => {
    expect(verifyTokenPrefixFrom('wa_abcd1234xyz')).toBe('wa_abcd1…');
    expect(verifyTokenPrefixFrom('shortky')).toBe('shor…');
    expect(verifyTokenPrefixFrom('  wa_abcd1234  ')).toBe('wa_abcd1…');
  });
});
