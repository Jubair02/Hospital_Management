import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Small line above the title: section, role, or breadcrumb tail. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Buttons and links, right-aligned on desktop, wrapping on mobile. */
  actions?: ReactNode;
  /** Status chips or a live "last updated" line under the subtitle. */
  meta?: ReactNode;
  className?: string;
}

/**
 * The single page-title block used across dashboards and reports. Having one
 * component means the title size, the eyebrow tracking and the action
 * alignment cannot drift between screens.
 */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  meta,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-brand-600">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-[1.75rem]">{title}</h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p>
        )}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </div>
  );
}

/**
 * Section divider inside a long dashboard. Quieter than a page title so the
 * hierarchy stays two levels deep, never three competing headings.
 */
export function SectionHeading({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
