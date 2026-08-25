import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import {
  ApiConflictError,
  ApiJwtErrors,
  ApiNotFoundError,
} from '../common/swagger/api-errors';
import { CreateSipTrunkDto } from './dto/create-sip-trunk.dto';
import { SipTrunkResponseDto } from './dto/sip-trunk-response.dto';
import { UpdateSipTrunkDto } from './dto/update-sip-trunk.dto';
import { SipTrunksService } from './sip-trunks.service';

@ApiTags('sip-trunks')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/organizations/:orgId/sip-trunks')
export class SipTrunksController {
  constructor(private readonly sipTrunksService: SipTrunksService) {}

  @Get()
  @ApiOperation({ summary: 'List SIP trunks for an organization' })
  @ApiOkResponse({ type: [SipTrunkResponseDto] })
  @ApiNotFoundError('Organization not found')
  list(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
  ): Promise<SipTrunkResponseDto[]> {
    return this.sipTrunksService.listByOrganization(orgId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create or link an outbound SIP trunk for an organization',
    description:
      'Pass livekitTrunkId to link an existing LiveKit trunk, or providerAddress (+ auth) to provision a new one via LiveKit API. Passwords are never returned.',
  })
  @ApiCreatedResponse({ type: SipTrunkResponseDto })
  @ApiNotFoundError('Organization not found')
  @ApiConflictError('Trunk already exists')
  create(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Body() dto: CreateSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.create(orgId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one SIP trunk (password redacted)' })
  @ApiOkResponse({ type: SipTrunkResponseDto })
  @ApiNotFoundError('SIP trunk not found')
  getOne(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Param('id', ParseResourceIdPipe('SIP trunk')) id: string,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.getOne(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update SIP trunk local fields' })
  @ApiOkResponse({ type: SipTrunkResponseDto })
  @ApiNotFoundError('SIP trunk not found')
  update(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Param('id', ParseResourceIdPipe('SIP trunk')) id: string,
    @Body() dto: UpdateSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.update(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete local SIP trunk row (does not delete LiveKit trunk)',
  })
  @ApiNoContentResponse()
  @ApiNotFoundError('SIP trunk not found')
  async remove(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Param('id', ParseResourceIdPipe('SIP trunk')) id: string,
  ): Promise<void> {
    await this.sipTrunksService.remove(orgId, id);
  }
}
