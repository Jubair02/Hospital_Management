import type { Role } from '../models/User.js';

/** Claims carried by every HMS access token. */
export interface AppJwtPayload {
  userId: string;
  role: Role;
  iat?: number;
  exp?: number;
}
