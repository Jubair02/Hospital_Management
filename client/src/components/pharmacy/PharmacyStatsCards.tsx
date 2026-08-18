import { useEffect, useState } from 'react';
import { getPharmacyStats } from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import type { PharmacyStats } from '../../types';
import Alert from '../ui/Alert';
import StatCard, { type StatTone } from '../ui/StatCard';
import type { IconName } from '../ui/icons';

interface CardSpec {
  key: keyof PharmacyStats;
  label: string;
  hint: string;
  icon: IconName;
  tone: StatTone;
  /** Turns the figure red once above zero. */
  alert?: boolean;
  to?: string;
}

/**
 * Only the two genuine exceptions — low stock and expired batches — carry the
 * alert treatment. If every tile shouted, none of them would.
 */
const CARDS: CardSpec[] = [
  { key: 'totalMedicines', label: 'Total medicines', hint: 'Catalog entries', icon: 'pill', tone: 'brand', to: '/pharmacy/medicines' },
  { key: 'activeMedicines', label: 'Active medicines', hint: 'Currently dispensable', icon: 'check', tone: 'teal', to: '/pharmacy/medicines' },
  { key: 'lowStockCount', label: 'Low stock', hint: 'Below reorder level', icon: 'alert', tone: 'amber', alert: true, to: '/pharmacy/inventory' },
  { key: 'expiredBatches', label: 'Expired batches', hint: 'With remaining units', icon: 'alert', tone: 'rose', alert: true, to: '/pharmacy/inventory' },
  { key: 'outstandingPrescriptions', label: 'Outstanding', hint: 'Not started or partly dispensed', icon: 'clipboard', tone: 'amber', to: '/pharmacy/prescriptions' },
  { key: 'todaysDispensings', label: "Today's dispensing", hint: 'Dispensing events today', icon: 'clock', tone: 'brand' },
];

export default function PharmacyStatsCards() {
  const [stats, setStats] = useState<PharmacyStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getPharmacyStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessage(err, 'Unable to load pharmacy statistics.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;

  return (
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
  );
}
