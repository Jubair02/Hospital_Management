import type { Request, RequestHandler } from 'express';
import { recordAudit, type AuditActor, type AuditEntry } from '../services/auditService.js';

export type { AuditActor };

/** Actor + request context for an audit entry, taken from the request. */
export const actorFromRequest = (req: Request): AuditActor => ({
  actorId: req.user?._id,
  actorRole: req.user?.role,
  actorLabel: req.user?.email,
  ipAddress: req.ip,
  // Long UA strings are truncated by the model; keep the useful prefix.
  userAgent: req.get('user-agent')?.slice(0, 300),
  requestId: typeof req.id === 'string' ? req.id : undefined,
});

/**
 * Attaches `req.audit(entry, actorOverride?)` so any controller can record
 * an action in one line, with the actor, IP, user agent, and request id
 * filled in automatically. This is the single integration point for audit
 * logging — no controller builds actor context by hand.
 *
 * The override exists for authentication events, where the acting user is
 * known but `req.user` is not set (the login route runs before the
 * authenticate middleware).
 */
const auditContext: RequestHandler = (req, _res, next) => {
  req.audit = (entry: AuditEntry, actorOverride?: Partial<AuditActor>) =>
    recordAudit(entry, { ...actorFromRequest(req), ...actorOverride });
  next();
};

export default auditContext;
