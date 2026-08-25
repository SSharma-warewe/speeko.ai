import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from '@call-agent/contracts';

export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ example: 'Not Found' })
  error!: string;

  @ApiProperty({
    enum: Object.values(ErrorCode),
    example: ErrorCode.NOT_FOUND,
  })
  code!: ErrorCode;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Call not found',
  })
  message!: string | string[];
}
