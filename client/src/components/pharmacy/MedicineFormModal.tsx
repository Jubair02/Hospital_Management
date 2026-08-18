import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { createMedicine, updateMedicine } from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import type { Medicine, MedicineCategory, MedicinePayload } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select, { type SelectOption } from '../ui/Select';
import Button from '../ui/Button';
import Badge, { type BadgeTone } from '../ui/Badge';
import Alert from '../ui/Alert';

/**
 * Suggestions, not a whitelist — the server takes any string up to 50
 * characters. Offering the common set is what keeps a catalog from ending up
 * with "tablet", "Tablet" and "tabs" as three different forms.
 */
const DOSAGE_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'suspension',
  'oral solution',
  'injection',
  'infusion',
  'drops',
  'inhaler',
  'cream',
  'ointment',
  'gel',
  'patch',
  'suppository',
  'powder',
];

const DOSAGE_FORM_LIST = 'medicine-dosage-forms';

/** Mirrors the server's field bounds, so a long paste is stopped here first. */
const MAX = {
  name: 200,
  genericName: 200,
  brandName: 200,
  dosageForm: 50,
  strength: 100,
  manufacturer: 200,
} as const;

const DISPENSING_RULES = [
  {
    value: true,
    badge: 'Rx',
    tone: 'brand' as BadgeTone,
    title: 'Prescription only',
    detail: 'Pharmacy needs a valid prescription before dispensing.',
  },
  {
    value: false,
    badge: 'OTC',
    tone: 'slate' as BadgeTone,
    title: 'Over the counter',
    detail: 'Can be dispensed without a prescription.',
  },
] as const;

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

/** Every field the generic text handler can write. */
type TextField = Exclude<keyof FormState, 'prescriptionRequired'>;
type FormErrors = Partial<Record<TextField, string>>;

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

/** The category id on a medicine, whether the record arrived populated or not. */
const categoryIdOf = (medicine: Medicine | null): string => {
  if (!medicine) return '';
  if (typeof medicine.category === 'object' && medicine.category) return medicine.category._id;
  return medicine.category ?? '';
};

/** Labelled rule above a group of fields, with the hairline carrying to the edge. */
function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
        <span className="whitespace-nowrap">{title}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </h3>
      {children}
    </section>
  );
}

interface MedicineFormModalProps {
  open: boolean;
  medicine?: Medicine | null;
  categories: MedicineCategory[];
  onClose: () => void;
  onSaved: (medicine: Medicine, wasEdit: boolean) => void;
}

/**
 * Create/edit dialog for the medicine catalog. Pass `medicine` to edit; leave
 * it null to create.
 *
 * The dialog opens on a preview of the line this record will produce in
 * prescriptions, the dispensing queue and the stock table. Those screens
 * identify a medicine by its composed label — "Amoxicillin 500 mg · capsule" —
 * rather than by any single field, so the entry is worth seeing assembled
 * while it is being typed.
 */
