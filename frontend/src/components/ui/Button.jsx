import { LoaderCircle } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:bg-sky-500/40',
  secondary: 'border border-line-strong bg-surface-2 text-ink hover:bg-surface-3 disabled:text-ink-3',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink disabled:text-ink-3',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-600/40',
  'danger-outline': 'border border-red-500/50 text-red-300 hover:bg-red-500/10 disabled:opacity-50',
};

const SIZES = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="size-4" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
