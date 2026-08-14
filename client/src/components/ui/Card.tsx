import type { ReactNode } from 'react';
import Icon, { type IconName } from './icons';

interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Tinted glyph beside the title, for cards that need identifying fast. */
  icon?: IconName;
  /** Set false when the child manages its own padding (tables, lists). */
  padded?: boolean;
  /** Rendered under a hairline at the foot of the card. */
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * The one panel surface in the app. Header, body and footer are separated by
 * hairlines rather than by shadow or colour, which keeps a page of many cards
 * calm instead of quilted.
 */
export default function Card({
  title,
  subtitle,
  actions,
  icon,
  padded = true,
  footer,
  className = '',
  children,
}: CardProps) {
  return (
    // `min-w-0` matters: as a grid item the card would otherwise be sized by
    // its min-content, and an SVG with a viewBox reports that viewBox as its
    // intrinsic width — which blows the column past the viewport on mobile.
    <section className={`surface-card flex min-w-0 flex-col ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                <Icon name={icon} className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-[0.9375rem] font-semibold text-slate-900">{title}</h2>
              )}
              {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}

      <div className={padded ? 'flex-1 p-5' : 'flex-1'}>{children}</div>

      {footer && (
        <div className="border-t border-line bg-slate-50/60 px-5 py-3 text-xs text-slate-500">
          {footer}
        </div>
      )}
    </section>
  );
}
