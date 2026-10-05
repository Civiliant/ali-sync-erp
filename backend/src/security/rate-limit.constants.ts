export const RATE_LIMIT_METADATA = 'security:rate-limit';
export const LOGIN_RATE_LIMIT_STORE = Symbol('LOGIN_RATE_LIMIT_STORE');

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
}

export const LOGIN_RATE_LIMIT_OPTIONS: RateLimitOptions = {
  limit: 5,
  windowSeconds: 60,
  blockSeconds: 300,
};

export interface LoginRateLimitStore {
  assertAllowed(ip: string, account: string, options: RateLimitOptions): Promise<void>;
  recordFailure(ip: string, account: string, options: RateLimitOptions): Promise<void>;
  clearFailures(ip: string, account: string): Promise<void>;
}
