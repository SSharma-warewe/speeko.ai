import { nextAvailableSlug, slugify } from '../slug.util';

describe('slug.util', () => {
  describe('slugify', () => {
    it('1. trims, lowercases, and collapses non-alphanumeric to hyphens', () => {
      expect(slugify('  Hello World!! ')).toBe('hello-world');
    });

    it('2. collapses multiple separators and mixed case', () => {
      expect(slugify('Booking__Confirmations--V2')).toBe(
        'booking-confirmations-v2',
      );
    });

    it('3. returns agent when input is empty or only symbols', () => {
      expect(slugify('')).toBe('agent');
      expect(slugify('   ')).toBe('agent');
      expect(slugify('!!!')).toBe('agent');
      expect(slugify('---')).toBe('agent');
    });

    it('4. truncates to max 80 characters', () => {
      const long = 'a'.repeat(100);
      expect(slugify(long)).toHaveLength(80);
      expect(slugify(long)).toBe('a'.repeat(80));
    });

    it('5. strips leading and trailing hyphens', () => {
      expect(slugify('--hello--')).toBe('hello');
      expect(slugify('  -world-  ')).toBe('world');
    });
  });

  describe('nextAvailableSlug', () => {
    it('6. returns base when preferred is free', () => {
      expect(nextAvailableSlug('booking', [])).toBe('booking');
      expect(nextAvailableSlug('Booking Confirmations', ['other'])).toBe(
        'booking-confirmations',
      );
    });

    it('7. appends -2 when base is taken', () => {
      expect(nextAvailableSlug('booking', ['booking'])).toBe('booking-2');
    });

    it('8. appends next free numeric suffix', () => {
      expect(
        nextAvailableSlug('booking', ['booking', 'booking-2', 'booking-4']),
      ).toBe('booking-3');
    });

    it('9. treats existing slugs case-insensitively', () => {
      expect(nextAvailableSlug('booking', ['Booking'])).toBe('booking-2');
      expect(nextAvailableSlug('BOOKING', ['booking', 'BOOKING-2'])).toBe(
        'booking-3',
      );
    });

    it('10. slugifies messy preferred before collision checks', () => {
      expect(
        nextAvailableSlug('  Hello World!! ', ['hello-world', 'hello-world-2']),
      ).toBe('hello-world-3');
    });

    it('11. truncates long base to 72 so suffixed slug fits in 80', () => {
      const longPreferred = 'x'.repeat(100);
      const free = nextAvailableSlug(longPreferred, []);
      expect(free.length).toBeLessThanOrEqual(80);
      expect(free).toBe('x'.repeat(72));

      const collided = nextAvailableSlug(longPreferred, [free]);
      expect(collided.length).toBeLessThanOrEqual(80);
      expect(collided).toBe(`${'x'.repeat(72)}-2`.slice(0, 80));
      expect(collided).not.toBe(longPreferred.toLowerCase());
    });

    it('12. ignores empty strings in existing slug list', () => {
      expect(nextAvailableSlug('agent', ['', 'agent'])).toBe('agent-2');
    });
  });
});
