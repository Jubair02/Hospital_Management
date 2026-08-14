import mongoose, { type FilterQuery } from 'mongoose';
import AuditLog, {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  type IAuditLog,
} from '../models/AuditLog.js';
import { ROLES, type Role } from '../models/User.js';
import { getSettings, updateSettings, type EditableSetting } from '../services/settingsService.js';
import { readMetrics } from '../utils/metrics.js';
import asyncHandler from '../utils/asyncHandler.js';

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/admin/audit-logs
 * Admin only, read-only. There is no create/update/delete endpoint for
 * audit entries anywhere in the API.
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const page = Math.max(parseInt(queryString(query.page) ?? '', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(queryString(query.limit) ?? '', 10) || 20, 1), 100);

  const filter: FilterQuery<IAuditLog> = {};

  const action = queryString(query.action);
  if (action && (AUDIT_ACTIONS as readonly string[]).includes(action)) {
    filter.action = action as IAuditLog['action'];
  }

  const resourceType = queryString(query.resourceType);
  if (resourceType && (AUDIT_RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
    filter.resourceType = resourceType as IAuditLog['resourceType'];
  }

  const actorRole = queryString(query.actorRole);
  if (actorRole && (ROLES as readonly string[]).includes(actorRole)) {
    filter.actorRole = actorRole as Role;
  }

  const actorId = queryString(query.actorId);
  if (actorId && mongoose.isValidObjectId(actorId)) filter.actorId = actorId;

  const resourceId = queryString(query.resourceId);
  if (resourceId && mongoose.isValidObjectId(resourceId)) filter.resourceId = resourceId;

  const from = queryString(query.from);
  const to = queryString(query.to);
  if ((from && DATE_RE.test(from)) || (to && DATE_RE.test(to))) {
    const end = to && DATE_RE.test(to) ? new Date(`${to}T00:00:00.000`) : undefined;
    if (end) end.setDate(end.getDate() + 1);
    filter.createdAt = {
      ...(from && DATE_RE.test(from) ? { $gte: new Date(`${from}T00:00:00.000`) } : {}),
      ...(end ? { $lt: end } : {}),
    };
  }

  const search = queryString(query.search);
  if (search) {
    const rx = { $regex: escapeRegex(search.trim()), $options: 'i' };
    filter.$or = [{ auditId: rx }, { description: rx }, { actorLabel: rx }];
  }

  // Sorting is restricted to a safe allow-list.
  const sortField = queryString(query.sort) === 'action' ? 'action' : 'createdAt';
  const sortDirection = queryString(query.order) === 'asc' ? 1 : -1;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('actorId', 'firstName lastName email role')
      .sort({ [sortField]: sortDirection })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Audit logs fetched',
    data: {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    },
  });
});

/** GET /api/admin/audit-logs/actions — filter vocabulary for the UI. */
export const getAuditVocabulary = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    message: 'Audit vocabulary fetched',
    data: {
      actions: [...AUDIT_ACTIONS],
      resourceTypes: [...AUDIT_RESOURCE_TYPES],
      roles: [...ROLES],
    },
  });
});

// ---------------------------------------------------------------------------
// System settings
// ---------------------------------------------------------------------------

/** GET /api/admin/settings — readable by any signed-in user (the app uses
 * the hospital name, currency, and slot length at runtime). */
export const getSystemSettings = asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  res.json({ success: true, message: 'Settings fetched', data: { settings } });
});

/** PATCH /api/admin/settings — admin only, audited. */
export const patchSystemSettings = asyncHandler(async (req, res) => {
  const body = req.body as Partial<Record<EditableSetting, unknown>>;
  const settings = await updateSettings(body);

  await req.audit({
    action: 'settings_updated',
    resourceType: 'settings',
    description: 'System settings updated.',
    metadata: { fields: Object.keys(body).join(', ') },
  });

  res.json({ success: true, message: 'Settings updated', data: { settings } });
});

// ---------------------------------------------------------------------------
// System health
// ---------------------------------------------------------------------------

const DB_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * GET /api/admin/system-health
 * Admin only. Returns operational state only — never environment
 * variable values, secrets, connection strings, or credentials.
 */
export const getSystemHealth = asyncHandler(async (_req, res) => {
  const metrics = readMetrics();
  const connection = mongoose.connection;

  res.json({
    success: true,
    message: 'System health fetched',
    data: {
      api: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) },
      database: {
        status: DB_STATES[connection.readyState] ?? 'unknown',
        // Database NAME only — never the host, user, or connection string.
        name: connection.name ?? null,
      },
      application: {
        version: process.env.npm_package_version ?? 'unknown',
        environment: process.env.NODE_ENV ?? 'development',
        nodeVersion: process.version,
      },
      traffic: {
        startedAt: metrics.startedAt.toISOString(),
        requests: metrics.requests,
        clientErrors: metrics.clientErrors,
        serverErrors: metrics.serverErrors,
        lastServerErrorAt: metrics.lastServerErrorAt?.toISOString() ?? null,
      },
    },
  });
});
