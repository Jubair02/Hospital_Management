import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getAuditLogs, getSystemHealth } from '../../services/adminService';
import { getDepartments } from '../../services/departmentService';
import { fetchUsers } from '../../services/userService';
import { getErrorMessage } from '../../services/api';
import useSettings from '../../hooks/useSettings';
import { ROLE_LABELS } from '../../utils/constants';
import { formatUptime, relativeTime } from '../../utils/date';
import type { AuditLogEntry, SystemHealth } from '../../types';
import Alert from '../../components/ui/Alert';
import Badge, { type BadgeTone } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import PageHeader from '../../components/ui/PageHeader';
import Icon, { type IconName } from '../../components/ui/icons';

/**
 * The administration hub. It is deliberately not a menu of six identical
 * cards: an administrator landing here wants to know whether anything is
 * wrong before they want a list of links, so the live system state comes
 * first, the destinations carry their own figures, and the newest audit
 * entries sit alongside rather than two clicks away.
 */

interface Destination {
  to: string;
  icon: IconName;
  title: string;
  description: string;
}

/**
 * Grouped rather than flat. Six equally-weighted tiles force the reader to
 * re-read every label; three named groups of two let them skip straight to
 * the half of the page they came for.
 */
const GROUPS: { label: string; items: Destination[] }[] = [
  {
    label: 'Accounts & access',
    items: [
      {
        to: '/admin/users',
        icon: 'users',
        title: 'Users',
        description:
          'Create staff accounts, change roles, and activate, deactivate, or suspend access.',
      },
      {
        to: '/admin/audit-logs',
        icon: 'shield',
        title: 'Audit logs',
        description:
          'Read-only trail of logins, permission changes, and clinical or financial actions.',
      },
    ],
  },
  {
    label: 'Configuration',
    items: [
      {
        to: '/admin/departments',
        icon: 'building',
        title: 'Departments',
        description: 'Clinical departments used by doctors, appointments, and wards.',
      },
      {
        to: '/admin/settings',
        icon: 'cog',
        title: 'System settings',
        description:
          'Hospital identity, currency, appointment slot length, and alert preferences.',
      },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      {
        to: '/admin/system-health',
        icon: 'activity',
        title: 'System health',
        description: 'API and database status, uptime, version, and request and error counters.',
      },
      {
        to: '/analytics',
        icon: 'reports',
        title: 'Analytics',
        description: 'Hospital-wide activity, revenue, and the detailed report pages.',
      },
    ],
  },
];

/** "user_status_changed" → "User status changed" */
const humanize = (value: string): string =>
  value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const statusTone = (status: string | undefined): BadgeTone => {
  if (status === 'ok' || status === 'connected') return 'green';
  if (status === 'connecting') return 'amber';
  return 'red';
};

interface Overview {
  health: SystemHealth | null;
  accounts: { total: number; active: number; suspended: number; inactive: number } | null;
  departments: { active: number; inactive: number } | null;
  activity: { logs: AuditLogEntry[]; total: number } | null;
}

const EMPTY: Overview = { health: null, accounts: null, departments: null, activity: null };

const settled = <T,>(result: PromiseSettledResult<T>): T | null =>
  result.status === 'fulfilled' ? result.value : null;

/** Uppercase micro-label used above every figure on this page. */
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
      {children}
    </p>
  );
}

function Figure({
  label,
  value,
  loading,
  alert = false,
}: {
  label: string;
  value: string;
  loading: boolean;
  alert?: boolean;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      {loading ? (
        <div className="mt-2 h-6 w-16 rounded-md skeleton" aria-label="Loading" />
      ) : (
        <p
          className={`mt-1.5 truncate text-xl font-semibold leading-none tabular-nums ${
            alert ? 'text-rose-600' : 'text-slate-900'
          }`}
        >
          {value}
        </p>
      )}
    </div>
  );
}

