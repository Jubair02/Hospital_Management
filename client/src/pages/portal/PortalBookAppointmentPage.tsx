import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  bookAppointment,
  getBookingDepartments,
  getBookingDoctors,
  getBookingSlots,
} from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import type {
  PortalBookingSlot,
  PortalDepartment,
  PortalDoctor,
} from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import PageHeader from '../../components/ui/PageHeader';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';
import Textarea from '../../components/ui/Textarea';

const todayStr = (): string => new Date().toISOString().slice(0, 10);

/**
 * Guided self-service booking: department → doctor → date → free slot →
 * reason. Free slots come from the server, which computes them from the
 * doctor's availability minus existing bookings — no other patient's
 * appointment data ever reaches this page.
 */
export default function PortalBookAppointmentPage() {
  const navigate = useNavigate();

  const [departments, setDepartments] = useState<PortalDepartment[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [doctors, setDoctors] = useState<PortalDoctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<PortalBookingSlot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<PortalBookingSlot | null>(null);
  const [reason, setReason] = useState('');

  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBookingDepartments()
      .then(setDepartments)
      .catch((err) => setError(getErrorMessage(err, 'Unable to load departments.')));
  }, []);

  useEffect(() => {
    setDoctorId('');
    setDoctors([]);
    if (!departmentId) return;
    getBookingDoctors(departmentId)
      .then(setDoctors)
      .catch((err) => setError(getErrorMessage(err, 'Unable to load doctors.')));
  }, [departmentId]);

  const loadSlots = useCallback(async () => {
    setSelectedSlot(null);
    if (!doctorId || !date) {
      setSlots(null);
      return;
    }
    setSlotsLoading(true);
    setError('');
    try {
      setSlots(await getBookingSlots(doctorId, date));
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load available times.'));
      setSlots(null);
    } finally {
      setSlotsLoading(false);
    }
  }, [doctorId, date]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleSubmit = async () => {
    if (!doctorId || !date || !selectedSlot || !reason.trim()) {
      setSubmitError('Pick a doctor, a date, a free time, and tell us the reason for your visit.');
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      const appointment = await bookAppointment({
        doctorId,
        appointmentDate: date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        reason: reason.trim(),
      });
      navigate(`/patient/appointments/${appointment._id}`, {
        state: { flash: `Appointment ${appointment.appointmentId} booked.` },
      });
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Unable to book this appointment.'));
      // The slot may have just been taken — refresh the grid.
      loadSlots();
    } finally {
      setSaving(false);
    }
  };

  const selectedDoctor = doctors.find((d) => d._id === doctorId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title="Book an appointment"
        subtitle="Choose a department and doctor, then pick any free time."
        actions={
          <Link to="/patient/appointments">
            <Button variant="secondary">Back to appointments</Button>
          </Link>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card title="1 · Who would you like to see?">
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
              label: `Dr. ${d.firstName} ${d.lastName}${d.specialization ? ` — ${d.specialization}` : ''}`,
            }))}
            placeholder={departmentId ? 'Select a doctor' : 'Pick a department first'}
            disabled={!departmentId}
          />
        </div>
      </Card>

      <Card title="2 · When suits you?">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Date"
            type="date"
            min={todayStr()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={!doctorId}
            hint={doctorId ? undefined : 'Pick a doctor first'}
          />

          <div>
            <p className="mb-1.5 block text-sm font-medium text-slate-700">Available times</p>
            {slotsLoading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                <Spinner size="sm" className="text-brand-600" /> Checking availability…
              </div>
            ) : slots === null ? (
              <p className="py-2 text-sm text-slate-400">Choose a doctor and date.</p>
            ) : slots.length === 0 ? (
              <p className="py-2 text-sm text-slate-500">
                {selectedDoctor
                  ? `Dr. ${selectedDoctor.lastName} has no free times on this date. Try another day.`
                  : 'No free times on this date.'}
              </p>
            ) : (
              <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                {slots.map((slot) => {
                  const active = selectedSlot?.startTime === slot.startTime;
                  return (
                    <button
                      key={slot.startTime}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      aria-pressed={active}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors ${
                        active
                          ? 'bg-brand-600 text-white ring-brand-600'
                          : 'bg-white text-slate-700 ring-line-strong hover:bg-slate-50'
                      }`}
                    >
                      {slot.startTime}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="3 · What is the visit about?">
        <Textarea
          label="Reason for visit"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Describe your symptoms or the purpose of the visit"
        />

        {submitError && (
          <div className="mt-4">
            <Alert tone="error">{submitError}</Alert>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {selectedSlot && date
              ? `Selected: ${date} at ${selectedSlot.startTime}–${selectedSlot.endTime}`
              : 'No time selected yet.'}
          </p>
          <Button onClick={handleSubmit} loading={saving} disabled={!selectedSlot || !reason.trim()}>
            Confirm booking
          </Button>
        </div>
      </Card>
    </div>
  );
}
