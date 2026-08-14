import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  BLOOD_GROUPS,
  GENDERS,
  type BloodGroup,
  type CreatePatientPayload,
  type Gender,
  type Patient,
} from '../../types';
import { toDateInputValue } from '../../utils/date';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Select, { type SelectOption } from '../ui/Select';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

const GENDER_OPTIONS: SelectOption[] = GENDERS.map((g) => ({
  value: g,
  label: g.charAt(0).toUpperCase() + g.slice(1),
}));

const BLOOD_GROUP_OPTIONS: SelectOption[] = BLOOD_GROUPS.map((bg) => ({
  value: bg,
  label: bg === 'unknown' ? 'Unknown' : bg,
}));

const MARITAL_OPTIONS: SelectOption[] = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'other', label: 'Other' },
];

interface FormState {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender | '';
  bloodGroup: BloodGroup | '';
  nationalId: string;
  phone: string;
  email: string;
  address: string;
  emergencyContactName: string;
  emergencyContact: string;
  emergencyContactRelation: string;
  maritalStatus: string;
  occupation: string;
  allergies: string;
  medicalHistory: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  nationalId: '',
  phone: '',
  email: '',
  address: '',
  emergencyContactName: '',
  emergencyContact: '',
  emergencyContactRelation: '',
  maritalStatus: '',
  occupation: '',
  allergies: '',
  medicalHistory: '',
};

const fromPatient = (patient: Patient): FormState => ({
  firstName: patient.firstName,
  lastName: patient.lastName,
  dateOfBirth: toDateInputValue(patient.dateOfBirth),
  gender: patient.gender,
  bloodGroup: patient.bloodGroup,
  nationalId: patient.nationalId ?? '',
  phone: patient.phone,
  email: patient.email ?? '',
  address: patient.address ?? '',
  emergencyContactName: patient.emergencyContactName ?? '',
  emergencyContact: patient.emergencyContact ?? '',
  emergencyContactRelation: patient.emergencyContactRelation ?? '',
  maritalStatus: patient.maritalStatus ?? '',
  occupation: patient.occupation ?? '',
  allergies: patient.allergies.join('\n'),
  medicalHistory: patient.medicalHistory.join('\n'),
});

/** One entry per non-empty line. */
const toList = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

interface PatientFormProps {
  /** Existing patient to edit; omit to register a new one. */
  patient?: Patient;
  submitLabel: string;
  onSubmit: (payload: CreatePatientPayload) => Promise<void>;
  onCancel: () => void;
}

/**
 * The single patient form, shared by registration and editing. Pages
 * provide the submit behavior; the form owns state and validation.
 */
export default function PatientForm({ patient, submitLabel, onSubmit, onCancel }: PatientFormProps) {
  const [form, setForm] = useState<FormState>(patient ? fromPatient(patient) : emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const setField =
    (name: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [name]: e.target.value }));
    };

  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!form.firstName.trim()) next.firstName = 'First name is required.';
    else if (form.firstName.trim().length > 50) next.firstName = 'Keep it under 50 characters.';

    if (!form.lastName.trim()) next.lastName = 'Last name is required.';
    else if (form.lastName.trim().length > 50) next.lastName = 'Keep it under 50 characters.';

    if (!form.dateOfBirth) next.dateOfBirth = 'Date of birth is required.';
    else if (new Date(form.dateOfBirth).getTime() > Date.now()) {
      next.dateOfBirth = 'Date of birth cannot be in the future.';
    }

    if (!form.gender) next.gender = 'Select a gender.';

    if (!form.phone.trim()) next.phone = 'Phone is required.';
    else if (!PHONE_RE.test(form.phone.trim())) next.phone = 'Enter a valid phone number.';

    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }

    if (form.emergencyContact.trim() && !PHONE_RE.test(form.emergencyContact.trim())) {
      next.emergencyContact = 'Enter a valid phone number.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');

    if (!validate()) return;

    const payload: CreatePatientPayload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth,
      gender: form.gender as Gender,
      phone: form.phone.trim(),
      bloodGroup: (form.bloodGroup || 'unknown') as BloodGroup,
      email: form.email.trim(),
      address: form.address.trim(),
      emergencyContact: form.emergencyContact.trim(),
      emergencyContactName: form.emergencyContactName.trim(),
      emergencyContactRelation: form.emergencyContactRelation.trim(),
      nationalId: form.nationalId.trim(),
      maritalStatus: form.maritalStatus,
      occupation: form.occupation.trim(),
      allergies: toList(form.allergies),
      medicalHistory: toList(form.medicalHistory),
    };

    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to save the patient.');
      setSaving(false);
    }
  };

  const required = <span aria-hidden="true" className="text-rose-500"> *</span>;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <Card title="Personal information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label={<>First name{required}</>}
            value={form.firstName}
            onChange={setField('firstName')}
            error={errors.firstName}
            autoFocus={!patient}
          />
          <Input
            label={<>Last name{required}</>}
            value={form.lastName}
            onChange={setField('lastName')}
            error={errors.lastName}
          />
          <Input
            label={<>Date of birth{required}</>}
            type="date"
            value={form.dateOfBirth}
            onChange={setField('dateOfBirth')}
            error={errors.dateOfBirth}
            max={new Date().toISOString().slice(0, 10)}
          />
          <Select
            label={<>Gender{required}</>}
            value={form.gender}
            onChange={setField('gender')}
            options={GENDER_OPTIONS}
            placeholder="Select gender"
            error={errors.gender}
          />
          <Select
            label="Blood group"
            value={form.bloodGroup}
            onChange={setField('bloodGroup')}
            options={BLOOD_GROUP_OPTIONS}
            placeholder="Unknown"
          />
          <Input
            label="National ID"
            value={form.nationalId}
            onChange={setField('nationalId')}
            hint="Optional"
          />
        </div>
      </Card>

      <Card title="Contact information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label={<>Phone{required}</>}
            type="tel"
            value={form.phone}
            onChange={setField('phone')}
            error={errors.phone}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={setField('email')}
            error={errors.email}
            hint="Optional"
          />
          <Input
            label="Address"
            value={form.address}
            onChange={setField('address')}
            hint="Optional"
          />
        </div>
      </Card>

      <Card title="Emergency contact">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Contact name"
            value={form.emergencyContactName}
            onChange={setField('emergencyContactName')}
          />
          <Input
            label="Contact phone"
            type="tel"
            value={form.emergencyContact}
            onChange={setField('emergencyContact')}
            error={errors.emergencyContact}
          />
          <Input
            label="Relationship"
            value={form.emergencyContactRelation}
            onChange={setField('emergencyContactRelation')}
            placeholder="Spouse, parent, sibling…"
          />
        </div>
      </Card>

      <Card title="Additional information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Marital status"
            value={form.maritalStatus}
            onChange={setField('maritalStatus')}
            options={MARITAL_OPTIONS}
            placeholder="Not specified"
          />
          <Input label="Occupation" value={form.occupation} onChange={setField('occupation')} />
        </div>
      </Card>

      <Card title="Medical information" subtitle="One entry per line">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Textarea
            label="Allergies"
            value={form.allergies}
            onChange={setField('allergies')}
            rows={4}
            placeholder={'Penicillin\nPeanuts'}
          />
          <Textarea
            label="Previous medical history"
            value={form.medicalHistory}
            onChange={setField('medicalHistory')}
            rows={4}
            placeholder={'Diabetes\nHypertension\nPrevious surgery'}
          />
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

