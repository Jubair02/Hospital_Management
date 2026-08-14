import { useState, type FormEvent } from 'react';
import { changePasswordRequest } from '../../services/authService';
import { getErrorMessage } from '../../services/api';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

/**
 * Self-service password change for the signed-in user. The current
 * password must be re-entered; the server verifies it before accepting
 * the new one, and the change lands in the audit trail.
 */
export default function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldError, setFieldError] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const errors: FieldErrors = {};
    if (!currentPassword) errors.currentPassword = 'Enter your current password.';
    if (newPassword.length < 8) errors.newPassword = 'At least 8 characters.';
    if (newPassword && newPassword === currentPassword) {
      errors.newPassword = 'Choose a different password from your current one.';
    }
    if (confirmPassword !== newPassword) errors.confirmPassword = 'Passwords do not match.';
    if (Object.keys(errors).length > 0) {
      setFieldError(errors);
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await changePasswordRequest(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Password changed. Use the new password next time you sign in.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to change your password.'));
    } finally {
      setSaving(false);
    }
  };

  const set = (
    field: keyof FieldErrors,
    setter: (value: string) => void
  ) => (value: string) => {
    setter(value);
    setFieldError((current) => ({ ...current, [field]: undefined }));
  };

  return (
    <Card title="Security" subtitle="Change the password you sign in with.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => set('currentPassword', setCurrentPassword)(e.target.value)}
          error={fieldError.currentPassword}
          required
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => set('newPassword', setNewPassword)(e.target.value)}
            error={fieldError.newPassword}
            hint="At least 8 characters."
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => set('confirmPassword', setConfirmPassword)(e.target.value)}
            error={fieldError.confirmPassword}
            required
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" loading={saving}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
