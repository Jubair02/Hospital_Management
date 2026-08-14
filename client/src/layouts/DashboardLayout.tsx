import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import useUnreadNotifications from '../hooks/useUnreadNotifications';

const COLLAPSE_KEY = 'hms.sidebar.collapsed';

/** localStorage throws in some privacy modes; the rail width is not worth a crash. */
const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

const writeCollapsed = (value: boolean): void => {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    /* preference simply does not persist */
  }
};

/**
 * Application shell for all authenticated pages: a navigation rail that
 * collapses to icons on desktop and slides in as a drawer on mobile, a
 * sticky header, and a width-capped scrolling content column.
 *
 * The unread-notification poll lives here rather than in the header so the
 * header badge and the sidebar badge share one request instead of two.
 */
export default function DashboardLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { count: unreadCount } = useUnreadNotifications();
  const { pathname } = useLocation();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      writeCollapsed(!previous);
      return !previous;
    });
  }, []);

  // Navigating on mobile should always leave the drawer closed.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Escape closes the drawer, matching the modal convention used elsewhere.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        open={drawerOpen}
        collapsed={collapsed}
        unreadCount={unreadCount}
        onClose={() => setDrawerOpen(false)}
        onToggleCollapsed={toggleCollapsed}
      />

      <div
        className={`flex min-h-screen flex-col transition-[padding] duration-200 ease-out ${
          collapsed ? 'lg:pl-[4.75rem]' : 'lg:pl-[16.5rem]'
        }`}
      >
        <Header
          unreadCount={unreadCount}
          onOpenSidebar={() => setDrawerOpen(true)}
        />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* One entrance when the shell mounts. Deliberately NOT keyed on the
              route: keying would remount every page on navigation, which would
              re-fetch and reset state that React Router currently preserves. */}
          <div className="mx-auto w-full max-w-[1600px] rise">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
