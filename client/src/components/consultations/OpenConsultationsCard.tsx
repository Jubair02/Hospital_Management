import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getConsultations } from '../../services/consultationService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Consultation } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Icon from '../ui/icons';

const SHOWN = 5;

/**
 * Clinical records the signed-in doctor has started and not yet locked.
 *
 * An unfinished record is the one thing on this dashboard that is actually
 * owed by the reader, so it gets a panel rather than a counter — the list
 * endpoint scopes in-progress records to their own author server-side.
 */
/**
 * Whole days between the consultation's date and today, in local time.
 *
 * Compared as calendar dates rather than by elapsed hours: a record started at
 * 23:00 and read at 08:00 the next morning has been open overnight, which is
 * the thing worth flagging, even though only nine hours have passed.
 */
const daysOpen = (date: string | undefined): number => {
  if (!date) return 0;
  const started = new Date(date);
  if (Number.isNaN(started.getTime())) return 0;

  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = midnight(new Date()) - midnight(started);
  return Math.max(0, Math.round(diff / 86_400_000));
};

export default function OpenConsultationsCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [consultations, setConsultations] = useState<Consultation[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await getConsultations({ status: 'in_progress', limit: SHOWN });
      setConsultations(data.consultations);
      setTotal(data.pagination.total);
    } catch (err) {
      setConsultations([]);
      setError(getErrorMessage(err, 'Unable to load open consultations.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <Card
      title="Open records"
      subtitle="Started, not yet locked"
      icon="clipboard"
      actions={
        <Link
          to="/doctor/consultations"
          className="-mr-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
        >
          All records
          <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
        </Link>
      }
      footer={
        consultations && total > SHOWN ? `${total} open in total.` : undefined
      }
    >
      {error ? (
        <p className="py-8 text-center text-sm text-slate-500">{error}</p>
      ) : consultations === null ? (
        <ul className="space-y-2.5" aria-label="Loading open consultations">
          {[0, 1, 2].map((row) => (
            <li key={row} className="h-11 w-full rounded-xl skeleton" />
          ))}
        </ul>
      ) : consultations.length === 0 ? (
        <div className="py-6 text-center">
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-100">
            <Icon name="check" className="h-5 w-5" strokeWidth="2.2" />
          </span>
          <p className="mt-3 text-sm font-medium text-slate-800">Nothing left open</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Every record you started has been completed and locked.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {consultations.map((consultation) => (
            <li
              key={consultation._id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">
                  {consultation.patientId
                    ? `${consultation.patientId.firstName} ${consultation.patientId.lastName}`
                    : consultation.consultationId}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 truncate text-xs text-slate-500">
                  <span className="tabular-nums">{consultation.consultationId}</span> ·{' '}
                  {formatDate(consultation.consultationDate)}
                  {/* Today's open record is simply work in progress. One from
                      an earlier day is the one nobody is coming back to, so it
                      is the only one that gets called out. */}
                  {daysOpen(consultation.consultationDate) > 0 && (
                    <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                      {daysOpen(consultation.consultationDate) === 1
                        ? 'Open since yesterday'
                        : `Open ${daysOpen(consultation.consultationDate)} days`}
                    </span>
                  )}
                </p>
              </div>

              {consultation.appointmentId ? (
                <Link
                  to={`/doctor/appointments/${consultation.appointmentId._id}/consultation`}
                  state={{ origin: { to: '/doctor/dashboard', label: 'Dashboard' } }}
                >
                  <Button size="sm">Continue</Button>
                </Link>
              ) : (
                <Link to={`/consultations/${consultation._id}`}>
                  <Button variant="ghost" size="sm">
                    Open
                  </Button>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
