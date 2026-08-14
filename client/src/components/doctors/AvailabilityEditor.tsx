import { useState } from 'react';
import { DAYS_OF_WEEK, type AvailabilitySlot, type DayOfWeek } from '../../types';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayLabel = (day: DayOfWeek): string => day.charAt(0).toUpperCase() + day.slice(1);

interface AvailabilityEditorProps {
  initial: AvailabilitySlot[];
  onSave: (slots: AvailabilitySlot[]) => Promise<void>;
}

/**
 * Weekly availability editor: one section per day, any number of time
 * windows each. Sends the complete replacement set on save.
 */
export default function AvailabilityEditor({ initial, onSave }: AvailabilityEditorProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>(initial);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const addSlot = (dayOfWeek: DayOfWeek) => {
    setSlots((s) => [...s, { dayOfWeek, startTime: '09:00', endTime: '17:00', isAvailable: true }]);
  };

  const removeSlot = (index: number) => {
    setSlots((s) => s.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, patch: Partial<AvailabilitySlot>) => {
    setSlots((s) => s.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
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

    setSaving(true);
    try {
      await onSave(slots);
      setNotice('Availability saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save availability.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {DAYS_OF_WEEK.map((day) => {
        const daySlots = slots
          .map((slot, index) => ({ slot, index }))
          .filter(({ slot }) => slot.dayOfWeek === day);

        return (
          <Card key={day}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{dayLabel(day)}</h3>
              <Button variant="ghost" size="sm" onClick={() => addSlot(day)}>
                + Add time window
              </Button>
            </div>

            {daySlots.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">Not available.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {daySlots.map(({ slot, index }) => (
                  <div key={index} className="flex flex-wrap items-center gap-3">
                    <Input
                      type="time"
                      value={slot.startTime}
                      onChange={(e) => updateSlot(index, { startTime: e.target.value })}
                      aria-label={`${dayLabel(day)} start time`}
                    />
                    <span className="text-slate-400">–</span>
                    <Input
                      type="time"
                      value={slot.endTime}
                      onChange={(e) => updateSlot(index, { endTime: e.target.value })}
                      aria-label={`${dayLabel(day)} end time`}
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={slot.isAvailable}
                        onChange={(e) => updateSlot(index, { isAvailable: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                      />
                      Available
                    </label>
                    <Button variant="ghost" size="sm" onClick={() => removeSlot(index)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      <div className="flex justify-end">
        <Button loading={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save availability'}
        </Button>
      </div>
    </div>
  );
}
