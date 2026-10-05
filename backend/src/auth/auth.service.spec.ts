import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenStore } from './refresh-token-store.js';
import { LoginRateLimitStore } from '../security/rate-limit.constants.js';

describe('AuthService', () => {
  const secret = randomBytes(48).toString('base64url');
  const password = randomBytes(24).toString('base64url');
  let passwordHash: string;
  let service: AuthService;
  let findUnique: ReturnType<typeof vi.fn>;
  let addRefreshToken: ReturnType<typeof vi.fn>;
  let consumeRefreshToken: ReturnType<typeof vi.fn>;
  let recordLoginFailure: ReturnType<typeof vi.fn>;
  let clearLoginFailures: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(password, 4);
  });

  beforeEach(() => {
    findUnique = vi.fn();
    addRefreshToken = vi.fn().mockResolvedValue(undefined);
    consumeRefreshToken = vi.fn().mockResolvedValue(true);
    recordLoginFailure = vi.fn().mockResolvedValue(undefined);
    clearLoginFailures = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      user: { findUnique },
    } as unknown as PrismaService;
    const config = {
      get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
    } as unknown as ConfigService;
    const refreshTokenStore = {
      add: addRefreshToken,
      consume: consumeRefreshToken,
    } as RefreshTokenStore;

    service = new AuthService(
      prisma,
      new JwtService({}),
      config,
      refreshTokenStore,
      {
        assertAllowed: vi.fn(),
        recordFailure: recordLoginFailure,
        clearFailures: clearLoginFailures,
      } as LoginRateLimitStore,
    );
  });

  it('validates passwords with bcrypt', async () => {
    await expect(bcrypt.compare(password, passwordHash)).resolves.toBe(true);
    await expect(bcrypt.compare(randomBytes(24).toString('hex'), passwordHash))
      .resolves.toBe(false);
  });

  it('logs in and returns access and refresh tokens without password data', async () => {
    findUnique.mockResolvedValue({
      id: 12n,
      username: 'operator',
      passwordHash,
      status: 1,
      deletedAt: null,
    });

    const tokens = await service.login({ username: 'operator', password }, '203.0.113.9');

    expect(tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 7200 });
    expect(tokens).not.toHaveProperty('passwordHash');
    await expect(service.verifyAccessToken(tokens.accessToken)).resolves.toEqual({
      id: '12',
      username: 'operator',
    });
    await expect(service.verifyAccessToken(tokens.refreshToken)).rejects.toThrow(
      'Invalid token',
    );
    const refreshPayload = new JwtService({}).decode(tokens.refreshToken);
    expect(refreshPayload.exp - refreshPayload.iat).toBe(604800);
    expect(addRefreshToken).toHaveBeenCalledWith('12', expect.any(String));
    expect(clearLoginFailures).toHaveBeenCalledWith('203.0.113.9', 'operator');
  });

  it('rejects invalid credentials with a generic response', async () => {
    findUnique.mockResolvedValue({
      id: 12n,
      username: 'operator',
      passwordHash,
      status: 1,
      deletedAt: null,
    });

    await expect(
      service.login({
        username: 'operator',
        password: randomBytes(24).toString('hex'),
      }, '203.0.113.9'),
    ).rejects.toThrow('Invalid username or password');
    expect(recordLoginFailure).toHaveBeenCalledWith('203.0.113.9', 'operator', expect.objectContaining({ limit: 5 }));
  });

  it('rejects unknown or inactive accounts without disclosing account state', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.login({ username: 'missing', password }),
    ).rejects.toThrow('Invalid username or password');

    findUnique.mockResolvedValue({
      id: 12n,
      username: 'operator',
      passwordHash,
      status: 0,
      deletedAt: null,
    });
    await expect(
      service.login({ username: 'operator', password }),
    ).rejects.toThrow('Invalid username or password');
  });

  it('rotates refresh tokens and refuses replay', async () => {
    findUnique.mockResolvedValue({
      id: 12n,
      username: 'operator',
      passwordHash,
      status: 1,
      deletedAt: null,
    });
    const tokens = await service.login({ username: 'operator', password });
    const rotated = await service.refresh(tokens.refreshToken);

    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    consumeRefreshToken.mockResolvedValue(false);
    await expect(service.refresh(tokens.refreshToken)).rejects.toThrow(
      'Refresh token has already been used',
    );
  });
});
