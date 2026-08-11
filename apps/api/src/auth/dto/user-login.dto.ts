import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UserLoginDto {
  @ApiProperty({ example: 'agent@acme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    example: 'acme',
    description: 'Organization slug (required if organizationId not set)',
  })
  @ValidateIf((o: UserLoginDto) => !o.organizationId)
  @IsString()
  @MinLength(2)
  organizationSlug?: string;

  @ApiPropertyOptional({
    description: 'Organization UUID (required if organizationSlug not set)',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
