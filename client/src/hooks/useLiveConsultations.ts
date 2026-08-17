import { useCallback, useEffect, useState } from 'react';
import { getConsultations } from '../services/consultationService';
import type { Consultation } from '../types';

/**
 * The doctor's open clinical records, keyed by the appointment each belongs to.
 *
 * Appointment status cannot answer "is a record open for this one?", though it
 * looks like it can. `confirmed` only means a consultation was started at some
 * point — the record may since have been cancelled, which releases the
 * appointment to need a fresh start, and an appointment can also be confirmed
 * by the front desk without any consultation existing. The records themselves
 * are the only reliable answer, and one request covers a whole page of rows.
 *
 * Server-side scoping does the filtering: the consultations list already
 * restricts a doctor to their own work, so no doctor id is needed here and no
 * one else's records can arrive.
 */
export default function useLiveConsultations(
  enabled: boolean,
  refreshKey = 0
): Map<string, Consultation> {
  const [open, setOpen] = useState<Map<string, Consultation>>(new Map());

  const load = useCallback(async () => {
    if (!enabled) {
      setOpen(new Map());
      return;
    }

    try {
      const data = await getConsultations({ status: 'in_progress', limit: 100 });
      const next = new Map<string, Consultation>();
      for (const consultation of data.consultations) {
        if (consultation.appointmentId) next.set(consultation.appointmentId._id, consultation);
      }
      setOpen(next);
    } catch {
      // Losing this costs a button its label, not the page its contents — the
      // row still opens the workbench, which decides for itself what is
      // possible. Failing loudly here would be worse than falling back.
      setOpen(new Map());
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return open;
}
