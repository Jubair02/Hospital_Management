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
import Spinner from '../../components/ui/Spinner';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldError, setFieldError] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    getSystemSettings()
      .then((settings) => setForm(toForm(settings)))
      .catch((err) => setError(getErrorMessage(err, 'Unable to load system settings.')))
      .finally(() => setLoading(false));
  }, []);

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
      const saved = await updateSystemSettings(payload);
      setForm(toForm(saved));
      refresh();
      setNotice('Settings saved. The change is recorded in the audit log.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save system settings.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="text-brand-700" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">System settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Stored in the database and applied across the application. Every change is audited.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {form && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card title="Hospital identity">
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

          <Card title="Operations">
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
              />
              <label className="flex items-start gap-3 pt-7 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.notifyLowStock}
                  onChange={(e) => set('notifyLowStock', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700
                    focus:ring-brand-500"
                />
                <span>
                  <span className="font-medium">Low-stock alerts</span>
                  <span className="block text-slate-500">
                    Notify pharmacists and admins when a medicine drops to its reorder level.
                  </span>
                </span>
              </label>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Save settings
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
