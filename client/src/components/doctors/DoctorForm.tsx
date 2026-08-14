import { useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  CreateDoctorPayload,
  Department,
  Doctor,
  UpdateDoctorPayload,
} from '../../types';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Select, { type SelectOption } from '../ui/Select';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  specialization: string;
  departmentId: string;
  qualification: string;
  licenseNumber: string;
  experienceYears: string;
  consultationFee: string;
  bio: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const fromDoctor = (doctor: Doctor): FormState => ({
  firstName: doctor.firstName,
  lastName: doctor.lastName,
  email: doctor.email,
  password: '',
  phone: doctor.phone ?? '',
  specialization: doctor.specialization,
  departmentId:
    typeof doctor.departmentId === 'object' && doctor.departmentId
      ? doctor.departmentId._id
      : (doctor.departmentId as string | null) ?? '',
  qualification: doctor.qualification ?? '',
  licenseNumber: doctor.licenseNumber ?? '',
  experienceYears: doctor.experienceYears?.toString() ?? '',
  consultationFee: doctor.consultationFee?.toString() ?? '',
  bio: doctor.bio ?? '',
});

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  specialization: '',
  departmentId: '',
  qualification: '',
  licenseNumber: '',
  experienceYears: '',
  consultationFee: '',
  bio: '',
};

interface DoctorFormProps {
  /** Existing doctor to edit; omit to create (which also creates the login). */
  doctor?: Doctor;
  departments: Department[];
  submitLabel: string;
  onSubmit: (payload: CreateDoctorPayload | UpdateDoctorPayload) => Promise<void>;
  onCancel: () => void;
}

/**
 * One doctor form for create and edit. In create mode it collects the
 * login account (created through the existing user system server-side);
 * in edit mode account credentials are not editable here.
 */
export default function DoctorForm({
  doctor,
  departments,
  submitLabel,
  onSubmit,
  onCancel,
}: DoctorFormProps) {
  const isEdit = Boolean(doctor);

  const [form, setForm] = useState<FormState>(doctor ? fromDoctor(doctor) : emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const departmentOptions: SelectOption[] = departments
    .filter((d) => d.status === 'active')
    .map((d) => ({ value: d._id, label: d.name }));

  const setField =
    (name: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [name]: e.target.value }));
    };

  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!form.firstName.trim()) next.firstName = 'First name is required.';
    if (!form.lastName.trim()) next.lastName = 'Last name is required.';

    if (!isEdit) {
      if (!form.email.trim() || !EMAIL_RE.test(form.email.trim())) {
        next.email = 'A valid email is required.';
      }
      if (form.password.length < 8) next.password = 'Password must be at least 8 characters.';
    }

    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) {
      next.phone = 'Enter a valid phone number.';
    }
    if (!form.specialization.trim()) next.specialization = 'Specialization is required.';
    if (!form.departmentId) next.departmentId = 'Select a department.';

    if (form.experienceYears !== '') {
      const years = Number(form.experienceYears);
      if (!Number.isFinite(years) || years < 0 || years > 80) {
        next.experienceYears = 'Experience must be between 0 and 80.';
      }
    }
    if (form.consultationFee !== '') {
      const fee = Number(form.consultationFee);
      if (!Number.isFinite(fee) || fee < 0) next.consultationFee = 'Fee cannot be negative.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) return;

    const profile = {
      specialization: form.specialization.trim(),
      departmentId: form.departmentId,
      qualification: form.qualification.trim() || undefined,
      licenseNumber: form.licenseNumber.trim() || undefined,
      experienceYears: form.experienceYears === '' ? undefined : Number(form.experienceYears),
      consultationFee: form.consultationFee === '' ? undefined : Number(form.consultationFee),
      bio: form.bio.trim() || undefined,
    };

    const payload: CreateDoctorPayload | UpdateDoctorPayload = isEdit
      ? {
          ...profile,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim(),
        }
      : {
          ...profile,
          user: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim(),
            password: form.password,
            phone: form.phone.trim() || undefined,
          },
        };

    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to save the doctor.');
      setSaving(false);
    }
  };

  const required = <span aria-hidden="true" className="text-rose-500"> *</span>;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <Card
        title={isEdit ? 'Doctor identity' : 'Login account'}
        subtitle={
          isEdit
            ? 'Name and phone stay in sync with the login account.'
            : 'Creates a staff account with the doctor role.'
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={<>First name{required}</>}
            value={form.firstName}
            onChange={setField('firstName')}
            error={errors.firstName}
            autoFocus={!isEdit}
          />
          <Input
            label={<>Last name{required}</>}
            value={form.lastName}
            onChange={setField('lastName')}
            error={errors.lastName}
          />
          <Input
            label={isEdit ? 'Email (managed in Users)' : <>Email{required}</>}
            type="email"
            value={form.email}
            onChange={setField('email')}
            error={errors.email}
            disabled={isEdit}
          />
          {!isEdit && (
            <Input
              label={<>Password{required}</>}
              type="password"
              value={form.password}
              onChange={setField('password')}
              error={errors.password}
              hint="At least 8 characters."
              autoComplete="new-password"
            />
          )}
          <Input
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={setField('phone')}
            error={errors.phone}
          />
        </div>
      </Card>

      <Card title="Professional profile">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={<>Specialization{required}</>}
            value={form.specialization}
            onChange={setField('specialization')}
            error={errors.specialization}
            placeholder="Cardiology, Pediatrics…"
          />
          <Select
            label={<>Department{required}</>}
            value={form.departmentId}
            onChange={setField('departmentId')}
            options={departmentOptions}
            placeholder="Select a department"
            error={errors.departmentId}
          />
          <Input
            label="Qualification"
            value={form.qualification}
            onChange={setField('qualification')}
            placeholder="MBBS, MD…"
          />
          <Input
            label="License number"
            value={form.licenseNumber}
            onChange={setField('licenseNumber')}
          />
          <Input
            label="Experience (years)"
            type="number"
            min={0}
            max={80}
            value={form.experienceYears}
            onChange={setField('experienceYears')}
            error={errors.experienceYears}
          />
          <Input
            label="Consultation fee"
            type="number"
            min={0}
            value={form.consultationFee}
            onChange={setField('consultationFee')}
            error={errors.consultationFee}
          />
        </div>
        <div className="mt-4">
          <Textarea label="Bio" value={form.bio} onChange={setField('bio')} rows={3} />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
