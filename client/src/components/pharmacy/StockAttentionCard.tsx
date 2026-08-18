import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getInventory } from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { InventoryBatch } from '../../types';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/icons';

const SHOWN = 5;

/** Days left before expiry, from a batch's date. */
const daysUntil = (iso: string): number =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

const medicineName = (batch: InventoryBatch): string => {
  const medicine = batch.medicineId;
  if (!medicine || typeof medicine === 'string') return 'Unknown medicine';
  return medicine.strength ? `${medicine.name} ${medicine.strength}` : medicine.name;
};

/**
 * Stock that will become a problem if nobody touches it.
 *
 * Expiry is the one pharmacy number that gets worse on its own, and it was
 * only visible by going to Inventory and choosing a filter — which means it
 * was only seen by someone already looking for it. Soonest first, because the
 * ordering is the priority.
 */
export default function StockAttentionCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [batches, setBatches] = useState<InventoryBatch[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await getInventory({ view: 'expiring_soon', limit: 20 });
      const ordered = [...data.batches].sort(
        (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
      );
      setBatches(ordered);
    } catch (err) {
      setBatches([]);
      setError(getErrorMessage(err, 'Unable to load stock warnings.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <Card
      title="Expiring soon"
      subtitle="Within 30 days, soonest first"
      icon="inventory"
      padded={false}
      actions={
        <Link
          to="/pharmacy/inventory"
          className="-mr-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
        >
          Inventory
          <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
        </Link>
      }
      footer={
        batches && batches.length > SHOWN
          ? `${batches.length} batches expire within 30 days.`
          : undefined
      }
    >
      <div className="px-4 py-3 sm:px-5">
        {error ? (
          <p className="py-8 text-center text-sm text-slate-500">{error}</p>
        ) : batches === null ? (
          <ul className="space-y-2" aria-label="Loading stock warnings">
            {[0, 1, 2].map((row) => (
              <li key={row} className="h-11 w-full rounded-xl skeleton" />
            ))}
          </ul>
        ) : batches.length === 0 ? (
          <EmptyState
            title="Nothing expiring"
            description="No batch on the shelf expires within the next 30 days."
          />
        ) : (
          <ul className="divide-y divide-line">
            {batches.slice(0, SHOWN).map((batch) => {
              const days = daysUntil(batch.expiryDate);

              return (
                <li
                  key={batch._id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {medicineName(batch)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      <span className="tabular-nums">{batch.batchNumber}</span> ·{' '}
                      <span className="tabular-nums">{batch.quantity}</span> left ·{' '}
                      {formatDate(batch.expiryDate)}
                    </p>
                  </div>

                  {/* This view is future expiries only, so nothing here is
                      already expired — the split is "this week" against the
                      rest of the month. Already-expired stock is its own tile
                      on the board above. */}
                  <Badge tone={days <= 7 ? 'amber' : 'slate'}>{days}d</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
