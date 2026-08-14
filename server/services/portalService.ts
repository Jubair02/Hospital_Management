import Appointment, { BLOCKING_STATUSES } from '../models/Appointment.js';
import Doctor, { DAYS_OF_WEEK } from '../models/Doctor.js';
import { toCalendarDate } from './appointmentService.js';
import { getSetting } from './settingsService.js';
import ApiError from '../utils/ApiError.js';

export interface BookingSlot {
  startTime: string;
  endTime: string;
}

const toMinutes = (time: string): number => {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
};

const toTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Free booking slots for a doctor on a calendar date, computed
 * SERVER-SIDE for the patient portal.
 *
 * The staff booking form fetches the doctor's availability plus the
 * day's appointments and derives slots in the browser — acceptable for
 * staff, who may see the schedule anyway. A patient must not receive
 * other patients' appointment records, so here the subtraction happens
 * on the server and only anonymous free ranges leave the API.
 *
 * Availability windows and blocking statuses are the SAME data the
 * staff flow and bookAppointment() use, so a slot offered here is a
 * slot the booking service will accept (barring a concurrent claim,
 * which bookAppointment resolves).
 */
export const getAvailableSlots = async (
  doctorId: string,
  dateStr: string
): Promise<BookingSlot[]> => {
  if (!DATE_RE.test(dateStr)) {
    throw new ApiError(400, 'Date must be in YYYY-MM-DD format.');
  }

  const doctor = await Doctor.findById(doctorId);
  if (!doctor || doctor.status !== 'active') {
    throw new ApiError(404, 'Doctor not found');
  }

  const date = toCalendarDate(dateStr);
  const today = new Date();
  const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(
    today.getUTCDate()
  ).padStart(2, '0')}`;
  if (dateStr < todayStr) {
    return []; // the past has no free slots
  }

  const slotMinutes = await getSetting('appointmentSlotMinutes');
  const dayName = DAYS_OF_WEEK[date.getUTCDay()]!;

  const windows = doctor.availability.filter(
    (slot) => slot.isAvailable && slot.dayOfWeek === dayName
  );
  if (windows.length === 0) return [];

  const booked = await Appointment.find(
    { doctorId: doctor._id, appointmentDate: date, status: { $in: BLOCKING_STATUSES } },
    { startTime: 1, endTime: 1 }
  );
  const busy = booked.map((a) => ({ start: toMinutes(a.startTime), end: toMinutes(a.endTime) }));

  const slots: BookingSlot[] = [];
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

/** Fields a patient may edit on their own record: contact and social
 * details only. Identity (name, DOB, gender), clinical data (blood
 * group, medical history, allergies), and status are staff-maintained. */
export const PORTAL_EDITABLE_FIELDS = [
  'phone',
  'email',
  'address',
  'emergencyContact',
  'emergencyContactName',
  'emergencyContactRelation',
  'maritalStatus',
  'occupation',
] as const;
export type PortalEditableField = (typeof PORTAL_EDITABLE_FIELDS)[number];
