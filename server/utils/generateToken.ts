import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserDocument } from '../models/User.js';
import type { AppJwtPayload } from '../types/auth.js';

const generateToken = (user: UserDocument): string => {
  const payload: AppJwtPayload = { userId: user._id.toString(), role: user.role };

  // JWT_SECRET presence is validated at startup (server.ts).
  //
  // Twelve hours, not a week. These tokens are bearer credentials held in the
  // browser's localStorage, and the client already ends a session after six
  // hours without interaction — but that control is client-side, so a token
  // copied off a machine outlives it. Twelve hours bounds that to something
  // close to a single shift while still outlasting one, so nobody is signed
  // out mid-handover. Deployments can raise or lower it through the env var.
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '12h') as SignOptions['expiresIn'],
  });
};

export default generateToken;
