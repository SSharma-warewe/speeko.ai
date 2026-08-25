import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

function errorDoc(description?: string) {
  return description
    ? { type: ErrorResponseDto, description }
    : { type: ErrorResponseDto };
}

/** JWT-protected controllers: validation + authn/authz. */
export function ApiJwtErrors() {
  return applyDecorators(
    ApiBadRequestResponse(errorDoc('Validation failed or bad request')),
    ApiUnauthorizedResponse(errorDoc('Missing, expired, or invalid JWT')),
    ApiForbiddenResponse(errorDoc('Wrong principal or inactive organization')),
  );
}

export function ApiNotFoundError(description = 'Resource not found') {
  return ApiNotFoundResponse(errorDoc(description));
}

export function ApiConflictError(description = 'Conflict') {
  return ApiConflictResponse(errorDoc(description));
}

export function ApiUnauthorizedError(description = 'Unauthorized') {
  return ApiUnauthorizedResponse(errorDoc(description));
}

export function ApiBadRequestError(description = 'Bad request') {
  return ApiBadRequestResponse(errorDoc(description));
}

export function ApiTooManyRequestsError(description = 'Too many requests') {
  return ApiTooManyRequestsResponse(errorDoc(description));
}

/** Worker-secret internals (`X-Worker-Secret`). */
export function ApiWorkerErrors() {
  return applyDecorators(
    ApiBadRequestResponse(errorDoc('Validation failed or bad request')),
    ApiUnauthorizedResponse(errorDoc('Missing or invalid X-Worker-Secret')),
    ApiNotFoundResponse(errorDoc('Call not found')),
  );
}

/** Public CRM integration enqueue. */
export function ApiIntegrationErrors() {
  return applyDecorators(
    ApiBadRequestResponse(errorDoc('Validation failed or bad request')),
    ApiUnauthorizedResponse(errorDoc('Missing or invalid API key')),
    ApiForbiddenResponse(errorDoc('Endpoint or organization is disabled')),
    ApiNotFoundResponse(errorDoc('Integration endpoint not found')),
  );
}

export function ApiForbiddenError(description = 'Forbidden') {
  return ApiForbiddenResponse(errorDoc(description));
}

export function ApiBadGatewayError(description = 'Bad gateway') {
  return ApiBadGatewayResponse(errorDoc(description));
}

export function ApiUnavailableError(description = 'Service unavailable') {
  return ApiServiceUnavailableResponse(errorDoc(description));
}
