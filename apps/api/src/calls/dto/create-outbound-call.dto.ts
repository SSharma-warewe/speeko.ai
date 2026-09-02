import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { CreateUserOutboundCallDto } from './create-user-outbound-call.dto';

export class CreateOutboundCallDto extends CreateUserOutboundCallDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organizationId!: string;
}
