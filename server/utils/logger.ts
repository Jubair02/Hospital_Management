import { pino } from 'pino';

/**
 * Application-wide structured logger. Emits JSON lines with ISO
 * timestamps — the foundation the Phase 2 audit trail will build on.
 * Silent during tests unless LOG_LEVEL is set explicitly.
 */
const logger = pino({
  level:
    process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  timestamp: pino.stdTimeFunctions.isoTime,
  base: undefined, // drop pid/hostname noise from every line
  // Defence in depth: even if a caller hands the logger a whole request,
  // body, or config object, credentials never reach the log stream.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'headers.authorization',
      'headers.cookie',
      'password',
      '*.password',
      'body.password',
      'token',
      '*.token',
      'authorization',
    ],
    censor: '[redacted]',
  },
});

/**
 * Request/response serializers for pino-http.
 *
 * pino-http's defaults dump every request header, which would write bearer
 * tokens and session cookies straight into the log stream. These emit an
 * explicit allow-list instead, so credentials are never serialized.
 */
export const httpLogSerializers = {
  req: (req: {
    id?: unknown;
    method?: string;
    url?: string;
    remoteAddress?: string;
    headers?: Record<string, unknown>;
  }) => ({
    id: req.id,
    method: req.method,
    url: req.url,
    remoteAddress: req.remoteAddress,
    userAgent: req.headers?.['user-agent'],
  }),
  res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
};

export default logger;
