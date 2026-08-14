import bcrypt from 'bcryptjs';
import User, { type UserDocument } from '../models/User.js';

const intFromEnv = (name: string, fallback: number): number => {
  const value = parseInt(process.env[name] ?? '', 10);
  return Number.isNaN(value) ? fallback : value;
};

/** Consecutive failures before a short, temporary account lock. */
export const LOCK_THRESHOLD = (): number => intFromEnv('LOGIN_LOCK_THRESHOLD', 10);
/** How long that lock lasts. Never a permanent lock. */
export const LOCK_MINUTES = (): number => intFromEnv('LOGIN_LOCK_MINUTES', 15);

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '', 10) || 12;

let dummyHash: string | null = null;

/**
 * Performs the same bcrypt work as a real check when the email is
 * unknown, so response time cannot be used to discover which email
 * addresses exist (the timing oracle this closes was an open finding
 * from the Phase 1 security review).
 */
export const equalizeLoginWork = async (candidate: string): Promise<void> => {
  dummyHash ??= await bcrypt.hash('unknown-account-placeholder', BCRYPT_ROUNDS);
  await bcrypt.compare(candidate, dummyHash);
};

export const isLocked = (user: UserDocument): boolean =>
  Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());

/**
 * Records a failed attempt and locks the account temporarily once the
 * threshold is reached. Returns true when this attempt caused a lock.
 */
export const registerFailedAttempt = async (user: UserDocument): Promise<boolean> => {
  const attempts = (user.failedLoginAttempts ?? 0) + 1;
  const shouldLock = attempts >= LOCK_THRESHOLD();

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES() * 60_000) : null,
      },
    }
  );

  return shouldLock;
};

/** Clears failure state after a successful login. */
export const clearFailedAttempts = async (user: UserDocument): Promise<void> => {
  if ((user.failedLoginAttempts ?? 0) === 0 && !user.lockedUntil) return;
  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockedUntil: null } }
  );
};
