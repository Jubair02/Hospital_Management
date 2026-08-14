import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useSettings from '../../hooks/useSettings';
import { ROLE_LABELS } from '../../utils/constants';
import Badge, { ROLE_TONES } from '../ui/Badge';
import Icon, { LogoMark } from '../ui/icons';

interface HeaderProps {
  unreadCount: number;
  onOpenSidebar: () => void;
}

/** "Thu, 13 Aug 2026" — the shift date, useful context on every screen. */
const today = (): string =>
  new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/**
 * Sticky top bar. Deliberately quiet: navigation lives in the rail, so this
 * holds only the mobile menu trigger, the shift date, the notification
 * indicator, and the account menu. No decorative search field — an input
 * that cannot search anything is a broken promise, not a feature.
 */
export default function Header({ unreadCount, onOpenSidebar }: HeaderProps) {
  const { user, role, logout } = useAuth();
  const { hospitalName } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [date, setDate] = useState(today);
  const menuRef = useRef<HTMLDivElement>(null);

  // Wards run through midnight and nothing else here forces a re-render, so
  // an overnight shift would otherwise read yesterday's date until the tab was
  // reloaded. The second of slack matters: firing a hair early would produce
  // the same string, `setDate` would bail out, and the effect would never
  // re-run to arm the next night's timer.
  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);

    const timer = window.setTimeout(
      () => setDate(today()),
      midnight.getTime() - Date.now() + 1000
    );
    return () => window.clearTimeout(timer);
  }, [date]);

  // Close on outside click or Escape, the same as the app's modals.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation menu"
        className="-ml-1 rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
      >
        <Icon name="menu" className="h-5 w-5" />
      </button>

      {/* The rail is hidden on mobile, so the wordmark lands here instead. */}
      <div className="flex min-w-0 items-center gap-2 lg:hidden">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
          <LogoMark className="h-4 w-4" />
        </span>
        <span className="truncate text-sm font-semibold text-slate-900">{hospitalName}</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
        <span className="hidden items-center gap-2 rounded-full border border-line bg-slate-50 py-1.5 pl-3 pr-3.5 text-xs font-medium text-slate-600 md:inline-flex">
          <Icon name="appointments" className="h-3.5 w-3.5 text-brand-600" />
          {date}
        </span>

        <Link
          to="/notifications"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          className="relative rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-700"
        >
          <Icon name="bell" className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[0.625rem] font-semibold leading-none text-white ring-2 ring-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        <div className="mx-0.5 hidden h-7 w-px bg-line sm:block" />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2 transition-colors hover:bg-slate-100"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
              {initials || '—'}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block truncate text-sm font-medium text-slate-800">
                {user?.firstName} {user?.lastName}
              </span>
              <span className="block text-[0.6875rem] text-slate-500">
                {role ? ROLE_LABELS[role] : ''}
              </span>
            </span>
            <Icon
              name="chevronDown"
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                menuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-white shadow-lg"
            >
              <div className="border-b border-line px-4 py-3.5">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email}</p>
                {role && (
                  <Badge tone={ROLE_TONES[role]} className="mt-2.5">
                    {ROLE_LABELS[role]}
                  </Badge>
                )}
              </div>

              <div className="p-1.5">
                <Link
                  to="/notifications"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <Icon name="bell" className="h-4 w-4 text-slate-400" />
                  Notifications
                  {unreadCount > 0 && (
                    <span className="ml-auto rounded-full bg-rose-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-rose-700">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={logout}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-rose-50 hover:text-rose-700"
                >
                  <Icon name="logout" className="h-4 w-4 text-slate-400" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
