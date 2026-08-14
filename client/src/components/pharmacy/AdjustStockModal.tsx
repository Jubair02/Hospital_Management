import { useEffect, useState, type FormEvent } from 'react';
import { adjustStock } from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import type { InventoryBatch } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

const TYPE_OPTIONS = [
  { value: 'adjustment', label: 'Adjustment (correction)' },
  { value: 'return', label: 'Return' },
  { value: 'expiry', label: 'Expiry write-off' },
];

interface AdjustStockModalProps {
  open: boolean;
  batch: InventoryBatch | null;
  onClose: () => void;
  onSaved: (batch: InventoryBatch) => void;
}

export default function AdjustStockModal({ open, batch, onClose, onSaved }: AdjustStockModalProps) {
  const [quantityChange, setQuantityChange] = useState('');
  const [type, setType] = useState('adjustment');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuantityChange('');
    setType('adjustment');
    setNotes('');
    setError('');
    setSaving(false);
  }, [open]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!batch) return;
    setError('');

    const change = Number(quantityChange);
    if (!Number.isInteger(change) || change === 0) {
      setError('Enter a non-zero whole number (negative removes stock).');
      return;
    }
    if (change < 0 && -change > batch.quantity) {
      setError(`Only ${batch.quantity} units are on hand — stock can never go negative.`);
      return;
    }

    setSaving(true);
    try {
      const updated = await adjustStock(batch._id, {
        quantityChange: change,
        type: type as 'adjustment' | 'return' | 'expiry',
        notes: notes.trim() || undefined,
      });
      onSaved(updated);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={`Adjust stock — ${batch?.batchNumber ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-form" loading={saving}>
            Apply adjustment
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <p className="text-sm text-slate-600">
          Current quantity: <span className="font-semibold">{batch?.quantity ?? 0}</span>
        </p>

        <Input
          label="Quantity change"
          type="number"
          value={quantityChange}
          onChange={(e) => setQuantityChange(e.target.value)}
          hint="Positive adds stock; negative removes it."
          autoFocus
        />
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={TYPE_OPTIONS}
        />
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} hint="Optional" />
      </form>
    </Modal>
  );
}
