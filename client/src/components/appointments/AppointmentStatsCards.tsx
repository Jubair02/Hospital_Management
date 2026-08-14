import { useEffect, useState } from 'react';
import { getAppointmentStats } from '../../services/appointmentService';
import { getErrorMessage } from '../../services/api';
import type { AppointmentStats } from '../../types';
import Alert from '../ui/Alert';
import StatCard, { type StatTone } from '../ui/StatCard';
import type { IconName } from '../ui/icons';

type StatsView = 'admin' | 'receptionist' | 'doctor';

interface CardSpec {
  key: keyof AppointmentStats;
  label: string;
  hint: string;
  icon: IconName;
  tone: StatTone;
}

/**
 * Tones carry meaning here rather than decoration: blue for volume, teal for
 * settled work, amber for anything still waiting on someone.
 */
const CARDS: Record<StatsView, CardSpec[]> = {
  admin: [
    { key: 'totalDoctors', label: 'Total doctors', hint: 'All doctor profiles', icon: 'doctors', tone: 'brand' },
    { key: 'activeDoctors', label: 'Active doctors', hint: 'Currently bookable', icon: 'check', tone: 'teal' },
    { key: 'todaysAppointments', label: "Today's appointments", hint: 'All statuses, today', icon: 'appointments', tone: 'brand' },
    { key: 'pendingAppointments', label: 'Pending appointments', hint: 'Awaiting confirmation', icon: 'clock', tone: 'amber' },
  ],
  receptionist: [
    { key: 'todaysAppointments', label: "Today's appointments", hint: 'All statuses, today', icon: 'appointments', tone: 'brand' },
    { key: 'scheduledToday', label: 'Scheduled', hint: 'Awaiting confirmation today', icon: 'clock', tone: 'amber' },
    { key: 'confirmedToday', label: 'Confirmed', hint: 'Confirmed for today', icon: 'check', tone: 'teal' },
    { key: 'cancelledToday', label: 'Cancelled', hint: 'Cancelled today', icon: 'x', tone: 'slate' },
  ],
  doctor: [
    { key: 'todaysAppointments', label: "Today's appointments", hint: 'Your schedule today', icon: 'appointments', tone: 'brand' },
    { key: 'upcomingAppointments', label: 'Upcoming', hint: 'Booked after today', icon: 'clock', tone: 'brand' },
    { key: 'completedToday', label: 'Completed today', hint: 'Visits finished today', icon: 'check', tone: 'teal' },
  ],
};

/** Live appointment statistics; the API scopes doctor numbers server-side. */
export default function AppointmentStatsCards({ view }: { view: StatsView }) {
  const [stats, setStats] = useState<AppointmentStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    getAppointmentStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessage(err, 'Unable to load appointment statistics.'));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;

  const cards = CARDS[view];
  // The appointments list lives under the role's own path, exactly as the
  // navigation builds it, so each tile can open the records behind it.
  const to = `/${view}/appointments`;

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
