import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard.js';
import { PermissionsService } from './permissions.service.js';
import { REQUIRED_PERMISSIONS } from './permissions.constants.js';

describe('PermissionsGuard', () => {
  const getAllAndOverride = vi.fn();
  const hasAllPermissions = vi.fn();
  const reflector = { getAllAndOverride } as unknown as Reflector;
  const permissionsService = {
    hasAllPermissions,
  } as unknown as PermissionsService;
  const guard = new PermissionsGuard(reflector, permissionsService);

  function createContext(user?: { id: string; username: string }) {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getAllAndOverride.mockReturnValue(['order:cost:write']);
  });

  it('allows a user with every required permission', async () => {
    hasAllPermissions.mockResolvedValue(true);

    await expect(
      guard.canActivate(createContext({ id: '21', username: 'finance' })),
    ).resolves.toBe(true);
    expect(getAllAndOverride).toHaveBeenCalledWith(
      REQUIRED_PERMISSIONS,
      expect.any(Array),
    );
    expect(hasAllPermissions).toHaveBeenCalledWith('21', ['order:cost:write']);
  });

  it('denies a user missing the required permission with 403', async () => {
    hasAllPermissions.mockResolvedValue(false);

    await expect(
      guard.canActivate(createContext({ id: '22', username: 'operator' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not perform permission lookups for routes without requirements', async () => {
    getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(hasAllPermissions).not.toHaveBeenCalled();
  });
});
