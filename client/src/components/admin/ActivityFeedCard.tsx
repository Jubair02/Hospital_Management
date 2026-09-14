import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuditLogs } from '../../services/adminService';
import { getErrorMessage } from '../../services/api';
import { relativeTime } from '../../utils/date';
import { ROLE_LABELS } from '../../utils/constants';
import type { AuditLogEntry, AuditResourceType } from '../../types';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Icon, { type IconName } from '../ui/icons';

const SHOWN = 7;

/**
 * A glyph per kind of record, so the feed is scannable by shape before it is
 * read. Anything unmapped falls back rather than breaking the row.
 */
const RESOURCE_ICON: Partial<Record<AuditResourceType, IconName>> = {
  auth: 'shield',
  user: 'users',
  patient: 'patients',
  appointment: 'appointments',
  consultation: 'clipboard',
  prescription: 'pill',
  medicine: 'pill',
  inventory: 'inventory',
  lab_order: 'flask',
  lab_sample: 'flask',
  lab_result: 'flask',
  invoice: 'cash',
  payment: 'cash',
  admission: 'bed',
  settings: 'cog',
  department: 'building',
  doctor: 'doctors',
};

/**
 * Actions worth marking as consequential. Everything else is routine traffic;
 * tinting all of it would make the tint mean nothing.
 */
const NOTABLE = new Set([
  'login_failed',
  'login_blocked',
  'user_deleted',
  'user_role_changed',
  'user_status_changed',
  'settings_updated',
  'refund_recorded',
]);

/** `user_role_changed` → `Role changed`. */
const humanAction = (action: string): string => {
  const words = action.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * What has just happened in the system.
 *
 * The audit trail existed only as a page an administrator had to remember to
 * open, which meant a run of failed logins was discoverable rather than
 * visible. This is the newest of it, on the screen they land on.
 */
export default function ActivityFeedCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await getAuditLogs({ limit: SHOWN, sort: 'createdAt', order: 'desc' });
      setLogs(data.logs);
    } catch (err) {
      setLogs([]);
      setError(getErrorMessage(err, 'Unable to load recent activity.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <Card
      title="Recent activity"
      subtitle="Newest first, across the whole system"
      icon="shield"
      padded={false}
      actions={
        <Link
          to="/admin/audit-logs"
          className="-mr-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
        >
          Audit log
          <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
        </Link>
      }
    >
      <div className="px-4 py-3 sm:px-5">
        {error ? (
          <p className="py-8 text-center text-sm text-slate-500">{error}</p>
        ) : logs === null ? (
          <ul className="space-y-2" aria-label="Loading recent activity">
            {[0, 1, 2, 3, 4].map((row) => (
              <li key={row} className="h-11 w-full rounded-xl skeleton" />
            ))}
          </ul>
        ) : logs.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            description="Sign-ins, record changes, and settings updates all appear here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {logs.map((log) => {
              const notable = NOTABLE.has(log.action);
              const actor =
                log.actorId
                  ? `${log.actorId.firstName} ${log.actorId.lastName}`
                  : (log.actorLabel ?? 'System');

              return (
                <li key={log._id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${
                      notable
                        ? 'bg-amber-50 text-amber-700 ring-amber-100'
                        : 'bg-slate-50 text-slate-500 ring-slate-100'
                    }`}
                  >
                    <Icon
                      name={RESOURCE_ICON[log.resourceType] ?? 'clipboard'}
                      className="h-3.5 w-3.5"
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-pretty text-sm leading-snug text-slate-700">
                      {log.description}
                    </p>
                    <p className="mt-0.5 truncate text-[0.6875rem] text-slate-400">
                      {humanAction(log.action)} · {actor}
                      {log.actorRole && ` (${ROLE_LABELS[log.actorRole]})`}
                    </p>
                  </div>

                  <span className="shrink-0 whitespace-nowrap text-[0.6875rem] tabular-nums text-slate-400">
                    {relativeTime(log.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
