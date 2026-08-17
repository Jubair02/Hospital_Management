import { useState } from 'react';
import { DAYS_OF_WEEK, type Appointment, type AvailabilitySlot, type DayOfWeek } from '../../types';
import { formatDate } from '../../utils/date';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Icon from '../ui/icons';
import ConfirmDialog from '../ui/ConfirmDialog';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayLabel = (day: DayOfWeek): string => day.charAt(0).toUpperCase() + day.slice(1);

/** "Mon" — for the overview, where seven full names would set the column width. */
const dayAbbreviation = (day: DayOfWeek): string => dayLabel(day).slice(0, 3);

const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const fromMinutes = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** "6h 30m", or "6h" when it lands on the hour. */
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

const slotMinutes = (slot: AvailabilitySlot): number =>
  Math.max(0, toMinutes(slot.endTime) - toMinutes(slot.startTime));

/**
 * Shared row template for the overview: day label, track, total. Repeated on
 * each row rather than expressed as `subgrid`, which Safari only learned in 16
 * and which fails to a broken layout rather than to a plain one.
 */
const OVERVIEW_ROW =
  'grid grid-cols-[2.5rem_minmax(0,1fr)_3.5rem] items-center gap-x-3 sm:grid-cols-[3rem_minmax(0,1fr)_4rem] sm:gap-x-4';

interface AvailabilityEditorProps {
  initial: AvailabilitySlot[];
  onSave: (slots: AvailabilitySlot[]) => Promise<void>;
  /**
   * Booked appointments the proposed windows would no longer cover. Returning
   * any of them turns Save into a confirmation rather than an action.
   */
  findStranded?: (slots: AvailabilitySlot[]) => Appointment[];
}

/**
 * Weekly availability: one row per day, any number of time windows each.
 * Sends the complete replacement set on save.
 *
 * Laid out to the full width of the page rather than down a reading column. A
 * week is seven things and a screen is wide, so the days sit two abreast above
 * `2xl`, and the overview at the top spends that width on the one question the
 * numbers alone cannot answer: *where* in the day the hours actually fall.
 */
