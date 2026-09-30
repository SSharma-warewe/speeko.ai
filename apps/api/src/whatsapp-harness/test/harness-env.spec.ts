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
};
describe('Harness feature configuration', () => {
  it.each([
    'WHATSAPP_PLATFORM_HARNESS_ENABLED',
    'WHATSAPP_OTP_HARNESS_ENABLED',
  ])('requires main harness when %s is on', (flag) => {
    expect(
      envValidationSchema.validate({
        ...base,
        OTP_DELIVERY_ENCRYPTION_KEY: 'ab'.repeat(32),
        [flag]: 'true',
      }).error?.message,
    ).toContain(flag);
  });
  it('requires an independent valid OTP encryption key and defaults new paths off', () => {
    const enabled = {
      ...base,
      WHATSAPP_HARNESS_ENABLED: 'true',
      WORKER_CALLBACK_SECRET: 'worker-secret',
      WHATSAPP_WORKER_URL: 'http://worker:8082',
      WHATSAPP_OTP_HARNESS_ENABLED: 'true',
    };
    expect(envValidationSchema.validate(enabled).error).toBeDefined();
    expect(
      envValidationSchema.validate({
        ...enabled,
        OTP_DELIVERY_ENCRYPTION_KEY: 'ab'.repeat(32),
      }).error,
    ).toBeUndefined();
    expect(
      envValidationSchema.validate(base).value
        .WHATSAPP_PLATFORM_HARNESS_ENABLED,
    ).toBe('false');
  });
});
