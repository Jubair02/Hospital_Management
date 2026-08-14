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
