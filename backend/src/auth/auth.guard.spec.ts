import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

describe('AuthGuard', () => {
  const verifyAccessToken = vi.fn();
  const reflector = {
    getAllAndOverride: vi.fn(),
  } as unknown as Reflector;
  const authService = {
    verifyAccessToken,
  } as unknown as AuthService;
  const guard = new AuthGuard(reflector, authService);

  function createContext(
    authorization?: string,
    request: { headers: { authorization?: string }; user?: unknown } = {
      headers: { authorization },
    },
  ): ExecutionContext {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(false);
  });

  it('rejects requests without a bearer token by default', async () => {
    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('allows only explicitly public handlers to bypass authentication', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(true);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('validates bearer access tokens and attaches the safe user identity', async () => {
    const user = { id: '9', username: 'operator' };
    verifyAccessToken.mockResolvedValue(user);
    const request: { headers: { authorization?: string }; user?: typeof user } = {
      headers: { authorization: 'Bearer signed-token' },
    };
    const context = createContext('Bearer signed-token', request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAccessToken).toHaveBeenCalledWith('signed-token');
    expect(request.user).toEqual(user);
  });
});
