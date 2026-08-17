import type { Appointment, Doctor } from '../../types';

export interface Slot {
  startTime: string;
  endTime: string;
}

export const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export const toTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * A morning and an afternoon read as different things to whoever is on the
 * phone booking this, and a flat run of thirty identical chips does not. The
 * boundaries are the ordinary ones rather than anything clinical.
 */
export const groupSlots = (slots: Slot[]): { label: string; slots: Slot[] }[] => {
  const groups: Record<string, Slot[]> = { Morning: [], Afternoon: [], Evening: [] };

  for (const slot of slots) {
    const minutes = toMinutes(slot.startTime);
    const key = minutes < 12 * 60 ? 'Morning' : minutes < 17 * 60 ? 'Afternoon' : 'Evening';
    groups[key]!.push(slot);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, slots: list }));
};

/**
 * Free slots: availability windows minus booked ranges. The slot length is
 * the `appointmentSlotMinutes` system setting, not a hard-coded constant.
 *
 * `availability` is defaulted rather than assumed: a doctor record saved
 * before the availability editor existed has no array at all, and reading
 * `.filter` off it took the whole booking page down with a blank screen.
 */
export const computeSlots = (
  doctor: Doctor,
  dateStr: string,
  booked: Appointment[],
  slotMinutes: number
): Slot[] => {
  const dayIndex = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
    dayIndex
  ];

  const windows = (doctor.availability ?? []).filter(
    (s) => s.isAvailable && s.dayOfWeek === dayName
  );
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
