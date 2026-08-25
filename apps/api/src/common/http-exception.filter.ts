import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ErrorCode,
  errorCodeFromStatus,
  type ErrorResponse,
} from '@call-agent/contracts';

const STATUS_PHRASE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
};

export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const raw = exception.getResponse();
    let message: string | string[] = exception.message;
    let error = STATUS_PHRASE[statusCode] ?? 'Error';

    if (typeof raw === 'string' && raw.trim()) {
      message = raw;
    } else if (raw && typeof raw === 'object') {
      const body = raw as { message?: unknown; error?: unknown };
      if (typeof body.message === 'string' && body.message.trim()) {
        message = body.message;
      } else if (Array.isArray(body.message) && body.message.length > 0) {
        message = body.message.map(String);
      }
      if (typeof body.error === 'string' && body.error.trim()) {
        error = body.error;
      }
    }

    return {
      statusCode,
      error,
      code: errorCodeFromStatus(statusCode),
      message,
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    error: 'Internal Server Error',
    code: ErrorCode.INTERNAL,
    message: 'Internal server error',
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const body = toErrorResponse(exception);

    if (!(exception instanceof HttpException)) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(err.message, err.stack);
    }

    res.status(body.statusCode).json(body);
  }
}