export default function AvailabilityEditor({
  initial,
  onSave,
  findStranded,
}: AvailabilityEditorProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>(initial);
  const [saved, setSaved] = useState<AvailabilitySlot[]>(initial);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [stranded, setStranded] = useState<Appointment[] | null>(null);

  const addSlot = (dayOfWeek: DayOfWeek) => {
    setSlots((s) => [...s, { dayOfWeek, startTime: '09:00', endTime: '17:00', isAvailable: true }]);
    setNotice('');
  };

  const removeSlot = (index: number) => {
    setSlots((s) => s.filter((_, i) => i !== index));
    setNotice('');
  };

  const updateSlot = (index: number, patch: Partial<AvailabilitySlot>) => {
    setSlots((s) => s.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
    setNotice('');
  };

  const validate = (): string => {
    for (const slot of slots) {
      if (!TIME_RE.test(slot.startTime) || !TIME_RE.test(slot.endTime)) {
        return `${dayLabel(slot.dayOfWeek)}: times must be HH:MM (24-hour).`;
      }
      if (slot.startTime >= slot.endTime) {
        return `${dayLabel(slot.dayOfWeek)}: end time must be after start time.`;
      }
    }
    return '';
  };

  const handleSave = async () => {
    setError('');
    setNotice('');

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    // Ask before leaving a booked patient outside every window.
    const orphaned = findStranded?.(slots) ?? [];
    if (orphaned.length > 0) {
      setStranded(orphaned);
      return;
    }

    await commit();
  };

  const commit = async () => {
    setStranded(null);
    setSaving(true);
    try {
      await onSave(slots);
      setSaved(slots);
      setNotice('Availability saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save availability.');
    } finally {
      setSaving(false);
    }
  };

  const dirty = JSON.stringify(slots) !== JSON.stringify(saved);

  // Only bookable windows count: a paused one is still on the record but the
  // booking screen will not offer it.
  const bookable = slots.filter((s) => s.isAvailable);
  const weeklyMinutes = bookable.reduce((total, s) => total + slotMinutes(s), 0);
  const daysCovered = new Set(bookable.map((s) => s.dayOfWeek)).size;

  return (
    <div className="space-y-4">
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <WeekOverview slots={slots} weeklyMinutes={weeklyMinutes} daysCovered={daysCovered} />

      <Card
        title="Weekly schedule"
        subtitle="Only windows marked bookable are offered when someone books."
        icon="clock"
        padded={false}
        actions={
          <span className="text-xs text-slate-500">
            <span className="font-semibold tabular-nums text-slate-800">{slots.length}</span>{' '}
            {slots.length === 1 ? 'window' : 'windows'}
          </span>
        }
      >
        {/* Hairlines drawn by the gap rather than by borders on each cell: the
            grid gains a second axis above `2xl`, and `divide-y` cannot draw the
            vertical one without odd/even rules that break as the count changes. */}
        <ul className="grid gap-px bg-line 2xl:grid-cols-2">
          {DAYS_OF_WEEK.map((day, dayIndex) => {
            const daySlots = slots
              .map((slot, index) => ({ slot, index }))
              .filter(({ slot }) => slot.dayOfWeek === day);
            const dayMinutes = daySlots
              .filter(({ slot }) => slot.isAvailable)
              .reduce((total, { slot }) => total + slotMinutes(slot), 0);

            return (
              <li
                key={day}
                className={`grid gap-3 bg-white px-5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start sm:gap-5 ${
                  // Seven days into two columns leaves the last one alone on a
                  // half-width row; spanning both reads as intended instead.
                  dayIndex === DAYS_OF_WEEK.length - 1 ? '2xl:col-span-2' : ''
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 sm:block">
                  <h3 className="text-sm font-semibold text-slate-800">{dayLabel(day)}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {daySlots.length === 0 ? (
                      'No windows'
                    ) : (
                      <>
                        {daySlots.length} window{daySlots.length === 1 ? '' : 's'}
                        {dayMinutes > 0 && (
                          <>
                            {' · '}
                            <span className="font-semibold tabular-nums text-slate-700">
                              {formatDuration(dayMinutes)}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>

                <div className="min-w-0">
                  {daySlots.length === 0 ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-slate-500">Not available</p>
                      <Button variant="secondary" size="sm" onClick={() => addSlot(day)}>
                        <Icon name="plus" className="h-3.5 w-3.5" strokeWidth="2.2" />
                        Add window
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {daySlots.map(({ slot, index }) => (
                        <div
                          key={index}
                          className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 transition-colors duration-200 sm:gap-3 ${
                            slot.isAvailable
                              ? 'border-line bg-white shadow-xs'
                              : 'border-dashed border-line-strong bg-slate-50'
                          }`}
                        >
                          <Input
                            type="time"
                            value={slot.startTime}
                            onChange={(e) => updateSlot(index, { startTime: e.target.value })}
                            aria-label={`${dayLabel(day)} start time`}
                            className="w-[7.5rem] shrink-0"
                          />
                          <span aria-hidden="true" className="text-slate-400">
                            –
                          </span>
                          <Input
                            type="time"
                            value={slot.endTime}
                            onChange={(e) => updateSlot(index, { endTime: e.target.value })}
                            aria-label={`${dayLabel(day)} end time`}
                            className="w-[7.5rem] shrink-0"
                          />

                          <span className="hidden text-xs tabular-nums text-slate-500 md:inline">
                            {formatDuration(slotMinutes(slot))}
                          </span>

                          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                            <input
                              type="checkbox"
                              checked={slot.isAvailable}
                              onChange={(e) =>
                                updateSlot(index, { isAvailable: e.target.checked })
                              }
                              className="h-4 w-4 accent-brand-600"
                            />
                            Bookable
                          </label>

                          <button
                            type="button"
                            onClick={() => removeSlot(index)}
                            aria-label={`Remove ${dayLabel(day)} ${slot.startTime}–${slot.endTime}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Icon name="x" className="h-4 w-4" />
                          </button>
                        </div>
                      ))}

                      <Button variant="ghost" size="sm" onClick={() => addSlot(day)}>
                        <Icon name="plus" className="h-3.5 w-3.5" strokeWidth="2.2" />
                        Add window
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Pinned while the week is longer than the viewport, so saving never
          means scrolling back past every day first. */}
      <div className="sticky bottom-0 -mx-1 px-1 pb-1 pt-2">
        <div className="surface-card flex flex-col gap-3 p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500" aria-live="polite">
            {dirty ? 'You have unsaved changes.' : 'Everything here is saved.'}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={!dirty || saving}
              onClick={() => {
                setSlots(saved);
                setError('');
                setNotice('');
              }}
            >
              Discard changes
            </Button>
            <Button
              className="w-full sm:w-auto"
              loading={saving}
              disabled={!dirty}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'Save availability'}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={stranded !== null}
        title="Some booked appointments fall outside these hours"
        confirmLabel="Save anyway"
        tone="danger"
        busy={saving}
        onConfirm={commit}
        onCancel={() => setStranded(null)}
      >
        <div className="space-y-3">
          <p>
            Saving does not move or cancel anything. These{' '}
            {stranded?.length === 1 ? 'appointment stays' : 'appointments stay'} exactly where
            they are — they simply sit outside the hours you are about to set, so nobody will be
            reminded they are there.
          </p>

          <ul className="space-y-1.5 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-line">
            {stranded?.slice(0, 5).map((appointment) => (
              <li key={appointment._id} className="text-sm text-slate-700">
                <span className="font-medium tabular-nums">
                  {formatDate(appointment.appointmentDate)} · {appointment.startTime}
                </span>
                {appointment.patientId && (
                  <span className="text-slate-500">
                    {' — '}
                    {appointment.patientId.firstName} {appointment.patientId.lastName}
                  </span>
                )}
              </li>
            ))}
            {stranded && stranded.length > 5 && (
              <li className="text-xs text-slate-500">+ {stranded.length - 5} more</li>
            )}
          </ul>

          <p className="text-slate-500">
            To move them, ask reception to reschedule — a doctor cannot change an appointment's
            time.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}

/**
 * The week drawn against a clock.
 *
 * Seven rows on one shared axis, so a lopsided week — everything crammed into
 * two mornings, or a Thursday that stops at noon — is visible as a shape before
 * any time is read. The axis spans only the hours actually in use, because a
 * fixed midnight-to-midnight ruler would squeeze every real clinic into the
 * middle third of the width.
 */
function WeekOverview({
  slots,
  weeklyMinutes,
  daysCovered,
}: {
  slots: AvailabilitySlot[];
  weeklyMinutes: number;
  daysCovered: number;
}) {
  const drawable = slots.filter((slot) => slotMinutes(slot) > 0);
  const hasPaused = slots.some((slot) => !slot.isAvailable);

  // A default working day while nothing is set, so the ruler is never blank.
  const earliest = drawable.length
    ? Math.min(...drawable.map((slot) => toMinutes(slot.startTime)))
    : 8 * 60;
  const latest = drawable.length
    ? Math.max(...drawable.map((slot) => toMinutes(slot.endTime)))
    : 18 * 60;

  const axisStart = Math.floor(earliest / 60) * 60;
  const axisEnd = Math.max(Math.ceil(latest / 60) * 60, axisStart + 60);
  const span = axisEnd - axisStart;

  // At most seven labels, always landing on the hour.
  const step = Math.max(1, Math.ceil(span / 60 / 6)) * 60;
  const ticks: number[] = [];
  for (let minute = axisStart; minute <= axisEnd; minute += step) ticks.push(minute);
  if (ticks[ticks.length - 1] !== axisEnd) ticks.push(axisEnd);

  const offset = (minute: number): number => ((minute - axisStart) / span) * 100;

  return (
    <Card
      title="Week at a glance"
      subtitle="Where the bookable hours sit"
      icon="activity"
      actions={
        <span className="text-xs text-slate-500">
          <span className="font-semibold tabular-nums text-slate-800">
            {formatDuration(weeklyMinutes)}
          </span>{' '}
          across{' '}
          <span className="font-semibold tabular-nums text-slate-800">{daysCovered}</span>{' '}
          {daysCovered === 1 ? 'day' : 'days'}
        </span>
      }
    >
      {/* The ruler, then one track per day, every row on the same three-column
          template so the day labels and the totals hold their columns however
          wide the track gets. */}
      <div className="space-y-1.5">
        <div className={`${OVERVIEW_ROW} h-4`} aria-hidden="true">
          <span />
          <div className="relative h-4">
            {ticks.map((tick, index) => {
              const last = index === ticks.length - 1;
              return (
                <span
                  key={tick}
                  className="absolute top-0 text-[0.625rem] font-medium tabular-nums text-slate-400"
                  style={
                    index === 0
                      ? { left: 0 }
                      : last
                        ? { right: 0 }
                        : { left: `${offset(tick)}%`, transform: 'translateX(-50%)' }
                  }
                >
                  {fromMinutes(tick)}
                </span>
              );
            })}
          </div>
          <span />
        </div>

        {DAYS_OF_WEEK.map((day) => {
          const daySlots = drawable.filter((slot) => slot.dayOfWeek === day);
          const dayMinutes = daySlots
            .filter((slot) => slot.isAvailable)
            .reduce((total, slot) => total + slotMinutes(slot), 0);

          const description = daySlots.length
            ? daySlots
                .map(
                  (slot) =>
                    `${slot.startTime}–${slot.endTime}${slot.isAvailable ? '' : ' (paused)'}`
                )
                .join(', ')
            : 'not available';

          return (
            <div key={day} className={OVERVIEW_ROW}>
              <span className="text-xs font-semibold text-slate-600">{dayAbbreviation(day)}</span>

              <div
                role="img"
                aria-label={`${dayLabel(day)}: ${description}`}
                className="relative h-7 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-inset ring-line"
              >
                {daySlots.map((slot, index) => (
                  <span
                    key={`${slot.startTime}-${slot.endTime}-${index}`}
                    title={`${slot.startTime}–${slot.endTime}`}
                    className={`absolute inset-y-1 rounded-md transition-all duration-300 ease-out ${
                      slot.isAvailable
                        ? 'bg-brand-500'
                        : 'bg-slate-300 ring-1 ring-inset ring-slate-400/40'
                    }`}
                    style={{
                      left: `${offset(toMinutes(slot.startTime))}%`,
                      width: `${Math.max(offset(toMinutes(slot.endTime)) - offset(toMinutes(slot.startTime)), 1.5)}%`,
                    }}
                  />
                ))}
              </div>

              <span className="text-right text-xs tabular-nums text-slate-500">
                {dayMinutes > 0 ? formatDuration(dayMinutes) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-brand-500" />
          Bookable
        </span>
        {hasPaused && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
            Paused — kept on the record, never offered
          </span>
        )}
        {drawable.length === 0 && (
          <span>No windows yet. Add one below and it appears here straight away.</span>
        )}
      </div>
    </Card>
  );
}
