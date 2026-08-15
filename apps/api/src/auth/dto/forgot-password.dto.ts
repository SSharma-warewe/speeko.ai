import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'agent@acme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'acme' })
  @IsString()
  @MinLength(2)
  organizationSlug!: string;
}

export class AdminForgotPasswordDto {
  @ApiProperty({ example: 'admin@speeko.ai' })
  @IsEmail()
  email!: string;
}
