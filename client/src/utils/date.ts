/** Age in whole years for an ISO date-of-birth string. */
export const calculateAge = (dateOfBirth: string): number => {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 0;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(age, 0);
};

/** Locale date like "12 Aug 2026"; empty string for invalid input. */
export const formatDate = (value: string | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "3d 4h 12m" for a duration in seconds; drops units that are zero. */
export const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${Math.floor(seconds % 60)}s`;
};

/**
 * Coarse "how long ago" for activity feeds — "4m ago", "2h ago". Falls back to
 * an absolute date past a week, because "38d ago" is harder to place than
 * "6 Jul".
 */
export const relativeTime = (value: string | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** yyyy-MM-dd for a date input's value attribute. */
export const toDateInputValue = (value: string | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

/**
 * Today — or a day either side of it — as the local calendar date.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which converts to UTC first.
 * The hospital's default timezone is six hours ahead of it, so between
 * midnight and 06:00 local that returns *yesterday*: a `min` on a date input
 * would quietly permit a date in the past, and a "Today" shortcut would fill
 * in the wrong day for anyone working a night shift.
 */
export const localDay = (offsetDays = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * A date-only value that falls before today, in local time.
 *
 * Compared as calendar dates, not instants: an appointment at 09:00 this
 * morning is not overdue at 14:00 — the day is still running. Yesterday's is.
 */
export const isBeforeToday = (value: string | undefined): boolean => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return midnight(date) < midnight(new Date());
};
