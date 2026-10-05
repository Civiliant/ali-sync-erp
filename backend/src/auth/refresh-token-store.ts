export const REFRESH_TOKEN_STORE = Symbol('REFRESH_TOKEN_STORE');

export interface RefreshTokenStore {
  add(userId: string, tokenId: string): Promise<void>;
  consume(userId: string, tokenId: string): Promise<boolean>;
}
