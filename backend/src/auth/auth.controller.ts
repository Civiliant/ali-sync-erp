import { Body, Controller, Post } from '@nestjs/common';
import { Public } from './public.decorator.js';
import { AuthService, TokenPair } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }
}
