import {
  canonicalizeDestinationCountry,
  destinationCountryFromE164,
  normalizePhone,
} from '../lib/call-phone';

describe('call-phone', () => {
  it('maps +91 E.164 to LiveKit destinationCountry in (lowercase)', () => {
    expect(destinationCountryFromE164('+918852863728')).toBe('in');
    expect(destinationCountryFromE164('+91 8065179684')).toBe('in');
    expect(normalizePhone('8852863728')).toBe('+918852863728');
    expect(destinationCountryFromE164(normalizePhone('8852863728'))).toBe(
      'in',
    );
  });

  it('canonicalizes destination_country to lowercase ISO codes', () => {
    expect(canonicalizeDestinationCountry('IN')).toBe('in');
    expect(canonicalizeDestinationCountry(' in ')).toBe('in');
    expect(canonicalizeDestinationCountry('US')).toBe('us');
    expect(canonicalizeDestinationCountry('IND')).toBeNull();
    expect(canonicalizeDestinationCountry('')).toBeNull();
  });

  it('does not guess non-India prefixes', () => {
    expect(destinationCountryFromE164('+15551234567')).toBeNull();
    expect(destinationCountryFromE164('+442071838750')).toBeNull();
    expect(destinationCountryFromE164('')).toBeNull();
    expect(destinationCountryFromE164(null)).toBeNull();
  });
});
