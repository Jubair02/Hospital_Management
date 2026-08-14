import type { ButtonHTMLAttributes } from 'react';
import Spinner from './Spinner';

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'dangerGhost' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * `primary` is the brand blue and should be the only filled button in most
 * groups — when every button is filled nothing is primary, so secondary
 * actions get a hairline and tertiary actions get nothing but text.
 *
 * `accent` is the teal accent, for the one place a second filled action needs
 * to stand apart from the primary rather than beneath it.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 disabled:shadow-none',
  accent:
    'bg-accent-600 text-white shadow-xs hover:bg-accent-700 active:bg-accent-800 disabled:bg-accent-300 disabled:shadow-none',
  secondary:
    'bg-white text-slate-700 ring-1 ring-inset ring-line-strong shadow-xs hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 disabled:text-slate-400 disabled:shadow-none',
  danger:
    'bg-rose-600 text-white shadow-xs hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300 disabled:shadow-none',
  /**
   * Quiet destructive action, for a Delete that repeats on every row of a
   * table. A column of solid red buttons reads as a warning about the data
   * rather than as a set of controls, and makes the row's actual content the
   * least prominent thing in it — so the colour stays in the text until the
   * pointer is actually on the button.
   */
  dangerGhost:
    'bg-transparent text-rose-700 hover:bg-rose-600 hover:text-white active:bg-rose-700 disabled:bg-transparent disabled:text-rose-300',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 disabled:text-slate-400',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-[0.8125rem]',
  md: 'min-h-10 px-4 py-2.5 text-sm',
  lg: 'min-h-11 px-5 py-3 text-[0.9375rem]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl
        font-medium transition-colors duration-150 disabled:cursor-not-allowed
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {children}
    </button>
  );
}
