import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  canonicalizeDestinationCountry,
  destinationCountryFromE164,
} from '../calls/lib/call-phone';
import { LivekitService } from '../livekit/livekit.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateInboundSipTrunkDto } from './dto/create-inbound-sip-trunk.dto';
import { CreateSipTrunkDto } from './dto/create-sip-trunk.dto';
import { PublishResourceResultDto } from './dto/inbound-publish-result.dto';
import { UpdateInboundSipTrunkDto } from './dto/update-inbound-sip-trunk.dto';
import { UpdateSipTrunkDto } from './dto/update-sip-trunk.dto';
import { SipTrunkResponseDto } from './dto/sip-trunk-response.dto';
import { runPublishBatch } from './lib/publish-batch';
import { toSipTrunkResponse } from './mappers/sip-trunk-response.mapper';
import { SipTrunk, SipTrunkDirection } from './sip-trunk.entity';
import { SipTrunksRepository } from './sip-trunks.repository';

@Injectable()
export class SipTrunksService {
  private readonly logger = new Logger(SipTrunksService.name);

  constructor(
    private readonly sipTrunksRepository: SipTrunksRepository,
    private readonly organizationsService: OrganizationsService,
    private readonly livekit: LivekitService,
  ) {}

  findById(id: string): Promise<SipTrunk | null> {
    return this.sipTrunksRepository.findById(id);
  }

  findByLivekitTrunkId(livekitTrunkId: string): Promise<SipTrunk | null> {
    return this.sipTrunksRepository.findByLivekitTrunkId(livekitTrunkId);
  }

  async listByOrganization(organizationId: string): Promise<SipTrunkResponseDto[]> {
    await this.organizationsService.findById(organizationId);
    const rows = await this.sipTrunksRepository.findByOrganization(organizationId);
    return rows.map(toSipTrunkResponse);
  }

  listInboundByOrganization(
    organizationId: string,
  ): Promise<SipTrunkResponseDto[]> {
    return this.listByDirection(organizationId, SipTrunkDirection.INBOUND);
  }

  listOutboundByOrganization(
    organizationId: string,
  ): Promise<SipTrunkResponseDto[]> {
    return this.listByDirection(organizationId, SipTrunkDirection.OUTBOUND);
  }

  async listByDirection(
    organizationId: string,
    direction: SipTrunkDirection,
  ): Promise<SipTrunkResponseDto[]> {
    await this.organizationsService.findById(organizationId);
    const rows = await this.sipTrunksRepository.findByOrganizationAndDirection(
      organizationId,
      direction,
    );
    return rows.map(toSipTrunkResponse);
  }

