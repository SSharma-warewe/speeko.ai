import { ExecutionContext } from '@nestjs/common';

/**
 * Minimal ExecutionContext for guard unit tests.
 * request shape: { user?, headers? }
 */
export function createMockExecutionContext(request: {
  user?: unknown;
  headers?: Record<string, string | undefined>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getClass: () => class {},
    getHandler: () => () => undefined,
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({ getData: () => ({}), getContext: () => ({}) }),
    switchToWs: () => ({ getData: () => ({}), getClient: () => ({}) }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}
