import { envValidationSchema } from '../../config/env.validation';

const base = {
  DATABASE_HOST: 'localhost',
  DATABASE_USER: 'test',
  DATABASE_PASSWORD: 'test',
  DATABASE_NAME: 'test',
  JWT_SECRET: 'test-secret',
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'test-password',
  LIVEKIT_URL: 'wss://test.invalid',
  LIVEKIT_API_KEY: 'test',
  LIVEKIT_API_SECRET: 'test',
  WHATSAPP_WORKER_URL: 'http://worker:8082',
  WORKER_CALLBACK_SECRET: 'worker-secret',
};

describe('Always-active WhatsApp harness configuration', () => {
  it.each(['WHATSAPP_WORKER_URL', 'WORKER_CALLBACK_SECRET'] as const)(
    'requires %s without any rollout flags',
    (key) => {
      const config: Record<string, string> = { ...base };
      delete config[key];
      expect(envValidationSchema.validate(config).error?.message).toContain(
        key,
      );
      expect(
        envValidationSchema.validate({ ...base, [key]: '' }).error?.message,
      ).toContain(key);
    },
  );

  it('validates worker URL and callback secret', () => {
    expect(
      envValidationSchema.validate({
        ...base,
        WHATSAPP_WORKER_URL: 'not-a-url',
      }).error,
    ).toBeDefined();
    expect(
      envValidationSchema.validate({ ...base, WORKER_CALLBACK_SECRET: 'short' })
        .error,
    ).toBeDefined();
  });

  it('allows startup without platform Meta or OTP configuration', () => {
    const result = envValidationSchema.validate(base);
    expect(result.error).toBeUndefined();
    expect(result.value.WHATSAPP_TICKER_MAX_CONCURRENT).toBe(4);
    expect(
      envValidationSchema.validate({
        ...base,
        OTP_DELIVERY_ENCRYPTION_KEY: '',
        OTP_HASH_SECRET: '',
        WHATSAPP_API_KEY: '',
        WHATSAPP_URL: '',
      }).error,
    ).toBeUndefined();
  });

  it('validates an optional independent OTP encryption key when supplied', () => {
    expect(
      envValidationSchema.validate({
        ...base,
        OTP_DELIVERY_ENCRYPTION_KEY: 'ab'.repeat(32),
      }).error,
    ).toBeUndefined();
    for (const key of [
      'short',
      'zz'.repeat(32),
      'ab'.repeat(31),
      'ab'.repeat(33),
    ]) {
      expect(
        envValidationSchema.validate({
          ...base,
          OTP_DELIVERY_ENCRYPTION_KEY: key,
        }).error?.message,
      ).toContain('OTP_DELIVERY_ENCRYPTION_KEY');
    }
  });
});
