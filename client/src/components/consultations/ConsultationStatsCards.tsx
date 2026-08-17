import { useEffect, useState } from 'react';
import { getConsultationStats } from '../../services/consultationService';
import { getErrorMessage } from '../../services/api';
import type { ConsultationStats } from '../../types';
import Alert from '../ui/Alert';
import StatCard, { type StatTone } from '../ui/StatCard';
import type { IconName } from '../ui/icons';

type StatsView = 'admin' | 'doctor';

interface CardSpec {
  key: keyof ConsultationStats;
  label: string;
  hint: string;
  icon: IconName;
  tone: StatTone;
}

const CARDS: Record<StatsView, CardSpec[]> = {
  admin: [
    { key: 'totalConsultations', label: 'Total consultations', hint: 'All time', icon: 'clipboard', tone: 'brand' },
    { key: 'completedConsultations', label: 'Completed', hint: 'Locked clinical records', icon: 'check', tone: 'teal' },
    { key: 'inProgressConsultations', label: 'In progress', hint: 'Currently open', icon: 'activity', tone: 'amber' },
    { key: 'todaysConsultations', label: "Today's consultations", hint: 'Started today', icon: 'appointments', tone: 'brand' },
  ],
  doctor: [
    { key: 'todaysConsultations', label: "Today's consultations", hint: 'Started today', icon: 'appointments', tone: 'brand' },
    { key: 'completedToday', label: 'Completed today', hint: 'Records locked today', icon: 'check', tone: 'teal' },
    { key: 'inProgressConsultations', label: 'In progress', hint: 'Your open consultations', icon: 'activity', tone: 'amber' },
  ],
};

interface ConsultationStatsCardsProps {
  view: StatsView;
  /** Bumped by a dashboard's Refresh, so one control reloads every panel. */
  refreshKey?: number;
}

/** Live consultation statistics; doctor numbers are scoped server-side. */
export default function ConsultationStatsCards({
  view,
  refreshKey = 0,
}: ConsultationStatsCardsProps) {
  const [stats, setStats] = useState<ConsultationStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    getConsultationStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessage(err, 'Unable to load consultation statistics.'));
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (error) return <Alert tone="error">{error}</Alert>;

  const cards = CARDS[view];
  // Only doctors have a consultations list route, so only their tiles link.
  const to = view === 'doctor' ? '/doctor/consultations' : undefined;

  return (
    <div
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
        cards.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
      }`}
    >
      {cards.map((card) => (
        <StatCard
          key={card.key}
          label={card.label}
          value={stats ? stats[card.key] : null}
          hint={card.hint}
          icon={card.icon}
          tone={card.tone}
          to={to}
        />
      ))}
    </div>
  );
}
