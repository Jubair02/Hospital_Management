import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPatients } from '../../services/patientService';
import { getDepartments } from '../../services/departmentService';
import { getDoctors } from '../../services/doctorService';
import { getAppointments } from '../../services/appointmentService';
import { getErrorMessage } from '../../services/api';
import useSettings from '../../hooks/useSettings';
import type {
  CreateAppointmentPayload,
  Department,
  Doctor,
  Patient,
} from '../../types';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Icon from '../ui/icons';
import { formatDate, localDay } from '../../utils/date';
import { computeSlots, groupSlots, type Slot } from './appointmentSlots';

interface AppointmentFormProps {
  onSubmit: (payload: CreateAppointmentPayload) => Promise<void>;
  onCancel: () => void;
}

/**
 * Guided booking flow: patient → department → doctor → date → available
 * slot → reason → confirm. Only free slots inside the doctor's
 * availability can be selected; the backend re-validates everything.
 */
export default function AppointmentForm({ onSubmit, onCancel }: AppointmentFormProps) {
  const { appointmentSlotMinutes } = useSettings();

  // Step data
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  /**
   * Held separately from the search results. Typing again re-runs the search,
   * and the chosen patient can drop out of the new page of results — the id
   * stayed selected but the dropdown fell back to its placeholder, so the form
   * looked empty while it was in fact ready to submit.
   */
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d._id === doctorId),
    [doctors, doctorId]
  );

  // Departments once.
  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load departments.')));
  }, []);

  // Patient search (debounced, active patients only).
  useEffect(() => {
    const t = setTimeout(() => {
      getPatients({ search: patientSearch.trim() || undefined, status: 'active', limit: 20 })
        .then((data) => setPatients(data.patients))
        .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load patients.')));
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch]);

  // Doctors for the chosen department (active only).
  useEffect(() => {
    setDoctorId('');
    if (!departmentId) {
      setDoctors([]);
      return;
    }
    getDoctors({ departmentId, status: 'active', limit: 100 })
      .then((data) => setDoctors(data.doctors))
      .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load doctors.')));
  }, [departmentId]);

  // Free slots for doctor + date.
  const loadSlots = useCallback(async () => {
    if (!selectedDoctor || !date) {
      setSlots(null);
      return;
    }
    setSlotsLoading(true);
    setSelectedSlot(null);
    try {
      const booked = await getAppointments({
        doctorId: selectedDoctor._id,
        dateFrom: date,
        dateTo: date,
        limit: 100,
      });
      setSlots(computeSlots(selectedDoctor, date, booked.appointments, appointmentSlotMinutes));
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load available times.'));
      setSlots(null);
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedDoctor, date, appointmentSlotMinutes]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleSubmit = async () => {
    setSubmitError('');

    if (!patientId || !doctorId || !date || !selectedSlot) {
      setSubmitError('Select a patient, doctor, date, and time slot.');
      return;
    }
    if (!reason.trim()) {
      setSubmitError('Enter a reason for the visit.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        patientId,
        doctorId,
        appointmentDate: date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to book the appointment.');
      setSaving(false);
      // The slot may have just been taken — refresh the picker.
      loadSlots();
    }
  };

  const today = localDay();

  // The chosen patient is kept in the list even when a later search no longer
  // returns them, so the dropdown never blanks out a live selection.
  const patientOptions = useMemo(() => {
    const label = (p: Patient) => `${p.firstName} ${p.lastName} (${p.patientId})`;
    const options = patients.map((p) => ({ value: p._id, label: label(p) }));

    if (selectedPatient && !patients.some((p) => p._id === selectedPatient._id)) {
      options.unshift({ value: selectedPatient._id, label: label(selectedPatient) });
    }
    return options;
  }, [patients, selectedPatient]);

  /** The first thing still missing, phrased as the next thing to do. */
  const nextStep = !patientId
    ? 'Choose a patient to continue.'
    : !doctorId
      ? 'Choose a department and doctor.'
      : !selectedSlot
        ? 'Pick a date and an available time.'
        : !reason.trim()
          ? 'Add a reason for the visit.'
          : null;

  const grouped = slots ? groupSlots(slots) : [];

  return (
    // Steps on the left, what you are about to book on the right. The summary
    // sticks, so the confirm button is reachable from any point in the form
    // rather than only after scrolling past every step.
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-6">
        {error && <Alert tone="error">{error}</Alert>}

        <Card title="1 · Patient" icon="patients" actions={patientId && <StepDone />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Find patient"
              placeholder="Search by name, ID, or phone"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
            <Select
              label="Patient"
              value={patientId}
              onChange={(e) => {
                setPatientId(e.target.value);
                setSelectedPatient(patients.find((p) => p._id === e.target.value) ?? null);
              }}
              options={patientOptions}
              placeholder={
                patientOptions.length ? 'Select a patient' : 'No matching active patients'
              }
            />
          </div>
        </Card>

        <Card title="2 · Doctor" icon="doctors" actions={doctorId && <StepDone />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              options={departments.map((d) => ({ value: d._id, label: d.name }))}
              placeholder="Select a department"
            />
            <Select
              label="Doctor"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              options={doctors.map((d) => ({
                value: d._id,
                label: `Dr. ${d.firstName} ${d.lastName} — ${d.specialization}`,
              }))}
              placeholder={
                !departmentId
                  ? 'Choose a department first'
                  : doctors.length
                    ? 'Select a doctor'
                    : 'No active doctors in this department'
              }
              disabled={!departmentId}
            />
          </div>
        </Card>

        <Card title="3 · Date and time" icon="appointments" actions={selectedSlot && <StepDone />}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              label="Date"
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={!doctorId}
              hint={!doctorId ? 'Choose a doctor first' : undefined}
              className="sm:w-56"
            />
            {/* Most bookings taken at a desk are for today or tomorrow. */}
            <div className="flex gap-2">
              {[
                { label: 'Today', value: today },
                { label: 'Tomorrow', value: localDay(1) },
              ].map((quick) => (
                <Button
                  key={quick.label}
                  variant={date === quick.value ? 'primary' : 'secondary'}
                  size="sm"
                  disabled={!doctorId}
                  onClick={() => setDate(quick.value)}
                >
                  {quick.label}
                </Button>
              ))}
            </div>
          </div>

          {slotsLoading && (
            <div className="mt-5 space-y-3" aria-label="Loading available times">
              <div className="h-3 w-24 rounded-md skeleton" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((chip) => (
                  <div key={chip} className="h-11 rounded-xl skeleton" />
                ))}
              </div>
            </div>
          )}

          {!slotsLoading && slots && (
            <div className="mt-5">
              {slots.length === 0 ? (
                <Alert tone="warning">
                  Dr. {selectedDoctor?.lastName} has no free time on this date. Pick another day.
                </Alert>
              ) : (
                <div className="space-y-5">
                  <p className="text-sm text-slate-500">
                    <span className="font-semibold tabular-nums text-slate-800">
                      {slots.length}
                    </span>{' '}
                    {slots.length === 1 ? 'time' : 'times'} free ·{' '}
                    {appointmentSlotMinutes} minutes each
                  </p>

                  {grouped.map((group) => (
                    <div key={group.label}>
                      <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        {group.label}
                      </h3>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {group.slots.map((slot) => {
                          const active = selectedSlot?.startTime === slot.startTime;
                          return (
                            <button
                              key={slot.startTime}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              aria-pressed={active}
                              className={`min-h-11 rounded-xl border text-sm font-medium tabular-nums transition duration-200 active:scale-[0.98]
                                ${
                                  active
                                    ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                                    : 'border-line-strong bg-white text-slate-700 hover:border-brand-400 hover:bg-brand-50/60 hover:text-brand-800'
                                }`}
                            >
                              {slot.startTime}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="4 · Visit details" icon="clipboard" actions={reason.trim() && <StepDone />}>
          <div className="space-y-4">
            <Textarea
              label={
                <>
                  Reason<span aria-hidden="true" className="text-rose-500"> *</span>
                </>
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Chest pain follow-up"
            />
            <Textarea
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              hint="Optional — visible to staff"
            />
          </div>
        </Card>
      </div>

      <div className="lg:sticky lg:top-24">
        <Card title="Booking summary" icon="check">
          <dl className="space-y-3">
            <SummaryRow
              label="Patient"
              value={
                selectedPatient &&
                `${selectedPatient.firstName} ${selectedPatient.lastName} · ${selectedPatient.patientId}`
              }
            />
            <SummaryRow
              label="Doctor"
              value={selectedDoctor && `Dr. ${selectedDoctor.firstName} ${selectedDoctor.lastName}`}
            />
            <SummaryRow label="Date" value={date && formatDate(date)} />
            <SummaryRow
              label="Time"
              value={
                selectedSlot &&
                `${selectedSlot.startTime}–${selectedSlot.endTime} (${appointmentSlotMinutes} min)`
              }
            />
          </dl>

          {submitError && (
            <Alert tone="error" className="mt-4">
              {submitError}
            </Alert>
          )}

          {nextStep && !submitError && (
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-line">
              {nextStep}
            </p>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row-reverse lg:flex-col-reverse">
            <Button
              className="w-full"
              loading={saving}
              disabled={Boolean(nextStep)}
              onClick={handleSubmit}
            >
              {saving ? 'Booking…' : 'Confirm appointment'}
            </Button>
            <Button variant="secondary" className="w-full" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Quiet tick beside a step's title once it has what it needs. */
function StepDone() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700">
      <Icon name="check" className="h-3.5 w-3.5" strokeWidth="2.5" />
      Done
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string | null | false }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-3 last:border-0 last:pb-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</dt>
      <dd
        className={`min-w-0 text-right text-sm ${
          value ? 'font-medium text-slate-900' : 'text-slate-400'
        }`}
      >
        {value || 'Not chosen'}
      </dd>
    </div>
  );
}
