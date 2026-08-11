import { SipTrunk } from '../sip-trunk.entity';
import { SipTrunkResponseDto } from '../dto/sip-trunk-response.dto';

/** Map entity → response; never include authPassword. */
export function toSipTrunkResponse(row: SipTrunk): SipTrunkResponseDto {
  const livekitTrunkId = row.livekitTrunkId?.trim() || null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    direction: row.direction,
    providerAddress: row.providerAddress,
    authUsername: row.authUsername,
    numbers: Array.isArray(row.numbers) ? row.numbers : [],
    allowedNumbers: Array.isArray(row.allowedNumbers) ? row.allowedNumbers : [],
    allowedAddresses: Array.isArray(row.allowedAddresses)
      ? row.allowedAddresses
      : [],
    krispEnabled: row.krispEnabled ?? true,
    livekitTrunkId,
    status: livekitTrunkId ? 'live' : 'draft',
    isActive: row.isActive,
    publishedAt: row.publishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
