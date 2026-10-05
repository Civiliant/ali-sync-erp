import {
  Injectable,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ACCESS_TOKEN_USE,
  REFRESH_TOKEN_USE,
} from './auth.constants.js';
import { AuthenticatedUser } from './authenticated-user.interface.js';
import { LoginDto } from './dto/login.dto.js';
import {
  REFRESH_TOKEN_STORE,
  type RefreshTokenStore,
} from './refresh-token-store.js';
import {
  LOGIN_RATE_LIMIT_OPTIONS,
  LOGIN_RATE_LIMIT_STORE,
  type LoginRateLimitStore,
} from '../security/rate-limit.constants.js';

interface TokenPayload {
  sub: string;
  username: string;
  tokenUse: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

const ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(REFRESH_TOKEN_STORE)
    private readonly refreshTokenStore: RefreshTokenStore,
    @Inject(LOGIN_RATE_LIMIT_STORE)
    private readonly loginRateLimitStore: LoginRateLimitStore,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.startsWith('change-me')) {
      throw new Error('JWT_SECRET must be securely configured with at least 32 characters');
    }
    this.jwtSecret = jwtSecret;
  }

  async login(dto: LoginDto, ip = 'unknown'): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
      },
    });

    if (
      !user ||
      user.status !== 1 ||
      user.deletedAt !== null ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      await this.loginRateLimitStore.recordFailure(
        ip,
        dto.username,
        LOGIN_RATE_LIMIT_OPTIONS,
      );
      throw new UnauthorizedException('Invalid username or password');
    }

    await this.loginRateLimitStore.clearFailures(ip, dto.username);

    return this.issueTokenPair({
      id: user.id.toString(),
      username: user.username,
    });
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyToken(refreshToken, REFRESH_TOKEN_USE);
    if (!payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const consumed = await this.refreshTokenStore.consume(payload.sub, payload.jti);
    if (!consumed) {
      throw new UnauthorizedException('Refresh token has already been used');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      select: {
        id: true,
        username: true,
        status: true,
        deletedAt: true,
      },
    });
    if (!user || user.status !== 1 || user.deletedAt !== null) {
      throw new UnauthorizedException('User is unavailable');
    }

    return this.issueTokenPair({
      id: user.id.toString(),
      username: user.username,
    });
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const payload = await this.verifyToken(token, ACCESS_TOKEN_USE);
    return { id: payload.sub, username: payload.username };
  }

  private async issueTokenPair(user: AuthenticatedUser): Promise<TokenPair> {
    const tokenId = randomUUID();
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, username: user.username, tokenUse: REFRESH_TOKEN_USE, jti: tokenId },
      {
        secret: this.jwtSecret,
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
    );

    try {
      await this.refreshTokenStore.add(user.id, tokenId);
    } catch {
      throw new UnauthorizedException('Authentication service is unavailable');
    }

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, username: user.username, tokenUse: ACCESS_TOKEN_USE },
      {
        secret: this.jwtSecret,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private async verifyToken(
    token: string,
    expectedUse: string,
  ): Promise<TokenPayload> {
    let payload: TokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (
      payload.tokenUse !== expectedUse ||
      typeof payload.sub !== 'string' ||
      typeof payload.username !== 'string'
    ) {
      throw new UnauthorizedException('Invalid token');
    }

    return payload;
  }
}