  async getOne(organizationId: string, id: string): Promise<SipTrunkResponseDto> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireByIdAndOrg(organizationId, id);
    return toSipTrunkResponse(row);
  }

  getInboundOne(
    organizationId: string,
    id: string,
  ): Promise<SipTrunkResponseDto> {
    return this.getOneByDirection(
      organizationId,
      id,
      SipTrunkDirection.INBOUND,
    );
  }

  getOutboundOne(
    organizationId: string,
    id: string,
  ): Promise<SipTrunkResponseDto> {
    return this.getOneByDirection(
      organizationId,
      id,
      SipTrunkDirection.OUTBOUND,
    );
  }

  async getOneByDirection(
    organizationId: string,
    id: string,
    direction: SipTrunkDirection,
  ): Promise<SipTrunkResponseDto> {
    await this.organizationsService.findById(organizationId);
    const row =
      direction === SipTrunkDirection.INBOUND
        ? await this.requireInboundByIdAndOrg(organizationId, id)
        : await this.requireOutboundByIdAndOrg(organizationId, id);
    return toSipTrunkResponse(row);
  }

  /**
   * Internal: load active outbound trunk for dialing (entity includes secrets for LiveKit only if needed).
   */
  async resolveOutboundForCall(
    organizationId: string,
    sipTrunkId?: string,
  ): Promise<SipTrunk> {
    let trunk: SipTrunk | null;
    if (sipTrunkId) {
      trunk = await this.sipTrunksRepository.findByIdAndOrg(organizationId, sipTrunkId);
      if (!trunk) {
        throw new NotFoundException(
          `SIP trunk not found: ${sipTrunkId} (org ${organizationId})`,
        );
      }
    } else {
      trunk =
        await this.sipTrunksRepository.findActiveOutboundDefault(organizationId);
      if (!trunk) {
        throw new BadRequestException(
          `No active outbound SIP trunk for organization ${organizationId}`,
        );
      }
    }

    if (!trunk.isActive) {
      throw new BadRequestException(`SIP trunk is inactive: ${trunk.id}`);
    }
    if (trunk.direction !== SipTrunkDirection.OUTBOUND) {
      throw new BadRequestException(
        `SIP trunk is not outbound: ${trunk.id} (${trunk.direction})`,
      );
    }
    if (!trunk.livekitTrunkId?.trim()) {
      throw new BadRequestException(
        `SIP trunk missing livekitTrunkId: ${trunk.id}`,
      );
    }
    return trunk;
  }

  /** Internal: resolve inbound local trunks for dispatch-rule validation/publish. */
  async getEntitiesByIds(
    organizationId: string,
    ids: string[],
  ): Promise<SipTrunk[]> {
    return this.sipTrunksRepository.findByIdsAndOrg(organizationId, ids);
  }

  /** Org-user / admin shared: outbound only. */
  async createOutbound(
    organizationId: string,
    dto: CreateSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    await this.organizationsService.findById(organizationId);

    const numbers = this.requireNumbers(dto.numbers);
    const destinationCountry =
      canonicalizeDestinationCountry(dto.destinationCountry) ||
      destinationCountryFromE164(numbers[0]) ||
      undefined;

    let livekitTrunkId: string;
    let providerAddress: string | null = dto.providerAddress?.trim() || null;

    if (dto.livekitTrunkId?.trim()) {
      livekitTrunkId = dto.livekitTrunkId.trim();
      await this.assertLivekitTrunkUnlinked(livekitTrunkId);
      if (destinationCountry) {
        await this.livekit
          .updateSipOutboundTrunkFields(livekitTrunkId, {
            destinationCountry,
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(
              `Could not pin destinationCountry=${destinationCountry} on ${livekitTrunkId}: ${message}`,
            );
          });
      }
    } else if (dto.providerAddress?.trim()) {
      const created = await this.livekit.createSipOutboundTrunk({
        name: dto.name.trim(),
        address: dto.providerAddress.trim(),
        numbers,
        authUsername: dto.authUsername,
        authPassword: dto.authPassword,
        destinationCountry,
      });
      livekitTrunkId = created.sipTrunkId;
      providerAddress = created.address || providerAddress;
      this.logger.log(
        `Provisioned LiveKit outbound trunk ${livekitTrunkId} for org ${organizationId}`,
      );
    } else {
      throw new BadRequestException(
        'Provide livekitTrunkId to link an existing trunk, or providerAddress to provision a new one',
      );
    }

    const row = this.sipTrunksRepository.create({
      organizationId,
      name: dto.name.trim(),
      direction: SipTrunkDirection.OUTBOUND,
      providerAddress,
      authUsername: dto.authUsername?.trim() || null,
      authPassword: dto.authPassword ?? null,
      numbers,
      allowedNumbers: [],
      allowedAddresses: [],
      krispEnabled: true,
      livekitTrunkId,
      isActive: dto.isActive ?? true,
      metadata: null,
      publishedAt: new Date(),
    });
    const saved = await this.sipTrunksRepository.save(row);
    return toSipTrunkResponse(saved);
  }

  /**
   * Save an inbound trunk draft (no LiveKit call) unless livekitTrunkId is provided to link.
   */
  async createInboundDraft(
    organizationId: string,
    dto: CreateInboundSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    await this.organizationsService.findById(organizationId);

    const numbers = this.requireNumbers(dto.numbers);

    const allowedNumbers = this.normalizeNumbers(dto.allowedNumbers ?? []);
    const allowedAddresses = this.normalizeNumbers(dto.allowedAddresses ?? []);

    let livekitTrunkId: string | null = null;
    let publishedAt: Date | null = null;

    if (dto.livekitTrunkId?.trim()) {
      livekitTrunkId = dto.livekitTrunkId.trim();
      await this.assertLivekitTrunkUnlinked(livekitTrunkId);
      publishedAt = new Date();
    }

    const row = this.sipTrunksRepository.create({
      organizationId,
      name: dto.name.trim(),
      direction: SipTrunkDirection.INBOUND,
      providerAddress: null,
      authUsername: dto.authUsername?.trim() || null,
      authPassword: dto.authPassword ?? null,
      numbers,
      allowedNumbers,
      allowedAddresses,
      krispEnabled: dto.krispEnabled ?? true,
      livekitTrunkId,
      isActive: dto.isActive ?? true,
      metadata: null,
      publishedAt,
    });
    const saved = await this.sipTrunksRepository.save(row);
    return toSipTrunkResponse(saved);
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireByIdAndOrg(organizationId, id);
    return this.applyOutboundLocalUpdate(row, dto);
  }

  async updateOutbound(
    organizationId: string,
    id: string,
    dto: UpdateSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireOutboundByIdAndOrg(organizationId, id);
    return this.applyOutboundLocalUpdate(row, dto);
  }

  async updateInbound(
    organizationId: string,
    id: string,
    dto: UpdateInboundSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireInboundByIdAndOrg(organizationId, id);

    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }
    if (dto.numbers !== undefined) {
      row.numbers = this.requireNumbers(dto.numbers);
    }
    if (dto.allowedNumbers !== undefined) {
      row.allowedNumbers = this.normalizeNumbers(dto.allowedNumbers);
    }
    if (dto.allowedAddresses !== undefined) {
      row.allowedAddresses = this.normalizeNumbers(dto.allowedAddresses);
    }
    if (dto.authUsername !== undefined) {
      row.authUsername = dto.authUsername.trim() || null;
    }
    if (dto.authPassword !== undefined) {
      row.authPassword = dto.authPassword;
    }
    if (dto.krispEnabled !== undefined) {
      row.krispEnabled = dto.krispEnabled;
    }
    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }

    const saved = await this.sipTrunksRepository.save(row);
    return toSipTrunkResponse(saved);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireByIdAndOrg(organizationId, id);
    // Local delete only — do not delete the LiveKit project trunk by default
    // (it may be shared or managed outside this app).
    await this.sipTrunksRepository.remove(row);
  }

  async removeOutbound(organizationId: string, id: string): Promise<void> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireOutboundByIdAndOrg(organizationId, id);
    await this.sipTrunksRepository.remove(row);
  }

  async removeInbound(organizationId: string, id: string): Promise<void> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireInboundByIdAndOrg(organizationId, id);

    const livekitId = row.livekitTrunkId?.trim();
    if (livekitId) {
      await this.deleteLivekitTrunkOrIgnoreMissing(livekitId);
    }

    await this.sipTrunksRepository.remove(row);
  }

  /**
   * Delete a LiveKit SIP trunk. Treats already-missing trunks as success so
   * local cleanup can proceed; other LiveKit errors are rethrown so the local
   * row is not removed (caller can retry).
   */
  private async deleteLivekitTrunkOrIgnoreMissing(
    livekitTrunkId: string,
  ): Promise<void> {
    try {
      await this.livekit.deleteSipTrunk(livekitTrunkId);
    } catch (err) {
      if (this.isLivekitNotFound(err)) {
        this.logger.warn(
          `LiveKit SIP trunk already missing (treating as deleted): ${livekitTrunkId}`,
        );
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to delete LiveKit SIP trunk ${livekitTrunkId}: ${message}`,
      );
      throw err;
    }
  }

  private isLivekitNotFound(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }
    const e = err as { status?: number; code?: string; message?: string };
    if (e.status === 404) {
      return true;
    }
    if (typeof e.code === 'string' && /not_?found/i.test(e.code)) {
      return true;
    }
    if (typeof e.message === 'string' && /not\s*found/i.test(e.message)) {
      return true;
    }
    return false;
  }

  /**
   * Publish a draft inbound trunk to LiveKit CreateSIPInboundTrunk.
   * Already-live trunks → 409.
   */
  async publishInbound(
    organizationId: string,
    id: string,
  ): Promise<SipTrunkResponseDto> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireInboundByIdAndOrg(organizationId, id);

    if (!row.isActive) {
      throw new BadRequestException(`Inbound SIP trunk is inactive: ${row.id}`);
    }
    if (row.livekitTrunkId?.trim()) {
      throw new ConflictException(
        `Inbound SIP trunk already published: ${row.id} (${row.livekitTrunkId})`,
      );
    }

    const numbers = this.requireNumbers(
      row.numbers,
      `Inbound SIP trunk requires at least one number: ${row.id}`,
    );

    const created = await this.livekit.createSipInboundTrunk({
      name: row.name,
      numbers,
      allowedNumbers: this.normalizeNumbers(row.allowedNumbers ?? []),
      allowedAddresses: this.normalizeNumbers(row.allowedAddresses ?? []),
      authUsername: row.authUsername ?? undefined,
      authPassword: row.authPassword ?? undefined,
      krispEnabled: row.krispEnabled,
    });

    row.livekitTrunkId = created.sipTrunkId;
    row.publishedAt = new Date();
    const saved = await this.sipTrunksRepository.save(row);
    this.logger.log(
      `Published inbound trunk ${saved.id} → LiveKit ${created.sipTrunkId}`,
    );
    return toSipTrunkResponse(saved);
  }

  /**
   * Publish multiple inbound drafts. Used by combined inbound publish endpoint.
   * Already-live selected trunks are skipped (not failed).
   */
  async publishInboundMany(
    organizationId: string,
    sipTrunkIds?: string[],
  ): Promise<{
    results: PublishResourceResultDto[];
    published: SipTrunkResponseDto[];
  }> {
    await this.organizationsService.findById(organizationId);
    return runPublishBatch({
      requestedIds: sipTrunkIds,
      loadByIds: (ids) =>
        this.sipTrunksRepository.findByIdsAndOrg(organizationId, ids),
      loadDrafts: () =>
        this.sipTrunksRepository.findInboundDrafts(organizationId),
      livekitId: (row) => row.livekitTrunkId,
      publishOne: async (id) => {
        const dto = await this.publishInbound(organizationId, id);
        return { livekitId: dto.livekitTrunkId, dto };
      },
      notFoundMessage: (id) => `SIP trunk not found for org: ${id}`,
      extraFail: (row) =>
        row.direction !== SipTrunkDirection.INBOUND
          ? `Not an inbound trunk (${row.direction})`
          : null,
    });
  }

  private async requireByIdAndOrg(
    organizationId: string,
    id: string,
  ): Promise<SipTrunk> {
    const row = await this.sipTrunksRepository.findByIdAndOrg(organizationId, id);
    if (!row) {
      throw new NotFoundException(
        `SIP trunk not found: ${id} (org ${organizationId})`,
      );
    }
    return row;
  }

  private async requireInboundByIdAndOrg(
    organizationId: string,
    id: string,
  ): Promise<SipTrunk> {
    const row = await this.requireByIdAndOrg(organizationId, id);
    if (row.direction !== SipTrunkDirection.INBOUND) {
      throw new NotFoundException(
        `Inbound SIP trunk not found: ${id} (org ${organizationId})`,
      );
    }
    return row;
  }

  private async requireOutboundByIdAndOrg(
    organizationId: string,
    id: string,
  ): Promise<SipTrunk> {
    const row = await this.requireByIdAndOrg(organizationId, id);
    if (row.direction !== SipTrunkDirection.OUTBOUND) {
      throw new NotFoundException(
        `Outbound SIP trunk not found: ${id} (org ${organizationId})`,
      );
    }
    return row;
  }

  private async applyOutboundLocalUpdate(
    row: SipTrunk,
    dto: UpdateSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }
    if (dto.numbers !== undefined) {
      row.numbers = this.requireNumbers(dto.numbers);
    }
    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }
    if (dto.authUsername !== undefined) {
      row.authUsername = dto.authUsername.trim() || null;
    }
    if (dto.authPassword !== undefined) {
      row.authPassword = dto.authPassword;
    }

    const saved = await this.sipTrunksRepository.save(row);
    return toSipTrunkResponse(saved);
  }

  private normalizeNumbers(numbers: string[]): string[] {
    return numbers
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
  }

  private requireNumbers(
    numbers: string[],
    message = 'At least one phone number is required',
  ): string[] {
    const next = this.normalizeNumbers(numbers);
    if (next.length === 0) {
      throw new BadRequestException(message);
    }
    return next;
  }

  private async assertLivekitTrunkUnlinked(
    livekitTrunkId: string,
  ): Promise<void> {
    const existing =
      await this.sipTrunksRepository.findByLivekitTrunkId(livekitTrunkId);
    if (existing) {
      throw new ConflictException(
        `LiveKit trunk already linked: ${livekitTrunkId}`,
      );
    }
  }
}
