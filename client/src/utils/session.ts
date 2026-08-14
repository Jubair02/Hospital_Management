/**
 * Session lifetime rules.
 *
 * A signed-in session ends after six hours without interaction. The deadline
 * is held as a timestamp in `localStorage` rather than as a running timer in
 * memory, and that is the whole point of this module: an in-memory timer is
 * reset by a page refresh, so a workstation left open overnight would hand a
 * full session to whoever reloaded the tab in the morning. Persisting the last
 * interaction means the clock keeps running across refreshes, tab restores,
 * and machine sleep.
 *
 * Being client-side, this is a protection against unattended workstations, not
 * against an attacker who already controls the browser — anyone with developer
 * tools can rewrite these keys. The JWT itself remains valid server-side until
 * its own expiry (`JWT_EXPIRES_IN`, seven days by default), so shortening that
 * is the complementary server-side control.
 */

/** Six hours of no interaction ends the session. */
export const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/**
 * How often the deadline is re-checked. Comparing timestamps on an interval,
 * rather than arming one six-hour `setTimeout`, keeps this correct across
 * background-tab throttling and machine sleep — both of which can hold back a
 * long timer well past its due time.
 */
export const IDLE_CHECK_INTERVAL_MS = 60_000;

/**
 * Floor between writes of the activity timestamp. Scrolling fires continuously
 * and every write touches `localStorage`, so the clock is only advanced once a
 * minute — irrelevant against a six-hour window, and it keeps a scroll from
 * turning into hundreds of synchronous storage writes.
 */
export const ACTIVITY_WRITE_INTERVAL_MS = 60_000;

const ACTIVITY_KEY = 'hms_last_activity';
const REASON_KEY = 'hms_logout_reason';

/** Why a session ended, when it ended on its own rather than by request. */
export type LogoutReason = 'inactivity';

/** Milliseconds since the epoch, or `null` when nothing has been recorded. */
export const getLastActivity = (): number | null => {
  const raw = localStorage.getItem(ACTIVITY_KEY);
  if (raw === null) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const markActivity = (at: number = Date.now()): void => {
  localStorage.setItem(ACTIVITY_KEY, String(at));
};

export const clearActivity = (): void => {
  localStorage.removeItem(ACTIVITY_KEY);
};

/**
 * Whether the idle limit has passed.
 *
 * A session with a token but no recorded activity is treated as fresh rather
 * than as expired: the realistic way to reach that state is a session that
 * predates this feature, and forcing every signed-in user out on the deploy
 * would be a worse trade than starting their clock now. It is not a hole
 * worth guarding — the same person could as easily write a current timestamp
 * as delete the key.
 *
 * A timestamp in the future (a corrected system clock, a tampered value) is
 * not treated as expiry either; the next interaction rewrites it.
 */
export const isIdleExpired = (now: number = Date.now()): boolean => {
  const last = getLastActivity();
  if (last === null) return false;

  return now - last >= IDLE_TIMEOUT_MS;
};

/**
 * Held in `sessionStorage`, not React state: the reason has to survive both a
 * redirect to the login page and a full reload of the app, since an expired
 * session is also detected on boot. It dies with the tab, which is the right
 * lifetime for it.
 */
export const setLogoutReason = (reason: LogoutReason): void => {
  sessionStorage.setItem(REASON_KEY, reason);
};

/**
 * Reads the reason without consuming it. Deliberately a pure read — React's
 * StrictMode double-invokes state initializers and effects in development, and
 * a read that cleared as a side effect would swallow the notice on the second
 * pass. `clearLogoutReason` runs on a successful login instead.
 */
export const peekLogoutReason = (): LogoutReason | null =>
  sessionStorage.getItem(REASON_KEY) === 'inactivity' ? 'inactivity' : null;

export const clearLogoutReason = (): void => {
  sessionStorage.removeItem(REASON_KEY);
};
