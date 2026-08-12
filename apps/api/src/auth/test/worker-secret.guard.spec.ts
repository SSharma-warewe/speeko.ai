import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkerSecretGuard } from '../guards/worker-secret.guard';
import { createMockExecutionContext } from './helpers/mock-execution-context';

describe('WorkerSecretGuard', () => {
  function makeGuard(secret: string | undefined): WorkerSecretGuard {
    const config = {
      get: jest.fn().mockReturnValue(secret),
    } as unknown as ConfigService;
    return new WorkerSecretGuard(config);
  }

  it('11. rejects requests without the secret header', () => {
    const guard = makeGuard('expected-secret');
    const ctx = createMockExecutionContext({ headers: {} });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow('Invalid worker secret');
  });

  it('11. rejects wrong secret value', () => {
    const guard = makeGuard('expected-secret');
    const ctx = createMockExecutionContext({
      headers: { 'x-worker-secret': 'wrong-secret' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow('Invalid worker secret');
  });

  it('allows matching secret', () => {
    const guard = makeGuard('expected-secret');
    const ctx = createMockExecutionContext({
      headers: { 'x-worker-secret': 'expected-secret' },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('12. fails closed when WORKER_CALLBACK_SECRET is undefined', () => {
    const guard = makeGuard(undefined);
    const ctx = createMockExecutionContext({
      headers: { 'x-worker-secret': 'anything' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow(
      'WORKER_CALLBACK_SECRET is not configured on the API',
    );
  });

  it('12. fails closed when WORKER_CALLBACK_SECRET is empty string', () => {
    const guard = makeGuard('');
    const ctx = createMockExecutionContext({
      headers: { 'x-worker-secret': 'anything' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow(
      'WORKER_CALLBACK_SECRET is not configured on the API',
    );
  });

  it('12. fails closed when WORKER_CALLBACK_SECRET is whitespace', () => {
    const guard = makeGuard('   ');
    const ctx = createMockExecutionContext({
      headers: { 'x-worker-secret': 'anything' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow(
      'WORKER_CALLBACK_SECRET is not configured on the API',
    );
  });
});
