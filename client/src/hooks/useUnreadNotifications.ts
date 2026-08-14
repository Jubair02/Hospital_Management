import { useCallback, useEffect, useState } from 'react';
import { getUnreadCount } from '../services/notificationService';

/** How often the header re-checks for new notifications. */
const POLL_MS = 60_000;

/**
 * Unread notification count for the header indicator.
 *
 * The project has no WebSocket layer, so this refreshes through the
 * existing API on a slow interval (and whenever the tab regains focus)
 * rather than introducing real-time infrastructure for one badge.
 */
export default function useUnreadNotifications(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    getUnreadCount()
      .then(setCount)
      .catch(() => {
        /* the badge is cosmetic — never surface an error for it */
      });
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);

    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { count, refresh };
}
