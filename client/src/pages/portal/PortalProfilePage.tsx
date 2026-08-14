import { useEffect, useState, type FormEvent } from 'react';
import { getProfile, updateProfile } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { calculateAge, formatDate } from '../../utils/date';
import type { Patient, PortalProfilePayload } from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import Input from '../../components/ui/Input';
import PageHeader from '../../components/ui/PageHeader';
import ChangePasswordCard from '../../components/auth/ChangePasswordCard';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

interface ContactForm {
  phone: string;
  email: string;
  address: string;
  emergencyContact: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  maritalStatus: string;
  occupation: string;
}

const toForm = (patient: Patient): ContactForm => ({
  phone: patient.phone ?? '',
  email: patient.email ?? '',
  address: patient.address ?? '',
  emergencyContact: patient.emergencyContact ?? '',
  emergencyContactName: patient.emergencyContactName ?? '',
  emergencyContactRelation: patient.emergencyContactRelation ?? '',
  maritalStatus: patient.maritalStatus ?? '',
  occupation: patient.occupation ?? '',
});

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">
        {value ? (
          <span className="text-slate-800">{value}</span>
        ) : (
          <span className="text-slate-400">Not recorded</span>
        )}
      </dd>
    </div>
  );
}

/**
 * The patient's own profile. Contact and social details are editable;
 * identity and medical information are shown read-only — those change
 * only through hospital staff, and the API enforces the same split.
 */
export default function PortalProfilePage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [form, setForm] = useState<ContactForm | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldError, setFieldError] = useState<Partial<Record<keyof ContactForm, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile()
      .then((loaded) => {
        setPatient(loaded);
        setForm(toForm(loaded));
      })
      .catch((err) => setError(getErrorMessage(err, 'Unable to load your profile.')));
  }, []);

  const set = <K extends keyof ContactForm>(key: K, value: string) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setFieldError((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const errors: Partial<Record<keyof ContactForm, string>> = {};
    if (!form.phone.trim()) errors.phone = 'Phone is required.';
    if (form.email && !EMAIL_RE.test(form.email)) errors.email = 'Enter a valid email address.';
    if (Object.keys(errors).length > 0) {
      setFieldError(errors);
      return;
    }

    const payload: PortalProfilePayload = {
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      emergencyContact: form.emergencyContact.trim(),
      emergencyContactName: form.emergencyContactName.trim(),
      emergencyContactRelation: form.emergencyContactRelation.trim(),
      maritalStatus: form.maritalStatus.trim(),
      occupation: form.occupation.trim(),
    };

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await updateProfile(payload);
      setPatient(saved);
      setForm(toForm(saved));
      setNotice('Your contact details were updated.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save your profile.'));
    } finally {
      setSaving(false);
    }
  };

  if (error && !patient) return <Alert tone="error">{error}</Alert>;
  if (!patient || !form) return <FullPageSpinner label="Loading your profile" />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title="My profile"
        subtitle="Keep your contact details current. Medical information is maintained by the hospital."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card title="Identity" subtitle="Contact the reception desk to correct these.">
            <dl className="divide-y divide-slate-100">
              <Row label="Patient ID" value={patient.patientId} />
              <Row label="Name" value={`${patient.firstName} ${patient.lastName}`} />
              <Row
                label="Date of birth"
                value={`${formatDate(patient.dateOfBirth)} (${calculateAge(patient.dateOfBirth)} years)`}
              />
              <Row label="Gender" value={patient.gender} />
              <Row label="Blood group" value={patient.bloodGroup} />
              <Row label="National ID" value={patient.nationalId} />
            </dl>
          </Card>

          <Card title="Medical summary" subtitle="Recorded by your care team.">
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-slate-700">Allergies</p>
                {patient.allergies.length === 0 ? (
                  <p className="mt-1 text-slate-400">None recorded</p>
                ) : (
                  <ul className="mt-1 list-inside list-disc text-slate-600">
                    {patient.allergies.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="font-medium text-slate-700">Medical history</p>
                {patient.medicalHistory.length === 0 ? (
                  <p className="mt-1 text-slate-400">None recorded</p>
                ) : (
                  <ul className="mt-1 list-inside list-disc text-slate-600">
                    {patient.medicalHistory.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <form onSubmit={handleSubmit}>
          <Card
            title="Contact details"
            subtitle="These you can change yourself."
            actions={
              <Button type="submit" size="sm" loading={saving}>
                Save changes
              </Button>
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                error={fieldError.phone}
                required
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                error={fieldError.email}
              />
              <Input
                label="Address"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                className="sm:col-span-2"
              />
              <Input
                label="Emergency contact name"
                value={form.emergencyContactName}
                onChange={(e) => set('emergencyContactName', e.target.value)}
              />
              <Input
                label="Emergency contact phone"
                value={form.emergencyContact}
                onChange={(e) => set('emergencyContact', e.target.value)}
              />
              <Input
                label="Relationship"
                value={form.emergencyContactRelation}
                onChange={(e) => set('emergencyContactRelation', e.target.value)}
              />
              <Input
                label="Marital status"
                value={form.maritalStatus}
                onChange={(e) => set('maritalStatus', e.target.value)}
              />
              <Input
                label="Occupation"
                value={form.occupation}
                onChange={(e) => set('occupation', e.target.value)}
              />
            </div>
            </Card>
          </form>

          <ChangePasswordCard />
        </div>
      </div>
    </div>
  );
}
