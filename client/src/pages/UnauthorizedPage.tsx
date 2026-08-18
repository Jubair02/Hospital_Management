import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { DASHBOARD_PATHS, ROLE_LABELS } from '../utils/constants';
import Button from '../components/ui/Button';
import RippleGlyph from '../components/ui/RippleGlyph';

/**
 * The 403.
 *
 * Its sibling 404 got the ambient wash and the distorted glyph; this page was
 * left as centred paragraph text, so the same product spoke in two voices
 * depending on which wall you walked into. It now matches — but not by copying
 * the 404's toy toggle, which is a joke about a missing signal and means
 * nothing here.
 *
 * What it adds instead is the information the old page withheld: which address
 * was refused, and which role it was refused for. "Contact your system
 * administrator" is only actionable if you can tell them what you clicked.
 */
export default function UnauthorizedPage() {
  const { role } = useAuth();
  const location = useLocation();

  /**
   * The glyph settles rather than sitting still: it distorts on arrival and
   * resolves within a second. A door that has just shut, not an animation
   * asking to be played with — there is nothing to toggle on this page.
   */
  const [settling, setSettling] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setSettling(false), 900);
    return () => clearTimeout(timer);
  }, []);

  const home = role ? DASHBOARD_PATHS[role] : '/';

  /**
   * Where the user was sent from. `RoleRoute` redirects here, so the refused
   * address is in history state when it was passed, and otherwise unknown —
   * in which case the line is dropped rather than guessed at.
   */
  const refused = (location.state as { from?: string } | null)?.from;

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas px-6 py-16 text-center">
      {/* Amber rather than the 404's brand blue: this is a boundary holding,
          not a thing that is missing. Same wash, different weather. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-200/40 blur-[120px] sm:h-[38rem] sm:w-[38rem]" />
      </div>

      <div className="flex w-full max-w-3xl flex-col items-center">
        <RippleGlyph
          text="403"
          active={settling}
          className="w-[min(60vw,26rem)] text-amber-600"
        />

        <h1 className="mt-10 text-pretty text-2xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-3xl">
          That page isn't yours to open
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-slate-500 sm:text-base">
          It belongs to a different role. Nothing was changed, and nothing you were working on has
          been lost — you have simply reached the edge of what this account covers.
        </p>

        {(refused || role) && (
          <dl className="mt-6 w-full max-w-md space-y-1.5 rounded-2xl border border-line bg-white/70 px-5 py-4 text-left shadow-sm backdrop-blur-sm">
            {refused && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Address
                </dt>
                <dd className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">
                  {refused}
                </dd>
              </div>
            )}
            {role && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Signed in as
                </dt>
                <dd className="min-w-0 flex-1 text-xs text-slate-700">{ROLE_LABELS[role]}</dd>
              </div>
            )}
          </dl>
        )}

        <p className="mt-4 max-w-xl text-xs leading-relaxed text-slate-400">
          If this is something your job needs, send those two lines to your system administrator —
          they are what identifies the permission to change.
        </p>

        <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => history.back()}>
            Go back
          </Button>
          <Link to={home} className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">Back to my dashboard</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
