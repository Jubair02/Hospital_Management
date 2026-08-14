import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserDocument } from '../models/User.js';
import type { AppJwtPayload } from '../types/auth.js';

const generateToken = (user: UserDocument): string => {
  const payload: AppJwtPayload = { userId: user._id.toString(), role: user.role };

  // JWT_SECRET presence is validated at startup (server.ts).
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'],
  });
};

export default generateToken;
