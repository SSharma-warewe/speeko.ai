import { envValidationSchema } from './env.validation';

describe('schema synchronization environment policy', () => {
  const setting = envValidationSchema.extract('DATABASE_SYNCHRONIZE');
  it.each([[undefined, true], ['true', true], ['false', false], [false, false]])(
    'validates %s as %s without losing explicit false', (input, expected) => {
      const result = setting.validate(input);
      expect(result.error).toBeUndefined();
      expect(result.value).toBe(expected);
    },
  );
  it('rejects malformed values rather than enabling startup synchronization', () => {
    expect(setting.validate('disabled').error).toBeDefined();
  });
});
