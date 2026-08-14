import { useState, type FormEvent } from 'react';
import { createPortalAccount } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import type { Patient } from '../../types';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Modal from '../ui/Modal';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

interface PortalAccountCardProps {
  patient: Patient;
  onIssued: (patient: Patient) => void;
}

/**
 * Staff-side management of a patient's portal login. Issue-only: the
 * account's status is managed from user management, and deactivating
 * the patient record suspends the login automatically.
 */
export default function PortalAccountCard({ patient, onIssued }: PortalAccountCardProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(patient.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const [saving, setSaving] = useState(false);

  const hasAccount = Boolean(patient.userId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (password.length < 8) errors.password = 'At least 8 characters.';
    if (Object.keys(errors).length > 0) {
      setFieldError(errors);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updated = await createPortalAccount(patient._id, {
        email: email.trim(),
        password,
      });
      setOpen(false);
      setPassword('');
      onIssued(updated);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create the portal account.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Patient portal"
      actions={
        hasAccount ? (
          <Badge tone="green">Access enabled</Badge>
        ) : (
          <Badge tone="slate">No account</Badge>
        )
      }
    >
      {hasAccount ? (
        <p className="text-sm text-slate-500">
          This patient can sign in to the portal to see their appointments, results, and bills.
          Manage the login from user management; deactivating the patient suspends it
          automatically.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Give this patient online access to their own appointments, prescriptions, lab
            results, and invoices.
          </p>
          {patient.status === 'active' && (
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              Create portal account
            </Button>
          )}
        </div>
      )}

      <Modal open={open} title="Create portal account" onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <p className="text-sm text-slate-500">
            The patient signs in with this email and password. They can only see their own
            records.
          </p>
          <Input
            label="Login email"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldError((c) => ({ ...c, email: undefined }));
            }}
            error={fieldError.email}
            required
          />
          <Input
            label="Temporary password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldError((c) => ({ ...c, password: undefined }));
            }}
            error={fieldError.password}
            hint="Share it with the patient securely; they should change it after first sign-in."
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create account
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
