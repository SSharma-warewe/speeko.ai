import { exponentialBackoffMs, isRetryableHttpStatus } from '../../common/retry';

describe('isRetryableHttpStatus', () => {
  it.each([
    [408, true],
    [429, true],
    [500, true],
    [502, true],
    [503, true],
    [200, false],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
    [409, false],
  ])('status %s → %s', (status, expected) => {
    expect(isRetryableHttpStatus(status)).toBe(expected);
  });
});

describe('exponentialBackoffMs', () => {
  const noJitter = () => 0.5;

  it('no jitter → exact capped exponential', () => {
    expect(exponentialBackoffMs(0, 500, 4_000, noJitter)).toBe(500);
    expect(exponentialBackoffMs(1, 500, 4_000, noJitter)).toBe(1_000);
    expect(exponentialBackoffMs(2, 500, 4_000, noJitter)).toBe(2_000);
    expect(exponentialBackoffMs(3, 500, 4_000, noJitter)).toBe(4_000);
  });

  it('hits cap', () => {
    expect(exponentialBackoffMs(4, 500, 4_000, noJitter)).toBe(4_000);
    expect(exponentialBackoffMs(10, 500, 4_000, noJitter)).toBe(4_000);
  });

  it('baseMs=0 → 0', () => {
    expect(exponentialBackoffMs(0, 0, 4_000, noJitter)).toBe(0);
    expect(exponentialBackoffMs(3, 0, 4_000, noJitter)).toBe(0);
  });
});
