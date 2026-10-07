import { assertSecurityDatabaseUrl } from './api-security-database';

describe('security fixture safety', () => {
  it('accepts only the dedicated fixture', () => {
    expect(() =>
      assertSecurityDatabaseUrl(
        'postgresql://test@127.0.0.1:55445/api_security_test',
      ),
    ).not.toThrow();
  });
  it.each([
    'postgresql://test@localhost:55445/api_security_test',
    'postgresql://test@127.0.0.1:5432/api_security_test',
    'postgresql://test@127.0.0.1:55445/callagent',
    'postgresql://test@127.0.0.1:55445/api_security_test?options=-csearch_path=public',
    'https://127.0.0.1:55445/api_security_test',
  ])('rejects unsafe fixture URL %s', (url) => {
    expect(() => assertSecurityDatabaseUrl(url)).toThrow('Use only isolated');
  });
});
