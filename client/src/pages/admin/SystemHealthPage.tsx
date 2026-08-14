import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getSystemHealth } from '../../services/adminService';
import { getErrorMessage } from '../../services/api';
import { formatUptime } from '../../utils/date';
import type { SystemHealth } from '../../types';
import Alert from '../../components/ui/Alert';
import Badge, { type BadgeTone } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';

const statusTone = (status: string): BadgeTone => {
  if (status === 'ok' || status === 'connected') return 'green';
  if (status === 'connecting') return 'amber';
  return 'red';
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setHealth(await getSystemHealth());
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load system health.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const errorRate =
    health && health.traffic.requests > 0
      ? ((health.traffic.serverErrors / health.traffic.requests) * 100).toFixed(2)
      : '0.00';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">System health</h1>
          <p className="mt-1 text-sm text-slate-500">
            Live service state and request counters since the last server start.
          </p>
        </div>
        <Button variant="secondary" onClick={load} loading={loading && Boolean(health)}>
          Refresh
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && !health ? (
        <div className="flex justify-center py-16">
          <Spinner className="text-brand-700" />
        </div>
      ) : (
        health && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="API">
              <dl>
                <Row
                  label="Status"
                  value={<Badge tone={statusTone(health.api.status)}>{health.api.status}</Badge>}
                />
                <Row label="Uptime" value={formatUptime(health.api.uptimeSeconds)} />
                <Row
                  label="Started"
                  value={new Date(health.traffic.startedAt).toLocaleString()}
                />
              </dl>
            </Card>

            <Card title="Database">
              <dl>
                <Row
                  label="Connection"
                  value={
                    <Badge tone={statusTone(health.database.status)}>
                      {health.database.status}
                    </Badge>
                  }
                />
                <Row label="Database" value={health.database.name ?? '—'} />
              </dl>
              <p className="mt-3 text-xs text-slate-400">
                Host, user, and connection string are never exposed by this endpoint.
              </p>
            </Card>

            <Card title="Application">
              <dl>
                <Row label="Version" value={health.application.version} />
                <Row label="Environment" value={health.application.environment} />
                <Row label="Node" value={health.application.nodeVersion} />
              </dl>
            </Card>

            <Card title="Traffic & errors" className="lg:col-span-3">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: 'Requests', value: health.traffic.requests.toLocaleString() },
                  {
                    label: 'Client errors (4xx)',
                    value: health.traffic.clientErrors.toLocaleString(),
                  },
                  {
                    label: 'Server errors (5xx)',
                    value: health.traffic.serverErrors.toLocaleString(),
                  },
                  { label: 'Server error rate', value: `${errorRate}%` },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{stat.label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Last server error:{' '}
                {health.traffic.lastServerErrorAt
                  ? new Date(health.traffic.lastServerErrorAt).toLocaleString()
                  : 'none since start'}
              </p>
            </Card>
          </div>
        )
      )}
    </div>
  );
}
