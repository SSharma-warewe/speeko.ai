import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trimString } from '../../common/trim-string';

export class UpdateProfileDto {
  @ApiProperty({ minLength: 1, maxLength: 255, example: 'Ada Lovelace' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
}
