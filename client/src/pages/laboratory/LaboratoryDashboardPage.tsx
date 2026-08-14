import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getLaboratoryStats } from '../../services/laboratoryService';
import { getErrorMessage } from '../../services/api';
import { ROLE_LABELS } from '../../utils/constants';
import type { LaboratoryStats } from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';
import StatCard, { type StatTone } from '../../components/ui/StatCard';
import Icon, { type IconName } from '../../components/ui/icons';

interface CardSpec {
  key: keyof LaboratoryStats;
  label: string;
  hint: string;
  icon: IconName;
  tone: StatTone;
  alert?: boolean;
  to?: string;
}

const CARDS: CardSpec[] = [
  { key: 'pendingOrders', label: 'Pending orders', hint: 'Awaiting sample collection', icon: 'flask', tone: 'amber', to: '/laboratory/orders' },
  { key: 'samplesAwaitingCollection', label: 'Samples to collect', hint: 'Pending sample records', icon: 'inventory', tone: 'amber' },
  { key: 'testsInProcessing', label: 'Tests in processing', hint: 'Collected, awaiting results', icon: 'activity', tone: 'brand' },
  { key: 'completedTests', label: 'Completed tests', hint: 'Verified results', icon: 'check', tone: 'teal', to: '/laboratory/results' },
  { key: 'urgentOrders', label: 'Urgent orders', hint: 'Open orders marked urgent', icon: 'alert', tone: 'rose', alert: true, to: '/laboratory/orders' },
  { key: 'todaysOrders', label: "Today's orders", hint: 'Ordered since midnight', icon: 'appointments', tone: 'brand', to: '/laboratory/orders' },
];

export default function LaboratoryDashboardPage() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<LaboratoryStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getLaboratoryStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessage(err, 'Unable to load laboratory statistics.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={role ? ROLE_LABELS[role] : undefined}
        title="Laboratory"
        subtitle={`Welcome, ${user?.firstName ?? ''} — the sample pipeline from request through to verified result.`.trim()}
        actions={
          <>
            <Link to="/laboratory/orders">
              <Button>
                <Icon name="flask" className="h-4 w-4" />
                Orders
              </Button>
            </Link>
            <Link to="/laboratory/samples">
              <Button variant="secondary">Samples</Button>
            </Link>
            <Link to="/laboratory/results">
              <Button variant="ghost">Results</Button>
            </Link>
          </>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <section className="space-y-3">
        <SectionHeading title="Pipeline" hint="Where work is sitting right now" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <StatCard
              key={card.key}
              label={card.label}
              value={stats ? stats[card.key] : null}
              hint={card.hint}
              icon={card.icon}
              tone={card.tone}
              alert={card.alert}
              to={card.to}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
