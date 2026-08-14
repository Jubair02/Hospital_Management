import { useEffect, useRef } from 'react';
import {
  ACTIVITY_WRITE_INTERVAL_MS,
  IDLE_CHECK_INTERVAL_MS,
  getLastActivity,
  isIdleExpired,
  markActivity,
} from '../utils/session';

/**
 * What counts as being at the workstation.
 *
 * Deliberately deliberate acts. `mousemove` is the usual addition and is left
 * out on purpose: a nudged desk, a drifting trackpad or a cursor-jiggler would
 * hold a clinical session open indefinitely with nobody in the chair, which is
 * exactly the situation this exists to end. Against a six-hour window, anyone
 * actually using the app clicks, types, scrolls or touches long before the
 * deadline.
 */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;

interface IdleTimeoutOptions {
  /** Watch only while signed in. */
  enabled: boolean;
  /** Called once the idle limit has passed. */
  onIdle: () => void;
}

/**
 * Ends the session after a period without interaction.
 *
 * The deadline lives in `localStorage` (see `utils/session`), so every tab
 * reads the same clock: interacting in one tab keeps the others alive, and no
 * tab has to broadcast anything for that to work.
 */
export default function useIdleTimeout({ enabled, onIdle }: IdleTimeoutOptions): void {
  // Kept in a ref so a caller passing an inline callback does not tear down
  // and re-attach every listener on each render.
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled) return;

    // A session that has never recorded activity starts its clock here rather
    // than counting as already expired.
    if (getLastActivity() === null) markActivity();

    let lastWrite = Date.now();

    const record = (): void => {
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_WRITE_INTERVAL_MS) return;
      lastWrite = now;
      markActivity(now);
    };

    const check = (): void => {
      if (isIdleExpired()) onIdleRef.current();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, record, { passive: true });
    }

    // Returning to a tab is not itself interaction, but it is the moment to
    // re-check: a machine woken from sleep can be hours past its deadline
    // before the interval below gets its next turn.
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') check();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', check);

    const interval = window.setInterval(check, IDLE_CHECK_INTERVAL_MS);

    // The tab may have been restored well past the deadline already.
    check();

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, record);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', check);
      window.clearInterval(interval);
    };
  }, [enabled]);
}
