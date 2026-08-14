import { useEffect, useState } from 'react';
import useAuth from '../../hooks/useAuth';
import { getPatientStats } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import { ROLES } from '../../utils/constants';
import type { PatientStats } from '../../types';
import Alert from '../ui/Alert';
import StatCard, { type StatTone } from '../ui/StatCard';
import type { IconName } from '../ui/icons';

interface CardSpec {
  key: keyof PatientStats;
  label: string;
  hint: string;
  icon: IconName;
  tone: StatTone;
}

const CARDS: CardSpec[] = [
  { key: 'totalPatients', label: 'Total patients', hint: 'All registered patients', icon: 'patients', tone: 'brand' },
  { key: 'activePatients', label: 'Active patients', hint: 'Currently receiving care', icon: 'activity', tone: 'teal' },
  { key: 'inactivePatients', label: 'Inactive patients', hint: 'Deactivated records', icon: 'users', tone: 'slate' },
  { key: 'newPatientsThisMonth', label: 'New this month', hint: 'Registered since the 1st', icon: 'plus', tone: 'brand' },
];

/** Real patient statistics for the admin and receptionist dashboards. */
export default function PatientStatsCards() {
  const { role } = useAuth();
  const [stats, setStats] = useState<PatientStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    getPatientStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessage(err, 'Unable to load patient statistics.'));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <Alert tone="error">{error}</Alert>;
  }

  // Mirrors how the navigation builds the patients path, so a tile only links
  // where the role actually has a patients list.
  const hasPatientList =
    role === ROLES.ADMIN ||
    role === ROLES.DOCTOR ||
    role === ROLES.RECEPTIONIST ||
    role === ROLES.NURSE;
  const to = hasPatientList ? `/${role}/patients` : undefined;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map((card) => (
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
