import { useEffect, useState, type FormEvent } from 'react';
import { getSystemSettings, updateSystemSettings } from '../../services/adminService';
import { getErrorMessage } from '../../services/api';
import useSettings from '../../hooks/useSettings';
import type { SystemSettings, SystemSettingsPayload } from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Select, { type SelectOption } from '../../components/ui/Select';
import PageHeader from '../../components/ui/PageHeader';

const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — Pound Sterling' },
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'BDT', label: 'BDT — Bangladeshi Taka' },
  { value: 'AED', label: 'AED — UAE Dirham' },
  { value: 'NGN', label: 'NGN — Nigerian Naira' },
  { value: 'KES', label: 'KES — Kenyan Shilling' },
];

const SLOT_OPTIONS: SelectOption[] = [10, 15, 20, 30, 45, 60].map((minutes) => ({
  value: String(minutes),
  label: `${minutes} minutes`,
}));

interface FormState {
  hospitalName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  timezone: string;
  currency: string;
  appointmentSlotMinutes: string;
  notifyLowStock: boolean;
}

const toForm = (settings: SystemSettings): FormState => ({
  hospitalName: settings.hospitalName,
  contactPhone: settings.contactPhone ?? '',
  contactEmail: settings.contactEmail ?? '',
  address: settings.address ?? '',
  timezone: settings.timezone,
  currency: settings.currency,
  appointmentSlotMinutes: String(settings.appointmentSlotMinutes),
  notifyLowStock: settings.notifyLowStock,
});

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function SystemSettingsPage() {
  const { refresh } = useSettings();

  const [form, setForm] = useState<FormState | null>(null);
  /** Last saved values, so the page can tell whether anything is pending. */
  const [saved, setSaved] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldError, setFieldError] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    getSystemSettings()
      .then((settings) => {
        setForm(toForm(settings));
        setSaved(toForm(settings));
      })
      .catch((err) => setError(getErrorMessage(err, 'Unable to load system settings.')))
      .finally(() => setLoading(false));
  }, []);

  // Eight primitive fields — comparing the serialised pair is cheaper to read
  // than eight explicit comparisons, and cannot fall out of step when a
  // setting is added.
  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setFieldError((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.hospitalName.trim()) errors.hospitalName = 'Hospital name is required.';
    if (form.contactEmail && !EMAIL_RE.test(form.contactEmail)) {
      errors.contactEmail = 'Enter a valid email address.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldError(errors);
      return;
    }

    const payload: SystemSettingsPayload = {
      hospitalName: form.hospitalName.trim(),
      contactPhone: form.contactPhone.trim(),
      contactEmail: form.contactEmail.trim(),
      address: form.address.trim(),
      timezone: form.timezone.trim(),
      currency: form.currency,
      appointmentSlotMinutes: Number(form.appointmentSlotMinutes),
      notifyLowStock: form.notifyLowStock,
    };

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await updateSystemSettings(payload);
      setForm(toForm(updated));
      setSaved(toForm(updated));
      refresh();
      setNotice('Settings saved. The change is recorded in the audit log.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save system settings.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    // Capped rather than left to fill the shell: a two-column field grid
    // stretched to 1600px gives every input a line length nothing needs, and
    // the eye has to travel from a label on the far left to its value far
    // right.
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="System settings"
        subtitle="Stored in the database and applied across the application. Every change is audited."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {/* Skeletons in the shape of the two cards, rather than a spinner that
          replaces the whole page — the title and its explanation stay put, so
          nothing jumps when the values land. */}
      {loading && (
        <div className="space-y-6" aria-label="Loading system settings">
          {[0, 1].map((card) => (
            <div key={card} className="surface-card space-y-4 p-5">
              <div className="h-4 w-40 rounded-md skeleton" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map((field) => (
                  <div key={field} className="h-10 rounded-xl skeleton" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card
            title="Hospital identity"
            subtitle="Shown on invoices, the sign-in screen, and the navigation rail."
            icon="building"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Hospital name"
                value={form.hospitalName}
                onChange={(e) => set('hospitalName', e.target.value)}
                error={fieldError.hospitalName}
                required
                className="sm:col-span-2"
              />
              <Input
                label="Contact phone"
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
              />
              <Input
                label="Contact email"
                type="email"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
                error={fieldError.contactEmail}
              />
              <Input
                label="Address"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                className="sm:col-span-2"
              />
            </div>
          </Card>

          <Card
            title="Operations"
            subtitle="How money, time, and stock behave across the app."
            icon="cog"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Currency"
                value={form.currency}
                onChange={(e) => set('currency', e.target.value)}
                options={CURRENCY_OPTIONS}
                hint="Used for invoices, payments, and billing reports."
              />
              <Select
                label="Appointment slot length"
                value={form.appointmentSlotMinutes}
                onChange={(e) => set('appointmentSlotMinutes', e.target.value)}
                options={SLOT_OPTIONS}
              />
              <Input
                label="Timezone"
                value={form.timezone}
                onChange={(e) => set('timezone', e.target.value)}
                hint="IANA name, e.g. Asia/Dhaka or UTC."
                className="sm:col-span-2"
              />
            </div>

            {/* Its own row under a hairline, not a fourth cell in the grid.
                It used to sit beside a select and be pushed down by a hard
                `pt-7` to fake alignment with that select's label — a number
                that only held while neither label wrapped. */}
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border-t border-line pt-5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.notifyLowStock}
                onChange={(e) => set('notifyLowStock', e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
              />
              <span className="min-w-0">
                <span className="font-medium text-slate-900">Low-stock alerts</span>
                <span className="mt-0.5 block text-pretty leading-relaxed text-slate-500">
                  Notify pharmacists and admins when a medicine drops to its reorder level.
                </span>
              </span>
            </label>
          </Card>

          {/* The actions get a surface of their own so the end of the form is
              a place rather than a gap, and the page says plainly whether
              anything is waiting to be saved. */}
          <div className="surface-card flex flex-col-reverse gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500" aria-live="polite">
              {dirty ? 'You have unsaved changes.' : 'Everything here is saved.'}
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Button
                variant="secondary"
                onClick={() => {
                  if (saved) setForm(saved);
                  setFieldError({});
                }}
                disabled={!dirty || saving}
              >
                Discard changes
              </Button>
              {/* Disabled while pristine: saving an unchanged form would still
                  write an audit entry, and a trail of empty edits is worse
                  than no trail. */}
              <Button type="submit" loading={saving} disabled={!dirty}>
                Save settings
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
