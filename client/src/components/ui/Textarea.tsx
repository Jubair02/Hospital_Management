import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  hint?: string;
}

export default function Textarea({
  label,
  error,
  hint,
  rows = 3,
  className = '',
  ...rest
}: TextareaProps) {
  const id = useId();

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`block w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm leading-relaxed
          text-slate-900 shadow-xs transition-colors
          placeholder:text-slate-400
          focus:outline-none focus:ring-4
          disabled:bg-slate-50 disabled:text-slate-500
          ${
            error
              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'
              : 'border-line-strong hover:border-slate-400 focus:border-brand-600 focus:ring-brand-100'
          }`}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-slate-500">{hint}</p>
      )}
    </div>
  );
}
