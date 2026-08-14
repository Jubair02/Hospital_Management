import type { ReactNode } from 'react';

type AlertTone = 'error' | 'success' | 'info' | 'warning';

const TONES: Record<AlertTone, string> = {
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  className?: string;
  children?: ReactNode;
}

export default function Alert({ tone = 'info', title, className = '', children }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${TONES[tone]} ${className}`}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}
