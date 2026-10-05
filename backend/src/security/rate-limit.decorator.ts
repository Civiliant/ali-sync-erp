import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_METADATA } from './rate-limit.constants.js';
import type { RateLimitOptions } from './rate-limit.constants.js';

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA, Object.freeze({ ...options }));