export default function MedicineFormModal({
  open,
  medicine = null,
  categories,
  onClose,
  onSaved,
}: MedicineFormModalProps) {
  const isEdit = Boolean(medicine);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setForm(
      medicine
        ? {
            name: medicine.name,
            genericName: medicine.genericName ?? '',
            brandName: medicine.brandName ?? '',
            category: categoryIdOf(medicine),
            dosageForm: medicine.dosageForm,
            strength: medicine.strength ?? '',
            manufacturer: medicine.manufacturer ?? '',
            prescriptionRequired: medicine.prescriptionRequired,
            reorderLevel: String(medicine.reorderLevel),
          }
        : emptyForm
    );
    setErrors({});
    setSubmitError('');
    setSaving(false);
  }, [open, medicine]);

  const categoryOptions = useMemo<SelectOption[]>(() => {
    const options = categories
      .filter((c) => c.status === 'active')
      .map((c) => ({ value: c._id, label: c.name }));

    // A category can be retired long after medicines were filed under it.
    // Dropping it from the list would leave the field looking empty on a record
    // that does have a category, and hide which one it is.
    const current = categoryIdOf(medicine);
    if (current && !options.some((o) => o.value === current)) {
      const own = categories.find((c) => c._id === current);
      options.unshift({ value: current, label: `${own?.name ?? 'Current category'} (retired)` });
    }
    return options;
  }, [categories, medicine]);

  const hasCategories = categoryOptions.length > 0;
  const selectedIsRetired = categories.some(
    (c) => c._id === form.category && c.status !== 'active'
  );

  const setField =
    (name: TextField) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { value } = e.target;
      setForm((f) => ({ ...f, [name]: value }));
      // Clear the error as soon as the field is touched; re-checked on submit.
      setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = 'Enter the medicine name.';
    if (!form.category) next.category = 'Choose a category.';
    if (!form.dosageForm.trim()) next.dosageForm = 'Enter a form, for example tablet.';

    // Left blank, this used to reach the server as 0 — which quietly means the
    // medicine can never be flagged low.
    const reorder = Number(form.reorderLevel);
    if (!form.reorderLevel.trim()) {
      next.reorderLevel = 'Enter a level, or 0 to never flag this medicine.';
    } else if (!Number.isInteger(reorder) || reorder < 0) {
      next.reorderLevel = 'Use a whole number, 0 or higher.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) return;

    // Creating, an empty optional field is simply left out. Editing, it means
    // "remove this" — and JSON drops undefined keys, so a cleared field has to
    // travel as an empty string or the old value stays on the record.
    const optional = (value: string): string | undefined =>
      isEdit ? value.trim() : value.trim() || undefined;

    const base: Partial<MedicinePayload> = {
      name: form.name.trim(),
      genericName: optional(form.genericName),
      brandName: optional(form.brandName),
      dosageForm: form.dosageForm.trim(),
      strength: optional(form.strength),
      manufacturer: optional(form.manufacturer),
      prescriptionRequired: form.prescriptionRequired,
      reorderLevel: Number(form.reorderLevel),
    };

    setSaving(true);
    try {
      const saved =
        isEdit && medicine
          ? await updateMedicine(medicine._id, {
              ...base,
              // The server refuses any write naming a retired category. Sending
              // an unchanged one would make a medicine whose category was later
              // retired impossible to edit at all, so it is left out unless the
              // pharmacist actually picked a different category.
              ...(form.category === categoryIdOf(medicine) ? {} : { category: form.category }),
            })
          : await createMedicine({ ...base, category: form.category } as MedicinePayload);
      onSaved(saved, isEdit);
    } catch (err) {
      setSubmitError(getErrorMessage(err));
      setSaving(false);
    }
  };

  // --- Preview -------------------------------------------------------------
  // Composed exactly the way the medicines table and the dispensing queue
  // compose it, so what is shown here is what will be read there.
  const name = form.name.trim();
  const strength = form.strength.trim();
  const dosageForm = form.dosageForm.trim();
  const categoryName = categories.find((c) => c._id === form.category)?.name ?? '';
  const supplyDetail = [categoryName, form.manufacturer.trim()].filter(Boolean).join(' · ');
  const aliases = [form.genericName.trim(), form.brandName.trim()].filter(Boolean);

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={isEdit ? 'Edit medicine' : 'Add medicine'}
      description={
        isEdit
          ? 'Changes apply wherever this medicine appears — prescriptions, dispensing and stock.'
          : 'A catalog entry prescribers and pharmacists will search by name, generic or brand.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="medicine-form" loading={saving} disabled={!hasCategories}>
            {isEdit ? 'Save changes' : 'Create medicine'}
          </Button>
        </>
      }
    >
      <form id="medicine-form" onSubmit={handleSubmit} noValidate className="@container space-y-6">
        {submitError && <Alert tone="error">{submitError}</Alert>}

        {!hasCategories && (
          <Alert tone="warning" title="No active categories">
            Every medicine is filed under a category. Create one under{' '}
            <Link
              to="/pharmacy/categories"
              className="font-semibold underline decoration-amber-700/40 underline-offset-2"
            >
              Categories
            </Link>{' '}
            first, then come back.
          </Alert>
        )}

        {/* The record as the rest of the app will render it. */}
        <div className="rounded-2xl border border-line bg-slate-50/70 px-4 py-3.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
            How it will read
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0 break-words">
              <p className="text-[0.9375rem] font-semibold leading-snug text-slate-900">
                {name || <span className="font-normal text-slate-400">Unnamed medicine</span>}
                {strength && <span className="ml-1.5 font-medium text-slate-500">{strength}</span>}
              </p>
              <p className="mt-0.5 text-sm leading-snug text-slate-500">
                {dosageForm || supplyDetail ? (
                  <>
                    {dosageForm && <span className="capitalize">{dosageForm}</span>}
                    {dosageForm && supplyDetail && <span aria-hidden="true"> · </span>}
                    {supplyDetail}
                  </>
                ) : (
                  <span className="text-slate-400">Category and form appear here</span>
                )}
              </p>
              {aliases.length > 0 && (
                <p className="mt-1 text-[0.8125rem] leading-snug text-slate-400">
                  Also found by searching {aliases.join(' or ')}
                </p>
              )}
            </div>
            <Badge className="shrink-0" tone={form.prescriptionRequired ? 'brand' : 'slate'}>
              {form.prescriptionRequired ? 'Rx' : 'OTC'}
            </Badge>
          </div>
        </div>

        <Section title={<>What it&rsquo;s called</>}>
          <Input
            label="Name"
            value={form.name}
            onChange={setField('name')}
            error={errors.name}
            maxLength={MAX.name}
            placeholder="Amoxicillin"
            autoFocus
          />
          <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <Input
              label="Generic name"
              value={form.genericName}
              onChange={setField('genericName')}
              maxLength={MAX.genericName}
              hint="Optional"
            />
            <Input
              label="Brand name"
              value={form.brandName}
              onChange={setField('brandName')}
              maxLength={MAX.brandName}
              hint="Optional"
            />
          </div>
        </Section>

        <Section title="What it is">
          <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <Select
              label="Category"
              value={form.category}
              onChange={setField('category')}
              options={categoryOptions}
              placeholder="Select a category"
              error={errors.category}
              hint={
                selectedIsRetired
                  ? 'This category is retired. Pick an active one to re-file the medicine.'
                  : undefined
              }
              disabled={!hasCategories}
            />
            <Input
              label="Dosage form"
              value={form.dosageForm}
              onChange={setField('dosageForm')}
              error={errors.dosageForm}
              maxLength={MAX.dosageForm}
              list={DOSAGE_FORM_LIST}
              placeholder="tablet"
              autoComplete="off"
            />
            <Input
              label="Strength"
              value={form.strength}
              onChange={setField('strength')}
              maxLength={MAX.strength}
              placeholder="500 mg"
              hint="Optional"
            />
            <Input
              label="Manufacturer"
              value={form.manufacturer}
              onChange={setField('manufacturer')}
              maxLength={MAX.manufacturer}
              hint="Optional"
            />
          </div>
          <datalist id={DOSAGE_FORM_LIST}>
            {DOSAGE_FORMS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Section>

        <Section title="Dispensing and stock">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Dispensing rule</legend>
            <div className="grid grid-cols-1 gap-2.5 @lg:grid-cols-2">
              {DISPENSING_RULES.map((rule) => {
                const checked = form.prescriptionRequired === rule.value;
                return (
                  <label
                    key={rule.title}
                    className={`relative flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3
                      transition-colors duration-200 ${
                        checked
                          ? 'border-brand-600 bg-brand-50/60 ring-1 ring-inset ring-brand-600'
                          : 'border-line-strong bg-white hover:border-slate-400'
                      }`}
                  >
                    <input
                      type="radio"
                      name="dispensing-rule"
                      className="peer sr-only"
                      checked={checked}
                      onChange={() => setForm((f) => ({ ...f, prescriptionRequired: rule.value }))}
                    />
                    {/* The control itself is off-screen, so the card wears its focus ring. */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2"
                    />
                    <span className="flex items-center gap-2">
                      <Badge tone={rule.tone}>{rule.badge}</Badge>
                      <span
                        className={`text-sm font-medium ${
                          checked ? 'text-brand-900' : 'text-slate-800'
                        }`}
                      >
                        {rule.title}
                      </span>
                    </span>
                    <span className="text-[0.8125rem] leading-snug text-slate-500">
                      {rule.detail}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <Input
              label="Reorder level"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={form.reorderLevel}
              onChange={setField('reorderLevel')}
              error={errors.reorderLevel}
              hint="Stock below this flags the medicine as low."
            />
          </div>
        </Section>
      </form>
    </Modal>
  );
}