/** One service and its state. The dot carries the status; the badge names it. */
function ServiceRow({
  name,
  status,
  detail,
}: {
  name: string;
  status: string | undefined;
  detail: string;
}) {
  const healthy = status === 'ok' || status === 'connected';

  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ring-2 ${
            healthy ? 'bg-accent-500 ring-accent-100' : 'bg-rose-500 ring-rose-100'
          }`}
          aria-hidden="true"
        />
        <span className="truncate text-sm font-medium text-slate-800">{name}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-xs tabular-nums text-slate-500">{detail}</span>
        <Badge tone={statusTone(status)}>{status ?? 'unknown'}</Badge>
      </span>
    </li>
  );
}

export default function AdminPanelPage() {
  const { settings } = useSettings();
  const [data, setData] = useState<Overview>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    // Counts come from `pagination.total` with `limit: 1` so the browser never
    // downloads a staff list just to render a number. Settled rather than
    // all-or-nothing: one failing panel should not blank the page.
    const results = await Promise.allSettled([
      getSystemHealth(),
      fetchUsers({ limit: 1 }),
      fetchUsers({ limit: 1, status: 'active' }),
      fetchUsers({ limit: 1, status: 'suspended' }),
      getDepartments(),
      getAuditLogs({ limit: 5 }),
    ]);
    const [health, all, active, suspended, departments, audit] = results;

    const total = settled(all)?.pagination.total;
    const activeCount = settled(active)?.pagination.total;
    const suspendedCount = settled(suspended)?.pagination.total;
    const departmentList = settled(departments);
    const auditData = settled(audit);

    setData({
      health: settled(health),
      accounts:
        total !== undefined && activeCount !== undefined && suspendedCount !== undefined
          ? {
              total,
              active: activeCount,
              suspended: suspendedCount,
              // The three server-side statuses are exhaustive, so the
              // remainder is the inactive set — one request fewer.
              inactive: Math.max(0, total - activeCount - suspendedCount),
            }
          : null,
      departments: departmentList
        ? {
            active: departmentList.filter((d) => d.status === 'active').length,
            inactive: departmentList.filter((d) => d.status !== 'active').length,
          }
        : null,
      activity: auditData ? { logs: auditData.logs, total: auditData.pagination.total } : null,
    });

    const failure = results.find((r) => r.status === 'rejected');
    if (failure) {
      setError(
        getErrorMessage(
          (failure as PromiseRejectedResult).reason,
          'Some panels could not be loaded.'
        )
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { health, accounts, departments, activity } = data;
  const pending = loading && !health;

  const traffic = health?.traffic;
  const errorRate =
    traffic && traffic.requests > 0
      ? ((traffic.serverErrors / traffic.requests) * 100).toFixed(2)
      : '0.00';

  /** Live figure shown beside a destination's title. */
  const metricFor = (to: string): ReactNode => {
    if (to === '/admin/users' && accounts) {
      return (
        <Badge tone={accounts.suspended > 0 ? 'red' : 'slate'}>
          {accounts.suspended > 0
            ? `${accounts.suspended} suspended`
            : `${accounts.total} accounts`}
        </Badge>
      );
    }
    if (to === '/admin/audit-logs' && activity) {
      return <Badge tone="slate">{activity.total.toLocaleString()} entries</Badge>;
    }
    if (to === '/admin/departments' && departments) {
      return <Badge tone="slate">{departments.active} active</Badge>;
    }
    if (to === '/admin/settings' && settings) {
      return <Badge tone="slate">Saved {relativeTime(settings.updatedAt)}</Badge>;
    }
    if (to === '/admin/system-health' && health) {
      return <Badge tone={statusTone(health.api.status)}>{health.api.status}</Badge>;
    }
    return null;
  };

  const accountBreakdown = [
    { label: 'Active', value: accounts?.active ?? 0, swatch: 'bg-accent-600' },
    { label: 'Inactive', value: accounts?.inactive ?? 0, swatch: 'bg-slate-300' },
    { label: 'Suspended', value: accounts?.suspended ?? 0, swatch: 'bg-rose-500' },
  ];
  const accountTotal = accounts?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Administration"
        subtitle="Accounts, security, configuration, and the live state of the services behind them."
        meta={
          pending ? (
            <div className="h-6 w-64 rounded-full skeleton" aria-label="Loading system state" />
          ) : health ? (
            <>
              <Badge tone={statusTone(health.api.status)}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                {health.api.status === 'ok' && health.database.status === 'connected'
                  ? 'All services operational'
                  : 'Service degraded'}
              </Badge>
              <span className="text-xs tabular-nums text-slate-500">
                Up {formatUptime(health.api.uptimeSeconds)}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="text-xs text-slate-500">
                v{health.application.version} on {health.application.environment}
              </span>
            </>
          ) : null
        }
        actions={
          <>
            <Button variant="secondary" onClick={load} loading={loading && Boolean(health)}>
              Refresh
            </Button>
            <Link to="/admin/dashboard">
              <Button variant="ghost">Operating picture</Button>
            </Link>
          </>
        }
      />

      {error && (
        <Alert tone="warning" title="Incomplete data">
          {error} Figures shown below may be out of date.
        </Alert>
      )}

      {/* Two unequal zones over one hairline: what is running, and what it has
          been asked to do. Deliberately not a row of matching KPI tiles —
          service state and traffic volume are different kinds of fact. */}
      <Card padded={false}>
        <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:divide-x lg:divide-y-0">
          <div className="p-5">
            <FieldLabel>Services</FieldLabel>
            {pending ? (
              <div className="mt-4 space-y-3">
                <div className="h-5 w-full rounded-md skeleton" aria-label="Loading" />
                <div className="h-5 w-4/5 rounded-md skeleton" />
              </div>
            ) : (
              <ul className="mt-3.5 space-y-3">
                <ServiceRow
                  name="API"
                  status={health?.api.status}
                  detail={health ? `Node ${health.application.nodeVersion}` : '—'}
                />
                <ServiceRow
                  name="Database"
                  status={health?.database.status}
                  detail={health?.database.name ?? '—'}
                />
              </ul>
            )}
          </div>

          <div className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <FieldLabel>Traffic since restart</FieldLabel>
              {!pending && traffic && (
                <p className="text-xs text-slate-400">
                  since {new Date(traffic.startedAt).toLocaleString()}
                </p>
              )}
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <Figure
                label="Requests"
                value={traffic?.requests.toLocaleString() ?? '—'}
                loading={pending}
              />
              <Figure
                label="4xx"
                value={traffic?.clientErrors.toLocaleString() ?? '—'}
                loading={pending}
              />
              <Figure
                label="5xx"
                value={traffic?.serverErrors.toLocaleString() ?? '—'}
                loading={pending}
                alert={Boolean(traffic && traffic.serverErrors > 0)}
              />
              <Figure
                label="Error rate"
                value={`${errorRate}%`}
                loading={pending}
                alert={Number(errorRate) >= 1}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Asymmetric: destinations take two thirds, live context one third. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <nav aria-label="Administration sections">
            {GROUPS.map((group, index) => (
              <section key={group.label} className={index > 0 ? 'border-t border-line' : ''}>
                <h2 className="border-b border-line bg-slate-50/70 px-5 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  {group.label}
                </h2>
                <ul className="divide-y divide-line">
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className="group flex items-start gap-4 px-5 py-4 transition-colors duration-200 hover:bg-brand-50/60 active:bg-brand-100/60"
                      >
                        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white group-hover:ring-brand-600">
                          <Icon name={item.icon} className="h-[1.125rem] w-[1.125rem]" />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="text-[0.9375rem] font-semibold text-slate-900">
                              {item.title}
                            </span>
                            {metricFor(item.to)}
                          </span>
                          <span className="mt-1 block text-sm leading-relaxed text-pretty text-slate-500">
                            {item.description}
                          </span>
                        </span>

                        <Icon
                          name="chevronRight"
                          className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </Card>

        <div className="space-y-5">
          <Card
            title="Staff accounts"
            icon="users"
            actions={
              <Link to="/admin/users">
                <Button variant="secondary" size="sm">
                  Manage
                </Button>
              </Link>
            }
            footer={
              departments
                ? `${departments.active} active department${departments.active === 1 ? '' : 's'}${
                    departments.inactive > 0 ? ` · ${departments.inactive} archived` : ''
                  }`
                : 'Department counts unavailable'
            }
          >
            {pending || !accounts ? (
              <div className="space-y-3">
                <div className="h-9 w-24 rounded-md skeleton" aria-label="Loading" />
                <div className="h-2 w-full rounded-full skeleton" />
                <div className="h-4 w-3/4 rounded-md skeleton" />
              </div>
            ) : (
              <>
                <p className="text-[2rem] font-semibold leading-none tabular-nums text-slate-900">
                  {accounts.total.toLocaleString()}
                </p>
                <p className="mt-1.5 text-xs text-slate-500">accounts with portal access</p>

                {/* Proportion first, then the numbers — the shape of the split
                    is readable before any figure is. */}
                <div
                  className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-100"
                  aria-hidden="true"
                >
                  {accountBreakdown.map((part) =>
                    part.value > 0 ? (
                      <span
                        key={part.label}
                        // `min-w` so a single suspended account among hundreds
                        // still draws — a sub-pixel segment is the same as a
                        // missing one.
                        className={`min-w-[0.1875rem] ${part.swatch}`}
                        style={{ width: `${(part.value / Math.max(accountTotal, 1)) * 100}%` }}
                      />
                    ) : null
                  )}
                </div>

                <dl className="mt-4 space-y-2.5">
                  {accountBreakdown.map((part) => (
                    <div key={part.label} className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2 text-sm text-slate-600">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${part.swatch}`}
                          aria-hidden="true"
                        />
                        {part.label}
                      </dt>
                      <dd
                        className={`text-sm font-semibold tabular-nums ${
                          part.label === 'Suspended' && part.value > 0
                            ? 'text-rose-600'
                            : 'text-slate-800'
                        }`}
                      >
                        {part.value.toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Card>

          <Card
            title="Recent activity"
            subtitle="Newest entries in the audit trail"
            icon="shield"
            padded={false}
            actions={
              <Link
                to="/admin/audit-logs"
                className="text-xs font-semibold text-brand-700 transition-colors hover:text-brand-800"
              >
                Full trail →
              </Link>
            }
          >
            {pending ? (
              <ul className="divide-y divide-line">
                {[0, 1, 2, 3].map((row) => (
                  <li key={row} className="space-y-2 px-5 py-3.5">
                    <div className="h-4 w-2/5 rounded-md skeleton" aria-label="Loading" />
                    <div className="h-3 w-4/5 rounded-md skeleton" />
                  </li>
                ))}
              </ul>
            ) : activity && activity.logs.length > 0 ? (
              <ol className="divide-y divide-line">
                {activity.logs.map((log) => {
                  const actor =
                    log.actorLabel ??
                    (log.actorId ? `${log.actorId.firstName} ${log.actorId.lastName}` : 'System');

                  return (
                    <li key={log._id} className="px-5 py-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 text-[0.8125rem] font-semibold text-slate-800">
                          {humanize(log.action)}
                        </p>
                        <time
                          dateTime={log.createdAt}
                          title={new Date(log.createdAt).toLocaleString()}
                          className="shrink-0 text-[0.6875rem] tabular-nums text-slate-400"
                        >
                          {relativeTime(log.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-pretty text-slate-500">
                        {log.description}
                      </p>
                      <p className="mt-1.5 text-[0.6875rem] text-slate-400">
                        {actor}
                        {log.actorRole && ` · ${ROLE_LABELS[log.actorRole]}`}
                      </p>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="px-5">
                <EmptyState
                  title="Nothing recorded yet"
                  description="Logins, role changes, and clinical or financial actions appear here as staff use the portal."
                />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
