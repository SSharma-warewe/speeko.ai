import { NotFoundException, ParseUUIDPipe } from '@nestjs/common';

/**
 * Path-param UUID pipe. Invalid ids are 404 (resource does not exist),
 * not 400 "Validation failed (uuid is expected)".
 */
export function ParseResourceIdPipe(resource: string): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => new NotFoundException(`${resource} not found`),
  });
}
