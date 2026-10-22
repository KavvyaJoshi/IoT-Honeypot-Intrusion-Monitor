import { ChevronDown, Search, X } from 'lucide-react';
import { useId } from 'react';

const fieldBase =
  'h-9 w-full rounded-md border border-line-strong bg-canvas px-3 text-sm text-ink placeholder:text-ink-3 focus:border-sky-400 focus:outline-none';

/** Single-select segmented control (e.g. time range). Uses radio semantics for accessibility. */
export function SegmentedControl({ label, options, value, onChange, size = 'md' }) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line-strong bg-canvas p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <label
            key={option.value}
            className={`cursor-pointer select-none rounded px-2.5 font-medium transition-colors ${
              size === 'sm' ? 'py-1 text-xs' : 'py-1.5 text-xs sm:text-sm'
            } ${active ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink'} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sky-400`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export function SelectField({ label, value, onChange, options, className = '', hideLabel = false }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1 block text-xs font-medium text-ink-3'}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldBase} appearance-none pr-8`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-ink-3" aria-hidden="true" />
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search', className = '' }) {
  const id = useId();
  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-ink-3" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        maxLength={100}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${fieldBase} pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1.5 rounded p-1 text-ink-3 hover:text-ink"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function TextField({ label, hint, error, className = '', ...inputProps }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-3">
        {label}
      </label>
      <input id={id} className={`${fieldBase} ${error ? 'border-red-500/70' : ''}`} aria-invalid={Boolean(error)} {...inputProps} />
      {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, hint, className = '', ...props }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-3">
        {label}
      </label>
      <textarea
        id={id}
        className="w-full rounded-md border border-line-strong bg-canvas px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-3 focus:border-sky-400 focus:outline-none"
        {...props}
      />
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled = false, srOnlyLabel = false }) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <span className="relative inline-flex">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-5 w-9 rounded-full bg-surface-3 ring-1 ring-line-strong transition-colors peer-checked:bg-emerald-500/80 peer-focus-visible:outline-2 peer-focus-visible:outline-sky-400" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-ink transition-transform peer-checked:translate-x-4" />
      </span>
      <span className={srOnlyLabel ? 'sr-only' : 'text-sm text-ink-2'}>{label}</span>
    </label>
  );
}
