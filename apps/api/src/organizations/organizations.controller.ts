import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { Organization } from './organization.entity';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new organization' })
  @ApiCreatedResponse({ type: Organization })
  create(@Body() dto: CreateOrganizationDto): Promise<Organization> {
    return this.organizationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List organizations' })
  @ApiOkResponse({ type: [Organization] })
  findAll(): Promise<Organization[]> {
    return this.organizationsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by id' })
  @ApiOkResponse({ type: Organization })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Organization> {
    return this.organizationsService.findById(id);
  }
}
