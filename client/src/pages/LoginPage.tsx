import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { DASHBOARD_PATHS, HOSPITAL_NAME } from '../utils/constants';
import { getErrorMessage } from '../services/api';
import { peekLogoutReason } from '../utils/session';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Alert from '../components/ui/Alert';
import FullPageSpinner from '../components/ui/FullPageSpinner';
import Icon, { LogoMark } from '../components/ui/icons';
import PulseLine from '../components/PulseLine';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const { login, isAuthenticated, role, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Read once on mount. A session that timed out lands here having already
  // recorded why, whether it ended in a live tab or was refused on reload.
  const [timedOut] = useState(() => peekLogoutReason() === 'inactivity');

  if (loading) return <FullPageSpinner label="Loading" />;

  // Already signed in — go straight to the dashboard.
  if (isAuthenticated && role) {
    return <Navigate to={DASHBOARD_PATHS[role]} replace />;
  }

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = 'Email is required.';
    else if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (!password) errors.password = 'Password is required.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');

    if (!validate()) return;

    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      navigate(DASHBOARD_PATHS[user.role], { replace: true });
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Unable to log in. Please try again.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel — the same navy the signed-in shell uses, so the
          transition through login is continuous rather than a jump cut. */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-b from-navy-900 to-navy-950 p-10 text-white lg:flex xl:p-14">
        {/* The navy gradient above stays as the base layer, so the panel still
            looks intentional in the moment before this loads — or if it never
            does. Decorative, hence alt="".
            The 2:1 photograph crops hard into a tall half-panel, so the focal
            point is pinned left-of-centre where the clinician stands; a centred
            crop would frame the desk and cut her out of her own photo. */}
        <img
          src="/hmsimage.jpeg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[32%_45%]"
        />

        {/* Dense scrim, and deliberately so. This panel carries white text at
            three heights over a photo that is mostly white coats, white desk
            and bright windows. Measured against the photo's brightest pixels,
            this keeps the headline at ~12:1 and the small print above the 4.5:1
            floor — a lighter wash would let the disclaimer fail wherever a
            window happens to sit behind it. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-navy-950/90 via-navy-950/85 to-navy-900/80"
        />

        {/* Soft brand glow, purely atmospheric */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/20 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
            <LogoMark className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold">{HOSPITAL_NAME}</span>
        </div>

        <div className="relative">
          <PulseLine className="mb-8 h-10 w-full max-w-md text-brand-500/70" />
          <h1 className="max-w-md text-[2rem] font-semibold leading-tight">
            One record. Every department. Better care.
          </h1>
          <p className="mt-4 max-w-md leading-relaxed text-slate-300">
            The staff portal for admissions, care teams, and administration.
          </p>
        </div>

        {/* slate-300, not slate-400: at 12px over the photograph's brightest
            areas slate-400 measures 4.30:1, just under the 4.5:1 floor. It
            passed on the flat navy this panel used to have — the photo is what
            pushed it under. */}
        <p className="relative text-xs text-slate-300">
          Authorized personnel only. Activity on this system is monitored.
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex w-full items-center justify-center overflow-hidden bg-canvas px-4 py-12 lg:w-1/2">
        {/* Care-team photograph. Decorative — alt="" because it carries no
            information the form does not already state, so a screen reader
            gains nothing from describing it. */}
        <img
          src="/login-hero.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[50%_30%]"
        />

        {/* Navy-tinted scrim. The photograph is mostly white coats on a bright
            background, so a white wash erases it and a heavy one makes it look
            like a loading error. Tinting toward the brand navy instead ties the
            two halves together and leaves the white card as the one bright
            element on the page — which is where the eye should land. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-navy-950/70 via-navy-900/45 to-brand-900/55"
        />

        {/* The card stays fully opaque on purpose. Frosting it would be the
            obvious move over a photograph, but the secondary text here is
            slate-500, and at only 5% translucency that drops to 4.31:1 over the
            photo's bright areas — under the 4.5:1 floor. The edge treatment
            below buys the depth that transparency would have, for free. */}
        <section
          aria-labelledby="login-heading"
          className="relative w-full max-w-[25rem] overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-navy-950/10"
        >
          {/* Lit top edge — the one thing a flat white rectangle on a photo is
              missing. 1px, so it defines the card without decorating it. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent"
          />

          <div className="p-6 sm:p-8">
            <div className="mb-7 flex items-center gap-2.5 lg:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
                <LogoMark className="h-[1.125rem] w-[1.125rem]" />
              </span>
              <p className="text-base font-semibold text-slate-900">{HOSPITAL_NAME}</p>
            </div>

            {/* h1, not h2: the brand panel that owns the page's only other h1 is
                `hidden lg:flex`, so on any screen under 1024px this document had
                no h1 at all. This is the page's real subject anyway. */}
            <h1
              id="login-heading"
              className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-slate-900"
            >
              Log in
            </h1>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-slate-500">
              Use the staff account issued by your administrator.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
              {timedOut && !submitError && (
                <Alert tone="info">
                  You were signed out after 6 hours without activity. Log in to continue.
                </Alert>
              )}
              {submitError && <Alert tone="error">{submitError}</Alert>}

              <Input
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@hospital.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fieldErrors.email}
                autoFocus
              />

              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    // Not tabbable: keyboard users move Password -> Log in, and a
                    // stop in between to toggle an optional affordance is friction.
                    // Still reachable by click, and by screen readers.
                    tabIndex={-1}
                    // 40x40 is the largest target that fits a 40px field without
                    // spilling out of it; short of the 44px ideal, but this is an
                    // optional inline affordance, not a primary control.
                    className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 transition-colors hover:text-slate-700"
                  >
                    <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-[1.125rem] w-[1.125rem]" />
                  </button>
                }
              />

              <Button
                type="submit"
                size="lg"
                loading={submitting}
                className="w-full transition-transform active:scale-[0.99]"
              >
                {submitting ? 'Logging in…' : 'Log in'}
              </Button>
            </form>
          </div>

          {/* Recessed shelf. The help text was previously the same size and
              colour as the subtitle above, so the card read as three equal grey
              paragraphs with no primary task. Sinking it into a tinted footer
              makes the form unambiguously the point of the card. */}
          <div className="border-t border-line bg-slate-50 px-6 py-4 sm:px-8">
            <p className="text-pretty text-xs font-medium leading-relaxed text-slate-600">
              Forgot your password? Contact your system administrator.
            </p>
            {/* The brand panel carries this notice, but that panel is hidden
                under 1024px — so on phones it was never shown at all.
                slate-600 rather than slate-500: on this tinted shelf slate-500
                measures 4.55:1, which passes by 0.05 and is not a margin worth
                shipping. These two lines are ranked by weight instead. */}
            <p className="mt-1.5 text-pretty text-xs leading-relaxed text-slate-600 lg:hidden">
              Authorized personnel only. Activity on this system is monitored.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
