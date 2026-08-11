import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty()
  access_token!: string;

  @ApiProperty({ example: 'Bearer' })
  token_type!: string;

  @ApiProperty({ example: '8h' })
  expires_in!: string;
}
