import type { ReactNode } from 'react';
import type { Role } from '../../types';

export type BadgeTone =
  | 'green'
  | 'red'
  | 'amber'
  | 'blue'
  | 'slate'
  | 'brand'
  | 'teal'
  | 'violet';

/**
 * Tinted pill on a light plate with a hairline ring. Every tone keeps its
 * text at the 700/800 step so all badges hold 4.5:1 against their own fill —
 * the pale-on-pale badge is the most common contrast failure in dashboards.
 */
const TONES: Record<BadgeTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  teal: 'bg-accent-50 text-accent-700 ring-accent-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

/**
 * Tone per staff role, used across tables and headers.
 *
 * Roles are identities, not statuses, so none of them takes red — red stays
 * reserved for things that are actually wrong. Six roles genuinely need six
 * distinguishable hues, which is why this set is wider than the five status
 * tones used by the KPI tiles.
 */
export const ROLE_TONES: Record<Role, BadgeTone> = {
  admin: 'brand',
  doctor: 'teal',
  receptionist: 'amber',
  nurse: 'green',
  pharmacist: 'violet',
  lab_technician: 'slate',
  patient: 'green',
};

interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

export default function Badge({ tone = 'slate', className = '', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem]
        font-semibold leading-none ring-1 ring-inset ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
