import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSystemHealth } from '../../services/adminService';
import { getErrorMessage } from '../../services/api';
import { formatUptime, relativeTime } from '../../utils/date';
import type { SystemHealth } from '../../types';
import Card from '../ui/Card';
import Icon from '../ui/icons';

type Tone = 'ok' | 'warn' | 'bad';

const DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-rose-500',
};

const TEXT: Record<Tone, string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-rose-700',
};

/** A live indicator: the halo only pulses while things are healthy. */
function StatusDot({ tone }: { tone: Tone }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
      {tone === 'ok' && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${DOT[tone]}`} />
    </span>
  );
}

function Row({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string;
  tone: Tone;
  detail?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot tone={tone} />
        <span className="truncate text-sm text-slate-600">{label}</span>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold ${TEXT[tone]}`}>{value}</p>
        {detail && <p className="text-[0.6875rem] tabular-nums text-slate-400">{detail}</p>}
      </div>
    </li>
  );
}

/**
 * Whether the system itself is healthy.
 *
 * The dashboard reported on the hospital and said nothing about the software
 * running it, so the one reader who can act on a failing database — the
 * administrator — had to go looking for it on another page. Status is shown as
 * a dot plus a word, never colour alone.
 */
export default function SystemHealthCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setHealth(await getSystemHealth());
    } catch (err) {
      setHealth(null);
      setError(getErrorMessage(err, 'Unable to reach the health endpoint.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const traffic = health?.traffic;
  /**
   * Share of requests that failed inside the server. Client errors are
   * excluded on purpose: a 404 from a mistyped URL is not the software being
   * unwell, and folding them in would keep this permanently amber.
   */
  const errorRate =
    traffic && traffic.requests > 0 ? (traffic.serverErrors / traffic.requests) * 100 : 0;
  const errorTone: Tone = errorRate === 0 ? 'ok' : errorRate < 1 ? 'warn' : 'bad';

  return (
    <Card
      title="System health"
      subtitle="The software, not the hospital"
      icon="activity"
      actions={
        <Link
          to="/admin/system-health"
          className="-mr-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
        >
          Details
          <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
        </Link>
      }
    >
      {error ? (
        <p className="py-6 text-center text-sm text-slate-500">{error}</p>
      ) : !health ? (
        <ul className="space-y-2" aria-label="Loading system health">
          {[0, 1, 2].map((row) => (
            <li key={row} className="h-9 w-full rounded-lg skeleton" />
          ))}
        </ul>
      ) : (
        <>
          <ul className="divide-y divide-line">
            <Row
              label="API"
              tone={health.api.status === 'ok' ? 'ok' : 'bad'}
              value={health.api.status === 'ok' ? 'Operational' : health.api.status}
              detail={`up ${formatUptime(health.api.uptimeSeconds)}`}
            />
            <Row
              label="Database"
              tone={health.database.status === 'connected' ? 'ok' : 'bad'}
              value={health.database.status === 'connected' ? 'Connected' : health.database.status}
              detail={health.database.name ?? undefined}
            />
            <Row
              label="Server errors"
              tone={errorTone}
              value={errorRate === 0 ? 'None' : `${errorRate.toFixed(1)}%`}
              detail={
                traffic
                  ? traffic.lastServerErrorAt
                    ? `last ${relativeTime(traffic.lastServerErrorAt)}`
                    : `${traffic.requests.toLocaleString()} requests`
                  : undefined
              }
            />
          </ul>

          <p className="mt-3 border-t border-line pt-3 text-[0.6875rem] text-slate-400">
            v{health.application.version} · {health.application.environment} · Node{' '}
            {health.application.nodeVersion}
          </p>
        </>
      )}
    </Card>
  );
}
