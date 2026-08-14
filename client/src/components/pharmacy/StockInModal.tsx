import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { stockIn } from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import type { InventoryBatch, Medicine } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

interface FormState {
  medicineId: string;
  batchNumber: string;
  quantity: string;
  unitCost: string;
  sellingPrice: string;
  manufactureDate: string;
  expiryDate: string;
  notes: string;
}

const emptyForm: FormState = {
  medicineId: '',
  batchNumber: '',
  quantity: '',
  unitCost: '',
  sellingPrice: '',
  manufactureDate: '',
  expiryDate: '',
  notes: '',
};

interface StockInModalProps {
  open: boolean;
  medicines: Medicine[];
  onClose: () => void;
  onSaved: (batch: InventoryBatch) => void;
}

export default function StockInModal({ open, medicines, onClose, onSaved }: StockInModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setError('');
    setSaving(false);
  }, [open]);

  const setField =
    (name: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [name]: e.target.value }));
    };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const quantity = Number(form.quantity);
    const unitCost = Number(form.unitCost);
    const sellingPrice = Number(form.sellingPrice);

    if (!form.medicineId || !form.batchNumber.trim() || !form.expiryDate) {
      setError('Medicine, batch number, and expiry date are required.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('Quantity must be a positive whole number.');
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(sellingPrice) || sellingPrice < 0) {
      setError('Unit cost and selling price must be non-negative numbers.');
      return;
    }
    if (new Date(form.expiryDate).getTime() <= Date.now()) {
      setError('Expired stock cannot be received — the expiry date must be in the future.');
      return;
    }

    setSaving(true);
    try {
      const batch = await stockIn({
        medicineId: form.medicineId,
        batchNumber: form.batchNumber.trim(),
        quantity,
        unitCost,
        sellingPrice,
        manufactureDate: form.manufactureDate || undefined,
        expiryDate: form.expiryDate,
        notes: form.notes.trim() || undefined,
      });
      onSaved(batch);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Receive stock"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="stock-in-form" loading={saving}>
            Receive stock
          </Button>
        </>
      }
    >
      <form id="stock-in-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Select
          label="Medicine"
          value={form.medicineId}
          onChange={setField('medicineId')}
          options={medicines
            .filter((m) => m.status === 'active')
            .map((m) => ({
              value: m._id,
              label: `${m.name}${m.strength ? ` ${m.strength}` : ''} (${m.medicineId})`,
            }))}
          placeholder="Select a medicine"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Batch number" value={form.batchNumber} onChange={setField('batchNumber')} />
          <Input
            label="Quantity"
            type="number"
            min={1}
            value={form.quantity}
            onChange={setField('quantity')}
          />
          <Input
            label="Unit cost"
            type="number"
            min={0}
            step="0.01"
            value={form.unitCost}
            onChange={setField('unitCost')}
          />
          <Input
            label="Selling price"
            type="number"
            min={0}
            step="0.01"
            value={form.sellingPrice}
            onChange={setField('sellingPrice')}
          />
          <Input
            label="Manufacture date"
            type="date"
            max={today}
            value={form.manufactureDate}
            onChange={setField('manufactureDate')}
            hint="Optional"
          />
          <Input
            label="Expiry date"
            type="date"
            min={today}
            value={form.expiryDate}
            onChange={setField('expiryDate')}
          />
        </div>

        <Input label="Notes" value={form.notes} onChange={setField('notes')} hint="Optional" />
      </form>
    </Modal>
  );
}
