import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAppointments } from '../../services/appointmentService';
import { getErrorMessage } from '../../services/api';
import { localDay } from '../../utils/date';
import type { Appointment } from '../../types';
import Card from '../ui/Card';
import Icon from '../ui/icons';

/** Today plus the six days after it — a working week from wherever you stand. */
const DAYS = 7;

interface DayBucket {
  iso: string;
  date: Date;
  appointments: Appointment[];
}

/**
 * The week a doctor is about to work.
 *
 * The dashboard answers "who is coming today" and the appointments list answers
 * "find me one", but nothing answered "what does Thursday look like" — the
 * question behind swapping a clinic, booking leave, or agreeing to a meeting.
 * One row per day, with the load and the first few times.
 */
export default function WeekAheadCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [days, setDays] = useState<DayBucket[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      // One request for the range, then bucketed here — seven requests for
      // seven days would be seven round trips for one glance.
      const data = await getAppointments({
        dateFrom: localDay(),
        dateTo: localDay(DAYS - 1),
        limit: 200,
      });

      const buckets: DayBucket[] = Array.from({ length: DAYS }, (_, offset) => {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        return { iso: localDay(offset), date, appointments: [] };
      });

      for (const appointment of data.appointments) {
        // The stored value is a UTC midnight; compare on the date part alone
        // so a timezone offset cannot shift an appointment into the day before.
        const iso = appointment.appointmentDate.slice(0, 10);
        const bucket = buckets.find((b) => b.iso === iso);
        if (bucket) bucket.appointments.push(appointment);
      }

      for (const bucket of buckets) {
        bucket.appointments.sort((a, b) => a.startTime.localeCompare(b.startTime));
      }

      setDays(buckets);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load the week ahead.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const busiest = days?.reduce((max, d) => Math.max(max, d.appointments.length), 0) ?? 0;
  const total = days?.reduce((sum, d) => sum + d.appointments.length, 0) ?? 0;

  return (
    <Card
      title="The week ahead"
      subtitle="Today and the next six days"
      icon="appointments"
      footer={
        days ? `${total} appointment${total === 1 ? '' : 's'} booked across the week.` : undefined
      }
    >
      {error ? (
        <p className="py-8 text-center text-sm text-slate-500">{error}</p>
      ) : days === null ? (
        <ul className="space-y-2" aria-label="Loading the week ahead">
          {[0, 1, 2, 3, 4].map((row) => (
            <li key={row} className="h-10 w-full rounded-xl skeleton" />
          ))}
        </ul>
      ) : (
        <ul className="space-y-1">
          {days.map((day, index) => {
            const count = day.appointments.length;
            // Bars are relative to the busiest day, so the week's shape reads
            // at a glance whatever the absolute numbers happen to be.
            const share = busiest === 0 ? 0 : (count / busiest) * 100;

            return (
              <li key={day.iso}>
                <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-200 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p
                      className={`truncate text-sm font-medium ${
                        index === 0 ? 'text-brand-700' : 'text-slate-800'
                      }`}
                    >
                      {index === 0
                        ? 'Today'
                        : day.date.toLocaleDateString(undefined, { weekday: 'short' })}
                    </p>
                    <p className="text-[0.6875rem] tabular-nums text-slate-400">
                      {day.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </p>
                  </div>

                  <div className="min-w-0">
                    {count === 0 ? (
                      <p className="text-xs text-slate-400">Clear</p>
                    ) : (
                      <>
                        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <span
                            className="block h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-out"
                            style={{ width: `${Math.max(share, 6)}%` }}
                          />
                        </span>
                        <p className="mt-1 truncate text-[0.6875rem] tabular-nums text-slate-500">
                          {day.appointments
                            .slice(0, 3)
                            .map((a) => a.startTime)
                            .join(' · ')}
                          {count > 3 && ` +${count - 3}`}
                        </p>
                      </>
                    )}
                  </div>

                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      count === 0 ? 'text-slate-300' : 'text-slate-900'
                    }`}
                  >
                    {count}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {days && total === 0 && !error && (
        <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-slate-500">
          Nothing is booked in the next seven days. Check that your{' '}
          <Link
            to="/doctor/availability"
            className="font-semibold text-brand-700 transition-colors hover:text-brand-800"
          >
            availability
          </Link>{' '}
          covers the days you expect to work.
          <Icon name="arrowRight" className="ml-1 inline h-3 w-3" strokeWidth="2.2" />
        </p>
      )}
    </Card>
  );
}
