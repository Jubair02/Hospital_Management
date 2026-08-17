import type { MouseEventHandler } from 'react';
import { Link } from 'react-router-dom';
import Icon from './icons';

interface BackLinkProps {
  /** Where the reader came from, not merely one level up the URL. */
  to: string;
  /** Name the destination — "Back" alone makes the reader guess. */
  label: string;
  /**
   * Intercept the departure — for a page holding unsaved work, which should
   * ask before throwing it away. Call `preventDefault()` to stay put.
   */
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}

/**
 * The way out of a page, sitting above its title.
 *
 * Deliberately not part of the action row: an action row changes the record,
 * and leaving does not. Deliberately not `history.back()` either — a reader
 * who arrived from a link, a bookmark, or a page refresh would be sent
 * somewhere unrelated, whereas a named destination is the same every time.
 */
export default function BackLink({ to, label, onClick, className = '' }: BackLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`-ml-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-slate-900 ${className}`}
    >
      <Icon name="chevronLeft" className="h-4 w-4" strokeWidth="2.2" />
      {label}
    </Link>
  );
}
