import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CreateSipTrunkDto } from './dto/create-sip-trunk.dto';
import { SipTrunkResponseDto } from './dto/sip-trunk-response.dto';
import { UpdateSipTrunkDto } from './dto/update-sip-trunk.dto';
import { SipTrunksService } from './sip-trunks.service';

@ApiTags('sip-trunks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/organizations/:orgId/sip-trunks')
export class SipTrunksController {
  constructor(private readonly sipTrunksService: SipTrunksService) {}

  @Get()
  @ApiOperation({ summary: 'List SIP trunks for an organization' })
  @ApiOkResponse({ type: [SipTrunkResponseDto] })
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
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
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.create(orgId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one SIP trunk (password redacted)' })
  @ApiOkResponse({ type: SipTrunkResponseDto })
  getOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.getOne(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update SIP trunk local fields' })
  @ApiOkResponse({ type: SipTrunkResponseDto })
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
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
  async remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.sipTrunksService.remove(orgId, id);
  }
}
