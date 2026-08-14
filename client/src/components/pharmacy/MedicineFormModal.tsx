import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { createMedicine, updateMedicine } from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import type { Medicine, MedicineCategory } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

interface FormState {
  name: string;
  genericName: string;
  brandName: string;
  category: string;
  dosageForm: string;
  strength: string;
  manufacturer: string;
  prescriptionRequired: boolean;
  reorderLevel: string;
}

const emptyForm: FormState = {
  name: '',
  genericName: '',
  brandName: '',
  category: '',
  dosageForm: '',
  strength: '',
  manufacturer: '',
  prescriptionRequired: true,
  reorderLevel: '10',
};

interface MedicineFormModalProps {
  open: boolean;
  medicine?: Medicine | null;
  categories: MedicineCategory[];
  onClose: () => void;
  onSaved: (medicine: Medicine, wasEdit: boolean) => void;
}

export default function MedicineFormModal({
  open,
  medicine = null,
  categories,
  onClose,
  onSaved,
}: MedicineFormModalProps) {
  const isEdit = Boolean(medicine);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      medicine
        ? {
            name: medicine.name,
            genericName: medicine.genericName ?? '',
            brandName: medicine.brandName ?? '',
            category:
              typeof medicine.category === 'object' && medicine.category
                ? medicine.category._id
                : (medicine.category as string | null) ?? '',
            dosageForm: medicine.dosageForm,
            strength: medicine.strength ?? '',
            manufacturer: medicine.manufacturer ?? '',
            prescriptionRequired: medicine.prescriptionRequired,
            reorderLevel: String(medicine.reorderLevel),
          }
        : emptyForm
    );
    setError('');
    setSaving(false);
  }, [open, medicine]);

  const setField =
    (name: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [name]: e.target.value }));
    };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim() || !form.category || !form.dosageForm.trim()) {
      setError('Name, category, and dosage form are required.');
      return;
    }
    const reorder = Number(form.reorderLevel);
    if (!Number.isInteger(reorder) || reorder < 0) {
      setError('Reorder level must be a non-negative whole number.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      genericName: form.genericName.trim() || undefined,
      brandName: form.brandName.trim() || undefined,
      category: form.category,
      dosageForm: form.dosageForm.trim(),
      strength: form.strength.trim() || undefined,
      manufacturer: form.manufacturer.trim() || undefined,
      prescriptionRequired: form.prescriptionRequired,
      reorderLevel: reorder,
    };

    setSaving(true);
    try {
      const saved = isEdit
        ? await updateMedicine(medicine!._id, payload)
        : await createMedicine(payload);
      onSaved(saved, isEdit);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={isEdit ? 'Edit medicine' : 'Add medicine'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="medicine-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Create medicine'}
          </Button>
        </>
      }
    >
      <form id="medicine-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={setField('name')} autoFocus />
          <Select
            label="Category"
            value={form.category}
            onChange={setField('category')}
            options={categories
              .filter((c) => c.status === 'active')
              .map((c) => ({ value: c._id, label: c.name }))}
            placeholder="Select a category"
          />
          <Input label="Generic name" value={form.genericName} onChange={setField('genericName')} />
          <Input label="Brand name" value={form.brandName} onChange={setField('brandName')} />
          <Input
            label="Dosage form"
            value={form.dosageForm}
            onChange={setField('dosageForm')}
            placeholder="tablet, syrup, injection…"
          />
          <Input
            label="Strength"
            value={form.strength}
            onChange={setField('strength')}
            placeholder="500 mg"
          />
          <Input
            label="Manufacturer"
            value={form.manufacturer}
            onChange={setField('manufacturer')}
          />
          <Input
            label="Reorder level"
            type="number"
            min={0}
            value={form.reorderLevel}
            onChange={setField('reorderLevel')}
            hint="Low-stock alert threshold"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.prescriptionRequired}
            onChange={(e) => setForm((f) => ({ ...f, prescriptionRequired: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
          />
          Prescription required
        </label>
      </form>
    </Modal>
  );
}
