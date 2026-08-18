import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPharmacyPrescriptions } from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import { relativeTime } from '../../utils/date';
import type { PharmacyPrescription, PrescriptionFulfillment } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/icons';

/** Rows before the reader is sent to the full queue. */
const SHOWN = 5;

/**
 * Prescriptions waiting to be dispensed.
 *
 * The dashboard counted them and stopped there — "8 pending" with no way to
 * see which eight or to start on one. This is the list behind that number,
 * oldest first, because a prescription that has been waiting since this
 * morning is the one to pick up next.
 *
 * `fulfillment: 'outstanding'` is doing real work here. The prescriptions
 * endpoint returns every completed prescription, dispensed ones included, so
 * asking for the list unfiltered put finished work in a queue and offered
 * "Dispense" on prescriptions that had already gone out. Filtering on the
 * server rather than after the fact also keeps the count honest: a page of
 * twenty filtered here could never say how many were outstanding overall.
 */
export default function DispensingQueueCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [prescriptions, setPrescriptions] = useState<PharmacyPrescription[] | null>(null);
  const [fulfillments, setFulfillments] = useState<PrescriptionFulfillment[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await getPharmacyPrescriptions({ limit: 20, fulfillment: 'outstanding' });
      // Oldest first: the queue is worked from the bottom of the list up.
      const ordered = [...data.consultations].sort(
        (a, b) =>
          new Date(a.consultationDate).getTime() - new Date(b.consultationDate).getTime()
      );
      setPrescriptions(ordered);
      setFulfillments(data.fulfillments);
      setTotal(data.pagination?.total ?? ordered.length);
    } catch (err) {
      setPrescriptions([]);
      setFulfillments([]);
      setError(getErrorMessage(err, 'Unable to load the dispensing queue.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  /**
   * How far through a prescription the pharmacy already is.
   *
   * Same derivation as the full prescriptions list: fulfillment is one row per
   * line, so progress is a count of those rows against the number of lines
   * prescribed. A part-dispensed prescription is still in the queue, but
   * calling its action "Dispense" implies none of it has gone out.
   */
  const progressFor = (prescription: PharmacyPrescription) => {
    const lines = fulfillments.filter((f) => f.consultationId === prescription._id);
    const done = lines.filter((f) => f.status === 'dispensed').length;
    return { started: lines.length > 0, done, of: prescription.prescriptions.length };
  };

  return (
    <Card
      title="Dispensing queue"
      subtitle="Longest waiting first"
      icon="clipboard"
      padded={false}
      actions={
        <Link
          to="/pharmacy/prescriptions"
          className="-mr-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
        >
          All prescriptions
          <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
        </Link>
      }
      footer={
        prescriptions && total > SHOWN
          ? `Showing the ${SHOWN} longest waiting of ${total}.`
          : undefined
      }
    >
      <div className="px-4 py-3 sm:px-5">
        {error ? (
          <p className="py-8 text-center text-sm text-slate-500">{error}</p>
        ) : prescriptions === null ? (
          <ul className="space-y-2" aria-label="Loading the dispensing queue">
            {[0, 1, 2, 3].map((row) => (
              <li key={row} className="h-12 w-full rounded-xl skeleton" />
            ))}
          </ul>
        ) : prescriptions.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            description="Everything prescribed has been dispensed. New prescriptions appear here as doctors complete consultations."
          />
        ) : (
          <ul className="divide-y divide-line">
            {prescriptions.slice(0, SHOWN).map((prescription) => {
              const progress = progressFor(prescription);

              return (
                <li
                  key={prescription._id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {prescription.patientId
                        ? `${prescription.patientId.firstName} ${prescription.patientId.lastName}`
                        : 'Patient removed'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      <span className="tabular-nums">{prescription.consultationId}</span>
                      {' · '}
                      {prescription.prescriptions.length}{' '}
                      {prescription.prescriptions.length === 1 ? 'medicine' : 'medicines'}
                      {' · '}
                      {relativeTime(prescription.consultationDate)}
                    </p>
                  </div>

                  {progress.started && (
                    <Badge tone="amber">
                      {progress.done}/{progress.of} done
                    </Badge>
                  )}

                  <Link to={`/pharmacy/prescriptions/${prescription._id}`}>
                    <Button size="sm">{progress.started ? 'Continue' : 'Dispense'}</Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
