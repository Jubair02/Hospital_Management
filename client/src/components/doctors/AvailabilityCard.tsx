import { DAYS_OF_WEEK, type AvailabilitySlot } from '../../types';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import type { ReactNode } from 'react';

interface AvailabilityCardProps {
  availability: AvailabilitySlot[];
  actions?: ReactNode;
}

/** Read-only weekly availability summary. */
export default function AvailabilityCard({ availability, actions }: AvailabilityCardProps) {
  return (
    <Card title="Weekly availability" actions={actions}>
      {availability.length === 0 ? (
        <p className="text-sm text-slate-400">
          No availability configured — appointments cannot be booked yet.
        </p>
      ) : (
        <dl className="space-y-2">
          {DAYS_OF_WEEK.map((day) => {
            const slots = availability.filter((s) => s.dayOfWeek === day);
            if (slots.length === 0) return null;
            return (
              <div key={day} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <dt className="capitalize text-slate-500">{day}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {slots.map((slot, i) => (
                    <Badge key={i} tone={slot.isAvailable ? 'brand' : 'slate'}>
                      {slot.startTime}–{slot.endTime}
                      {!slot.isAvailable && ' (off)'}
                    </Badge>
                  ))}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </Card>
  );
}
