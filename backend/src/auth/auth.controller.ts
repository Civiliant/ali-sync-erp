import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from './public.decorator.js';
import { AuthService, TokenPair } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RateLimit } from '../security/rate-limit.decorator.js';
import { RateLimitGuard } from '../security/rate-limit.guard.js';
import { LOGIN_RATE_LIMIT_OPTIONS } from '../security/rate-limit.constants.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @RateLimit(LOGIN_RATE_LIMIT_OPTIONS)
  @UseGuards(RateLimitGuard)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<TokenPair> {
    return this.authService.login(dto, request.ip || request.socket.remoteAddress || 'unknown');
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }
}
