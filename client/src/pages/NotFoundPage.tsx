import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { DASHBOARD_PATHS } from '../utils/constants';
import Button from '../components/ui/Button';
import PulseLine from '../components/PulseLine';
import RippleGlyph from '../components/ui/RippleGlyph';

export default function NotFoundPage() {
  const { isAuthenticated, role } = useAuth();
  const [monitoring, setMonitoring] = useState(false);

  // Somewhere to actually go, rather than a generic home: signed-in staff land
  // on their own dashboard, and anyone else on the sign-in screen.
  const destination = isAuthenticated && role ? DASHBOARD_PATHS[role] : '/login';
  const destinationLabel = isAuthenticated && role ? 'Back to dashboard' : 'Go to sign in';

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas px-6 py-16 text-center">
      {/* Ambient wash in the brand hue rather than a spotlight in some other
          palette — this page is the same product as every other screen. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-200/40 blur-[120px] sm:h-[38rem] sm:w-[38rem]" />
      </div>

      <div className="flex w-full max-w-3xl flex-col items-center">
        <div className="flex w-full flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
          {/* The toggle drives the distortion beside it. An ECG trace rather
              than an arbitrary machine: it is the mark this product already
              uses on the sign-in panel and under the wordmark. */}
          <button
            type="button"
            aria-pressed={monitoring}
            onClick={() => setMonitoring((on) => !on)}
            className="group flex shrink-0 flex-col items-center gap-2 rounded-2xl border border-line bg-white/70 px-5 py-4 shadow-sm backdrop-blur-sm transition duration-200 hover:border-line-strong hover:shadow-md active:scale-[0.98]"
          >
            <PulseLine
              className={`h-8 w-28 transition-colors duration-300 ${
                monitoring ? 'text-accent-600' : 'text-slate-300'
              }`}
            />
            <span
              className={`text-[0.6875rem] font-semibold uppercase tracking-[0.18em] transition-colors duration-300 ${
                monitoring ? 'text-accent-700' : 'text-slate-400'
              }`}
            >
              {monitoring ? 'Signal on' : 'No signal'}
            </span>
          </button>

          <RippleGlyph
            text="404"
            active={monitoring}
            className="w-[min(60vw,26rem)] text-brand-600"
          />
        </div>

        <h1 className="mt-10 text-pretty text-2xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-3xl">
          This page isn't here
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-slate-500 sm:text-base">
          The address doesn't match anything in the system. It may have been moved, or the record
          it pointed to may have been removed. Nothing you were working on has been lost.
        </p>

        <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => history.back()}>
            Go back
          </Button>
          <Link to={destination} className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">{destinationLabel}</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
