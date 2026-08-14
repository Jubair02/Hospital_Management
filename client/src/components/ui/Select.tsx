import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string;
  hint?: string;
  options?: SelectOption[];
  placeholder?: string;
}

export default function Select({
  label,
  error,
  hint,
  options = [],
  placeholder,
  className = '',
  ...rest
}: SelectProps) {
  const id = useId();

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={`block min-h-10 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm
          text-slate-900 shadow-xs transition-colors
          focus:outline-none focus:ring-4
          disabled:bg-slate-50 disabled:text-slate-500
          ${
            error
              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'
              : 'border-line-strong hover:border-slate-400 focus:border-brand-600 focus:ring-brand-100'
          }`}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="mt-1.5 text-sm text-rose-600">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-slate-500">{hint}</p>
      )}
    </div>
  );
}
