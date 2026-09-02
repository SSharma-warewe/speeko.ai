import { HttpException, HttpStatus } from '@nestjs/common';

export function throwTooManyRequests(message: string): never {
  throw new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message,
      error: 'Too Many Requests',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
