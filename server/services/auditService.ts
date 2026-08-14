import type { Types } from 'mongoose';
import AuditLog, {
  type AuditAction,
  type AuditResourceType,
} from '../models/AuditLog.js';
import type { Role } from '../models/User.js';
import logger from '../utils/logger.js';
import { nextSequenceId } from './sequenceService.js';

export const nextAuditId = (): Promise<string> => nextSequenceId('auditId', 'AUD', 8);

export interface AuditEntry {
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: Types.ObjectId;
  description: string;
  /** Small, non-sensitive facts only (ids, counts, statuses, amounts). */
  metadata?: Record<string, unknown>;
}

export interface AuditActor {
  actorId?: Types.ObjectId;
  actorRole?: Role;
  actorLabel?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/** Keys that must never reach the audit trail, whatever the caller passes. */
const FORBIDDEN_METADATA = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'jwt',
  'secret',
  'apikey',
  'cvv',
  'cardnumber',
  'pan',
  'iban',
]);

/**
 * Strips anything credential-shaped from metadata. Defence in depth: the
 * call sites already pass only safe facts, but this guarantees a mistake
 * at one call site cannot write a secret into the trail.
 */
const sanitizeMetadata = (
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!metadata) return undefined;

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA.has(key.toLowerCase().replace(/[^a-z]/g, ''))) continue;
    if (value === undefined) continue;
    // Keep entries small and primitive; never nest whole documents.
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      safe[key] = Array.isArray(value) ? value.length : String(value);
    } else {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
};

/**
 * Writes one audit entry. Auditing is an observation of an action that
 * already happened, so a failure here is logged and swallowed — it must
 * never turn a successful clinical or financial operation into an error.
 */
export const recordAudit = async (entry: AuditEntry, actor: AuditActor = {}): Promise<void> => {
  try {
    await AuditLog.create({
      auditId: await nextAuditId(),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      actorLabel: actor.actorLabel,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      description: entry.description,
      metadata: sanitizeMetadata(entry.metadata),
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
    });
  } catch (err) {
    logger.warn(`Audit write failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
};
