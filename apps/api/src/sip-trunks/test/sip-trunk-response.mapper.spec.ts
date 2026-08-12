import { toSipTrunkResponse } from '../mappers/sip-trunk-response.mapper';
import { SipTrunk, SipTrunkDirection } from '../sip-trunk.entity';

describe('sip-trunk-response.mapper', () => {
  const base: SipTrunk = {
    id: 'trunk-id',
    organizationId: 'org-id',
    name: 'Primary outbound',
    direction: SipTrunkDirection.OUTBOUND,
    providerAddress: 'sip.telnyx.com',
    authUsername: 'user1',
    authPassword: 'super-secret-password',
    numbers: ['+918065179684'],
    allowedNumbers: [],
    allowedAddresses: [],
    krispEnabled: true,
    livekitTrunkId: 'ST_abc123',
    isActive: true,
    metadata: null,
    publishedAt: new Date('2024-01-01T00:00:00.000Z'),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as SipTrunk;

  describe('toSipTrunkResponse', () => {
    it('1. omits authPassword from the response object', () => {
      const dto = toSipTrunkResponse(base);

      expect(dto).not.toHaveProperty('authPassword');
      expect(Object.keys(dto)).not.toContain('authPassword');
    });

    it('2. status is draft when livekitTrunkId is null', () => {
      const dto = toSipTrunkResponse({
        ...base,
        livekitTrunkId: null,
      } as SipTrunk);

      expect(dto.status).toBe('draft');
      expect(dto.livekitTrunkId).toBeNull();
    });

    it('3. status is draft when livekitTrunkId is whitespace-only', () => {
      const dto = toSipTrunkResponse({
        ...base,
        livekitTrunkId: '   ',
      } as SipTrunk);

      expect(dto.status).toBe('draft');
      expect(dto.livekitTrunkId).toBeNull();
    });

    it('4. status is live when LiveKit id is present (trimmed)', () => {
      const dto = toSipTrunkResponse({
        ...base,
        livekitTrunkId: '  ST_abc123  ',
      } as SipTrunk);

      expect(dto.status).toBe('live');
      expect(dto.livekitTrunkId).toBe('ST_abc123');
    });

    it('5. coerces non-array numbers / allowed* fields to empty arrays', () => {
      const dto = toSipTrunkResponse({
        ...base,
        numbers: null as unknown as string[],
        allowedNumbers: 'bad' as unknown as string[],
        allowedAddresses: undefined as unknown as string[],
      } as SipTrunk);

      expect(dto.numbers).toEqual([]);
      expect(dto.allowedNumbers).toEqual([]);
      expect(dto.allowedAddresses).toEqual([]);
    });

    it('6. krispEnabled defaults to true when undefined', () => {
      const dto = toSipTrunkResponse({
        ...base,
        krispEnabled: undefined as unknown as boolean,
      } as SipTrunk);

      expect(dto.krispEnabled).toBe(true);
    });

    it('7. includes public fields including authUsername', () => {
      const dto = toSipTrunkResponse(base);

      expect(dto).toEqual({
        id: base.id,
        organizationId: base.organizationId,
        name: base.name,
        direction: base.direction,
        providerAddress: base.providerAddress,
        authUsername: base.authUsername,
        numbers: base.numbers,
        allowedNumbers: base.allowedNumbers,
        allowedAddresses: base.allowedAddresses,
        krispEnabled: true,
        livekitTrunkId: 'ST_abc123',
        status: 'live',
        isActive: true,
        publishedAt: base.publishedAt,
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
      });
    });
  });
});
