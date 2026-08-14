import { randomUUID } from 'crypto';
import type { RequestHandler } from 'express';

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Assigns every request a correlation ID, honoring a well-formed
 * X-Request-Id from an upstream proxy so one ID can follow a request
 * across services. Echoed back in the response for client-side
 * correlation and picked up by the HTTP logger (and, later, the
 * Phase 2 audit trail).
 */
const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];

  req.id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id as string);

  next();
};

export default requestId;
