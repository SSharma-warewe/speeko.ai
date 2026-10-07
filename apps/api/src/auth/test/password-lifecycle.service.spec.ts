import {
  PasswordLifecycleService,
  hashPasswordToken,
} from '../password-lifecycle.service';
import { PasswordLifecycleRepository } from '../password-lifecycle.repository';
import {
  PasswordTokenKind,
  PasswordTokenPurpose,
} from '../password-reset-token.entity';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { hashPassword, verifyPassword } from '../../common/password.util';

jest.mock('../../common/password.util', () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));

describe('PasswordLifecycleService', () => {
  const principal = {
    kind: PasswordTokenKind.USER as const,
    id: 'user',
    organizationId: 'org',
  };
  const input = {
    principal,
    email: 'user@example.invalid',
    currentPassword: 'old',
    newPassword: 'new',
  };
  let repository: {
    issue: jest.Mock;
    consumeAndReplace: jest.Mock;
    passwordHash: jest.Mock;
    replaceVerified: jest.Mock;
  };
  let service: PasswordLifecycleService;
  beforeEach(() => {
    jest.clearAllMocks();
    repository = {
      issue: jest.fn(),
      consumeAndReplace: jest.fn(),
      passwordHash: jest.fn().mockResolvedValue('old-hash'),
      replaceVerified: jest.fn(),
    };
    service = new PasswordLifecycleService(
      repository as unknown as PasswordLifecycleRepository,
    );
    (hashPassword as jest.Mock).mockResolvedValue('new-hash');
    (verifyPassword as jest.Mock).mockResolvedValue(true);
  });
  it('returns a random token only after its hash has committed', async () => {
    let release!: () => void;
    repository.issue.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let settled = false;
    const result = service
      .issueToken({
        principal,
        purpose: PasswordTokenPurpose.RESET,
        ttlMs: 1000,
      })
      .then((raw) => {
        settled = true;
        return raw;
      });
    expect(settled).toBe(false);
    release();
    const raw = await result;
    expect(repository.issue).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: hashPasswordToken(raw) }),
    );
    expect(JSON.stringify(repository.issue.mock.calls)).not.toContain(raw);
  });
  it('does not return a token when issuance rolls back', async () => {
    repository.issue.mockRejectedValue(new Error('write failed'));
    await expect(
      service.issueToken({
        principal,
        purpose: PasswordTokenPurpose.RESET,
        ttlMs: 1000,
      }),
    ).rejects.toThrow('write failed');
  });
  it('hashes outside the repository command and passes no plaintext password', async () => {
    await service.replacePasswordFromToken({
      principal,
      email: input.email,
      purpose: PasswordTokenPurpose.RESET,
      token: 'raw',
      newPassword: input.newPassword,
    });
    expect(repository.consumeAndReplace).toHaveBeenCalledWith({
      principal,
      email: input.email,
      purpose: PasswordTokenPurpose.RESET,
      tokenHash: hashPasswordToken('raw'),
      passwordHash: 'new-hash',
    });
  });
  it('carries the verified original hash into atomic replacement', async () => {
    await service.changePassword(input);
    expect(repository.replaceVerified).toHaveBeenCalledWith({
      principal,
      email: input.email,
      verifiedHash: 'old-hash',
      passwordHash: 'new-hash',
    });
  });
  it('rejects a wrong current password without mutation', async () => {
    (verifyPassword as jest.Mock).mockResolvedValue(false);
    await expect(service.changePassword(input)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(repository.replaceVerified).not.toHaveBeenCalled();
  });
  it('rejects the same password without mutation', async () => {
    await expect(
      service.changePassword({ ...input, newPassword: input.currentPassword }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.replaceVerified).not.toHaveBeenCalled();
  });
});
