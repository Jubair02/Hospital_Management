import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { createUser, updateUser } from '../../services/userService';
import { getErrorMessage } from '../../services/api';
import { ROLE_LABELS, STAFF_ROLE_LABELS } from '../../utils/constants';
import Badge, { ROLE_TONES } from '../ui/Badge';
import type { CreateUserPayload, Role, UpdateUserPayload, User } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select, { type SelectOption } from '../ui/Select';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Staff roles only — patient portal accounts are issued from the patient
// record, and the server refuses the patient role on this endpoint.
const ROLE_OPTIONS: SelectOption[] = Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role | '';
  password: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  role: '',
  password: '',
};

interface UserFormModalProps {
  open: boolean;
  user?: User | null;
  onClose: () => void;
  onSaved: (user: User, wasEdit: boolean) => void;
}

/**
 * Create/edit dialog for staff accounts. Pass `user` to edit; leave it
 * null to create. In edit mode the password field is optional.
 */
export default function UserFormModal({ open, user = null, onClose, onSaved }: UserFormModalProps) {
  const isEdit = Boolean(user);
  /** Editing a patient portal login rather than a staff account. */
  const isPortalLogin = user?.role === 'patient';

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setForm(
      user
        ? {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone ?? '',
            role: user.role,
            password: '',
          }
        : emptyForm
    );
    setErrors({});
    setSubmitError('');
    setSaving(false);
  }, [open, user]);

  const setField =
    (name: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [name]: e.target.value }));
    };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!isPortalLogin) {
      if (!form.firstName.trim()) next.firstName = 'First name is required.';
      if (!form.lastName.trim()) next.lastName = 'Last name is required.';
      if (!form.role) next.role = 'Select a role.';
    }
    if (!form.email.trim()) next.email = 'Email is required.';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!isEdit && form.password.length < 8) {
      next.password = 'Password must be at least 8 characters.';
    }
    if (isEdit && form.password && form.password.length < 8) {
      next.password = 'New password must be at least 8 characters.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');

    if (!validate()) return;

    setSaving(true);
    try {
      let saved: User;
      if (isEdit && user) {
        // A portal login carries only sign-in details; the patient's name
        // and phone live on their medical record, so they are not sent.
        const payload: UpdateUserPayload = isPortalLogin
          ? { email: form.email.trim() }
          : {
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
              email: form.email.trim(),
              phone: form.phone.trim(),
              role: form.role as Role,
            };
        if (form.password) payload.password = form.password;
        saved = await updateUser(user._id, payload);
      } else {
        const payload: CreateUserPayload = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          role: form.role as Role,
          password: form.password,
        };
        saved = await createUser(payload);
      }
      onSaved(saved, isEdit);
    } catch (err) {
      setSubmitError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={isEdit ? 'Edit user' : 'Add user'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {submitError && <Alert tone="error">{submitError}</Alert>}

        {isPortalLogin && (
          <Alert tone="info">
            This is a patient portal login. You can change the sign-in email and reset the
            password here — the patient&rsquo;s name and phone are edited on their{' '}
            <Link
              to={`/admin/patients`}
              className="font-medium underline decoration-sky-600/40 underline-offset-2"
            >
              patient record
            </Link>
            , which the portal reads from.
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            value={form.firstName}
            onChange={setField('firstName')}
            error={errors.firstName}
            autoFocus={!isPortalLogin}
            disabled={isPortalLogin}
          />
          <Input
            label="Last name"
            value={form.lastName}
            onChange={setField('lastName')}
            error={errors.lastName}
            disabled={isPortalLogin}
          />
        </div>

        <Input
          label={isPortalLogin ? 'Sign-in email' : 'Email'}
          type="email"
          value={form.email}
          onChange={setField('email')}
          error={errors.email}
          placeholder="name@hospital.org"
          autoFocus={isPortalLogin}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={setField('phone')}
            hint={isPortalLogin ? 'From the patient record' : 'Optional'}
            disabled={isPortalLogin}
          />
          {isPortalLogin ? (
            <div>
              <p className="mb-1.5 block text-sm font-medium text-slate-700">Role</p>
              <div className="flex min-h-10 items-center">
                <Badge tone={ROLE_TONES.patient}>{ROLE_LABELS.patient}</Badge>
              </div>
            </div>
          ) : (
            <Select
              label="Role"
              value={form.role}
              onChange={setField('role')}
              options={ROLE_OPTIONS}
              placeholder="Select a role"
              error={errors.role}
              hint="Staff roles only"
            />
          )}
        </div>

        {/* Patient logins must be linked to a Patient record, so they are
            issued from that record rather than here. */}
        {!isEdit && (
          <p className="text-sm text-slate-500">
            Looking for a <span className="font-medium text-slate-700">patient</span> login? Open
            the patient&rsquo;s profile under{' '}
            <Link to="/admin/patients" className="font-medium text-brand-600 hover:text-brand-700">
              Patients
            </Link>{' '}
            and use <span className="font-medium text-slate-700">Create portal account</span> — that
            links the login to their medical record.
          </p>
        )}

        <Input
          label={isEdit ? 'New password' : 'Password'}
          type="password"
          value={form.password}
          onChange={setField('password')}
          error={errors.password}
          hint={isEdit ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
          autoComplete="new-password"
        />
      </form>
    </Modal>
  );
}
