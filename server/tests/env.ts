// Test environment — imported before the app so no real .env values or
// databases are ever touched by the suite.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'vitest-only-jwt-secret-not-for-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CLIENT_URL = 'http://localhost:5173';
// Generous default so ordinary tests never trip the limiter; the
// rate-limit spec builds its own app with a tight limit.
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
// Low bcrypt cost keeps the suite fast; production stays at 12 rounds.
process.env.BCRYPT_ROUNDS = '4';

export {};
