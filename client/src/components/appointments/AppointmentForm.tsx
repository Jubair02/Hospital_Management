import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPatients } from '../../services/patientService';
import { getDepartments } from '../../services/departmentService';
import { getDoctors } from '../../services/doctorService';
import { getAppointments } from '../../services/appointmentService';
import { getErrorMessage } from '../../services/api';
import useSettings from '../../hooks/useSettings';
import type {
  Appointment,
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
import Spinner from '../ui/Spinner';

const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const toTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

interface Slot {
  startTime: string;
  endTime: string;
}

/**
 * Free slots: availability windows minus booked ranges. The slot length is
 * the `appointmentSlotMinutes` system setting, not a hard-coded constant.
 */
const computeSlots = (
  doctor: Doctor,
  dateStr: string,
  booked: Appointment[],
  slotMinutes: number
): Slot[] => {
  const dayIndex = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
    dayIndex
  ];

  const windows = doctor.availability.filter((s) => s.isAvailable && s.dayOfWeek === dayName);
  const busy = booked
    .filter((a) => a.status === 'scheduled' || a.status === 'confirmed')
    .map((a) => ({ start: toMinutes(a.startTime), end: toMinutes(a.endTime) }));

  const slots: Slot[] = [];
  for (const window of windows) {
    const windowStart = toMinutes(window.startTime);
    const windowEnd = toMinutes(window.endTime);
    for (let start = windowStart; start + slotMinutes <= windowEnd; start += slotMinutes) {
      const end = start + slotMinutes;
      const overlaps = busy.some((b) => start < b.end && end > b.start);
      if (!overlaps) slots.push({ startTime: toTime(start), endTime: toTime(end) });
    }
  }
  return slots;
};

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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      <Card title="1 · Patient">
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
            onChange={(e) => setPatientId(e.target.value)}
            options={patients.map((p) => ({
              value: p._id,
              label: `${p.firstName} ${p.lastName} (${p.patientId})`,
            }))}
            placeholder={patients.length ? 'Select a patient' : 'No matching active patients'}
          />
        </div>
      </Card>

      <Card title="2 · Doctor">
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

      <Card title="3 · Date & time">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Date"
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={!doctorId}
            hint={!doctorId ? 'Choose a doctor first' : undefined}
          />
        </div>

        {slotsLoading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Spinner size="sm" className="text-brand-700" /> Loading available times…
          </div>
        )}

        {!slotsLoading && slots && (
          <div className="mt-4">
            {slots.length === 0 ? (
              <Alert tone="warning">
                Dr. {selectedDoctor?.lastName} has no free time on this date. Pick another day.
              </Alert>
            ) : (
              <>
                <p className="mb-2 text-sm font-medium text-slate-700">Available times</p>
                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => {
                    const active = selectedSlot?.startTime === slot.startTime;
                    return (
                      <button
                        key={slot.startTime}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        aria-pressed={active}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
                          ${
                            active
                              ? 'border-brand-700 bg-brand-700 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500 hover:text-brand-800'
                          }`}
                      >
                        {slot.startTime}–{slot.endTime}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <Card title="4 · Visit details">
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

      {submitError && <Alert tone="error">{submitError}</Alert>}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          loading={saving}
          disabled={!patientId || !selectedSlot || !reason.trim()}
          onClick={handleSubmit}
        >
          {saving ? 'Booking…' : 'Confirm appointment'}
        </Button>
      </div>
    </div>
  );
}
