import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useSettings from '../hooks/useSettings';
import { updateOwnProfileRequest } from '../services/authService';
import { getErrorMessage } from '../services/api';
import { ROLE_LABELS, ROLES } from '../utils/constants';
import { formatDate } from '../utils/date';
import Alert from '../components/ui/Alert';
import Badge, { ROLE_TONES } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Icon from '../components/ui/icons';
import Input from '../components/ui/Input';
import PageHeader from '../components/ui/PageHeader';
import ChangePasswordCard from '../components/auth/ChangePasswordCard';

/**
 * Personal account settings for staff.
 *
 * Every signed-in role could already change its own password through the API,
 * but nothing in the interface reached that endpoint — the form existed only
 * on the patient portal. This is where it lives for everyone else.
 *
 * Patients keep `/patient/profile`: their name and contact details belong to
 * the Patient record rather than the login, the portal page already edits them
 * against the right endpoint, and duplicating it here would give the same
 * person two profiles that disagree.
 *
 * Deliberately *not* the place for hospital-wide configuration. Currency,
 * appointment length and alert thresholds are the institution's settings, not
 * an administrator's own, so they stay on their own screen and are linked to
 * rather than absorbed.
 */
export default function SettingsPage() {
  const { user, role } = useAuth();
  const { hospitalName } = useSettings();

  const initials =
    `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || '—';

  return (
    // Wider than a reading column and split in two from `lg`. Four full-width
    // cards in a 48rem ribbon pushed everything below the fold on a desktop
    // while half the screen sat empty either side; paired columns fit the
    // whole page in roughly one screen without crowding anything.
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        subtitle="Your details as they appear to the rest of the hospital, and the password you sign in with."
      />

      {/* Who this page is about. A personal settings screen with no face to it
          reads as a form for someone else — the monogram is the same one the
          header and the staff table use, so it is recognisably you. */}
      <section className="surface-card relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-white"
        />
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5">
          <span
            aria-hidden="true"
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-600 text-lg font-semibold tracking-[0.02em] text-white shadow-md ring-1 ring-inset ring-brand-700/20"
          >
            {initials}
          </span>

          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">
              {`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Your account'}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {role && <Badge tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Badge>}
              <span className="min-w-0 truncate text-sm text-slate-500">{user?.email}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Editable on the left, fixed facts on the right. The two columns are
          deliberately unequal: a form needs the room, a list of four read-only
          lines does not. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <DetailsCard />
          <ChangePasswordCard />
        </div>

        <div className="space-y-6">
          <Card title="Account" subtitle="Set for you when the account was created." icon="shield">
            <dl className="divide-y divide-line">
              <Row label="Organisation" value={hospitalName} />
              <Row label="Member since" value={formatDate(user?.createdAt)} />
            </dl>
            <p className="mt-4 text-pretty text-xs leading-relaxed text-slate-500">
              Your sign-in email and role are managed by an administrator. Ask one to change
              either.
            </p>
          </Card>

          {/* Its own card, not a section of the one above: these belong to the
              hospital rather than to the person reading the page. */}
          {role === ROLES.ADMIN && (
            <Card
              title="Hospital configuration"
              subtitle="Applies to everyone, not just your account."
              icon="cog"
              footer={
                <Link
                  to="/admin/settings"
                  className="inline-flex items-center gap-1 font-semibold text-brand-700 transition-colors duration-200 hover:text-brand-800"
                >
                  Open system settings
                  <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
                </Link>
              }
            >
              <p className="text-pretty text-sm leading-relaxed text-slate-600">
                Hospital identity, currency, appointment slot length, and alert thresholds.
                Changes there affect every user of the portal.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The three fields a staff member owns. Editing starts closed: this page is
 * opened far more often to read a detail or change a password than to correct
 * a surname, and a form sitting permanently open invites an accidental edit
 * on the way past.
 */
function DetailsCard() {
  const { user, applyUser } = useAuth();

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [fieldError, setFieldError] = useState<{ firstName?: string; lastName?: string }>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const open = () => {
    // Re-seed from the current user: a cancelled edit must not leave its
    // abandoned text behind for the next one.
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setPhone(user?.phone ?? '');
    setFieldError({});
    setError('');
    setNotice('');
    setEditing(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const errors: { firstName?: string; lastName?: string } = {};
    if (!firstName.trim()) errors.firstName = 'Your first name is required.';
    if (!lastName.trim()) errors.lastName = 'Your last name is required.';
    if (Object.keys(errors).length > 0) {
      setFieldError(errors);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updated = await updateOwnProfileRequest({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
      applyUser(updated);
      setEditing(false);
      setNotice('Your details were updated.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save your details.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Your details"
      subtitle="How your name appears on records you create."
      icon="users"
      actions={
        !editing && (
          <Button variant="secondary" size="sm" onClick={open}>
            Edit
          </Button>
        )
      }
    >
      {notice && !editing && (
        <Alert tone="success" className="mb-4">
          {notice}
        </Alert>
      )}

      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="First name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setFieldError((c) => ({ ...c, firstName: undefined }));
              }}
              error={fieldError.firstName}
              autoFocus
              required
            />
            <Input
              label="Last name"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setFieldError((c) => ({ ...c, lastName: undefined }));
              }}
              error={fieldError.lastName}
              required
            />
          </div>
          <Input
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555-0142"
            hint="Optional. Clear the field to remove it."
          />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      ) : (
        <dl className="divide-y divide-line">
          <Row label="First name" value={user?.firstName} />
          <Row label="Last name" value={user?.lastName} />
          <Row label="Phone" value={user?.phone} />
        </dl>
      )}
    </Card>
  );
}

/** One label/value line. Long values wrap under the label on narrow screens. */
function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value?: ReactNode;
  hint?: string;
}) {
  const empty = value === undefined || value === null || value === '';

  return (
    // The label column is capped rather than fixed: this same row renders in
    // the wide editable card and in the narrow column beside it, and a fixed
    // 10rem label left the narrow one almost no room for its value.
    <div className="grid grid-cols-1 gap-0.5 py-2.5 sm:grid-cols-[minmax(6rem,8rem)_minmax(0,1fr)] sm:items-baseline sm:gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-900">
        {empty ? (
          <span className="text-slate-400">Not set</span>
        ) : (
          <>
            <span className="break-words">{value}</span>
            {hint && <p className="mt-0.5 text-pretty text-xs text-slate-500">{hint}</p>}
          </>
        )}
      </dd>
    </div>
  );
}
