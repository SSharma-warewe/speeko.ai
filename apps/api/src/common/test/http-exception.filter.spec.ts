import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from '@call-agent/contracts';
import { HttpExceptionFilter, toErrorResponse } from '../http-exception.filter';

describe('toErrorResponse', () => {
  it('maps NotFoundException to NOT_FOUND', () => {
    const body = toErrorResponse(new NotFoundException('Call not found'));
    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      code: ErrorCode.NOT_FOUND,
      message: 'Call not found',
    });
  });

  it('keeps validation message arrays', () => {
    const body = toErrorResponse(
      new BadRequestException({
        statusCode: 400,
        message: ['email must be an email', 'phone should not be empty'],
        error: 'Bad Request',
      }),
    );
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.message).toEqual([
      'email must be an email',
      'phone should not be empty',
    ]);
  });

  it('maps UnauthorizedException', () => {
    const body = toErrorResponse(new UnauthorizedException('Invalid credentials'));
    expect(body.statusCode).toBe(401);
    expect(body.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(body.message).toBe('Invalid credentials');
  });

  it('maps 429 HttpException and keeps the message', () => {
    const body = toErrorResponse(
      new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many login attempts. Try again later.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
    expect(body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many login attempts. Try again later.',
    });
  });

  it('does not leak unknown errors', () => {
    const body = toErrorResponse(new Error('secret stack'));
    expect(body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      code: ErrorCode.INTERNAL,
      message: 'Internal server error',
    });
  });
});

describe('HttpExceptionFilter', () => {
  it('writes the normalized JSON body', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };

    const filter = new HttpExceptionFilter();
    filter.catch(new NotFoundException('Organization not found'), host as never);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      code: ErrorCode.NOT_FOUND,
      message: 'Organization not found',
    });
  });
});
