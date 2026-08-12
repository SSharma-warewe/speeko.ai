import {
  apiKeyPrefixFrom,
  toOrganizationIntegrationResponse,
} from '../mappers/organization-integration-response.mapper';
import {
  IntegrationProvider,
  OrganizationIntegration,
} from '../organization-integration.entity';

describe('organization-integration-response.mapper', () => {
  const row: OrganizationIntegration = {
    id: 'int-id',
    organizationId: 'org-id',
    provider: IntegrationProvider.NYLAS,
    name: 'Clinic Calendar',
    apiKey: 'nyk_super_secret_key_value',
    apiKeyPrefix: 'nyk_supe…',
    grantId: 'grant-1',
    calendarId: 'primary',
    apiUri: 'https://api.us.nylas.com',
    email: 'clinic@example.com',
    isActive: true,
    createdByUserId: 'user-id',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as OrganizationIntegration;

  describe('apiKeyPrefixFrom', () => {
    it('1. long keys use first 8 characters plus ellipsis', () => {
      expect(apiKeyPrefixFrom('nyk_super_secret')).toBe('nyk_supe…');
    });

    it('2. short keys (≤8) use first 4 characters plus ellipsis', () => {
      expect(apiKeyPrefixFrom('shortky')).toBe('shor…');
      expect(apiKeyPrefixFrom('12345678')).toBe('1234…');
    });

    it('3. trims whitespace before prefixing', () => {
      expect(apiKeyPrefixFrom('  nyk_super_secret  ')).toBe('nyk_supe…');
    });
  });

  describe('toOrganizationIntegrationResponse', () => {
    it('4. omits apiKey from the response object', () => {
      const dto = toOrganizationIntegrationResponse(row);

      expect(dto).not.toHaveProperty('apiKey');
      expect(Object.keys(dto)).not.toContain('apiKey');
    });

    it('5. includes public fields and apiKeyPrefix only', () => {
      const dto = toOrganizationIntegrationResponse(row);

      expect(dto).toEqual({
        id: row.id,
        organizationId: row.organizationId,
        provider: row.provider,
        name: row.name,
        apiKeyPrefix: row.apiKeyPrefix,
        grantId: row.grantId,
        calendarId: row.calendarId,
        apiUri: row.apiUri,
        email: row.email,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    });
  });
});
