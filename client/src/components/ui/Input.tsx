import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  hint?: string;
  /**
   * Control pinned inside the field's trailing edge — a password reveal
   * toggle, a unit suffix, a clear button. Lives here rather than being
   * absolutely positioned by the caller, because the caller would have to
   * hard-code an offset for this component's label height and re-break every
   * time that label changes.
   */
  trailing?: ReactNode;
}

export default function Input({
  label,
  error,
  hint,
  trailing,
  type = 'text',
  className = '',
  ...rest
}: InputProps) {
  const id = useId();

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type={type}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`block min-h-10 w-full rounded-xl border bg-white py-2.5 pl-3.5 text-sm
            text-slate-900 shadow-xs transition-colors
            placeholder:text-slate-400
            focus:outline-none focus:ring-4
            disabled:bg-slate-50 disabled:text-slate-500
            ${trailing ? 'pr-12' : 'pr-3.5'}
            ${
              error
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'
                : 'border-line-strong hover:border-slate-400 focus:border-brand-600 focus:ring-brand-100'
            }`}
          {...rest}
        />
        {trailing && (
          <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span>
        )}
      </div>
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
