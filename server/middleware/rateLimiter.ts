import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

const intFromEnv = (name: string, fallback: number): number => {
  const value = parseInt(process.env[name] ?? '', 10);
  return Number.isNaN(value) ? fallback : value;
};

/**
 * Brute-force protection for the login endpoint. Counts only FAILED
 * attempts per IP (successful logins never lock anyone out) and answers
 * over-limit requests with a consistent 429 JSON body.
 *
 * Built as a factory so the limits are read from the environment when
 * the app is created — configurable per deployment and per test.
 */
export const createLoginLimiter = (): RateLimitRequestHandler =>
  rateLimit({
    windowMs: intFromEnv('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    limit: intFromEnv('LOGIN_RATE_LIMIT_MAX', 10),
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many failed login attempts. Please try again in a few minutes.',
      });
    },
  });

/**
 * Brute-force protection for a password change.
 *
 * Changing a password requires proving the current one, which makes this
 * endpoint a password oracle for anyone who reaches an already-signed-in
 * session — an unattended workstation, a borrowed phone. Unlimited guesses
 * there turn temporary access to a session into permanent ownership of the
 * account, so it needs the same treatment as the login form.
 *
 * Keyed on the authenticated user rather than the IP: a whole hospital can sit
 * behind one address, and one person fumbling their old password should not
 * lock out everybody else on that network. Falls back to the IP when there is
 * no session, which the route's `authenticate` should already have refused.
 *
 * Only failed attempts count, so a legitimate change never consumes budget.
 */
export const createPasswordChangeLimiter = (): RateLimitRequestHandler =>
  rateLimit({
    windowMs: intFromEnv('PASSWORD_CHANGE_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    // Read per request rather than once at construction. The login limiter is
    // built inside `createApp`, so a test can rebuild the app to change it;
    // this one is attached to a module-scoped router that loads once, and a
    // fixed number here would be unreachable from a test.
    limit: () => intFromEnv('PASSWORD_CHANGE_RATE_LIMIT_MAX', 5),
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    // The IP branch is unreachable in practice: `authenticate` runs before
    // this and refuses anonymous callers, so the key is always a user id.
    keyGenerator: (req) => req.user?._id?.toString() ?? req.ip ?? 'unknown',
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Please try again in a few minutes.',
      });
    },
  });
