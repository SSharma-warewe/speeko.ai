import { parseEnvInt, resolveWorkerApiConfig } from '../../common/env';

describe('parseEnvInt', () => {
  const fallback = 7;

  it('undefined → fallback', () => {
    expect(parseEnvInt(undefined, fallback, 1)).toBe(fallback);
  });

  it("'' → fallback", () => {
    expect(parseEnvInt('', fallback, 1)).toBe(fallback);
  });

  it("'3' → 3", () => {
    expect(parseEnvInt('3', fallback, 1)).toBe(3);
  });

  it("'0' with min=1 → fallback", () => {
    expect(parseEnvInt('0', fallback, 1)).toBe(fallback);
  });

  it("'0' with min=0 → 0", () => {
    expect(parseEnvInt('0', fallback, 0)).toBe(0);
  });

  it('garbage → fallback', () => {
    expect(parseEnvInt('nope', fallback, 1)).toBe(fallback);
  });
});

describe('resolveWorkerApiConfig', () => {
  it('returns null when API_BASE_URL is missing', () => {
    expect(
      resolveWorkerApiConfig({ WORKER_CALLBACK_SECRET: 'secret' }),
    ).toBeNull();
  });

  it('returns null when WORKER_CALLBACK_SECRET is missing', () => {
    expect(
      resolveWorkerApiConfig({ API_BASE_URL: 'http://api.example' }),
    ).toBeNull();
  });

  it('returns null when both are empty', () => {
    expect(resolveWorkerApiConfig({})).toBeNull();
  });

  it('returns baseUrl + secret', () => {
    expect(
      resolveWorkerApiConfig({
        API_BASE_URL: 'http://api.example',
        WORKER_CALLBACK_SECRET: 'secret',
      }),
    ).toEqual({
      baseUrl: 'http://api.example',
      secret: 'secret',
    });
  });

  it('strips a trailing slash on API_BASE_URL', () => {
    expect(
      resolveWorkerApiConfig({
        API_BASE_URL: 'http://api.example/',
        WORKER_CALLBACK_SECRET: 'secret',
      }),
    ).toEqual({
      baseUrl: 'http://api.example',
      secret: 'secret',
    });
  });
});
