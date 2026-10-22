import { Inbox, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from './Button.jsx';

export function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'} px-4`}>
      <div className="mb-3 rounded-full border border-line bg-surface-2 p-3">
        <Icon className="size-5 text-ink-3" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Could not load data', message, onRetry, compact = false }) {
  return (
    <div role="alert" className={`flex flex-col items-center justify-center px-4 text-center ${compact ? 'py-8' : 'py-14'}`}>
      <div className="mb-3 rounded-full border border-red-500/30 bg-red-500/10 p-3">
        <TriangleAlert className="size-5 text-red-300" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {message && <p className="mt-1 max-w-lg text-sm text-ink-2">{message}</p>}
      {onRetry && (
        <Button className="mt-4" size="sm" icon={RefreshCw} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded bg-surface-3/70 ${className}`} aria-hidden="true" />;
}

export function LoadingState({ rows = 4, label = 'Loading…' }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  );
}

/**
 * Renders loading / error / empty / content consistently. While refetching, the previous
 * content stays on screen at reduced opacity instead of flashing a skeleton.
 */
export function AsyncContent({ state, isEmpty, empty, loading, children, errorTitle, compact }) {
  if (state.loading && state.data === undefined) return loading ?? <LoadingState />;
  if (state.error && state.data === undefined) {
    return <ErrorState title={errorTitle} message={state.error.message} onRetry={state.refetch} compact={compact} />;
  }
  if (state.data !== undefined && isEmpty?.(state.data)) return empty;
  return (
    <div className={`transition-opacity ${state.refreshing ? 'opacity-60' : 'opacity-100'}`} aria-busy={state.refreshing}>
      {state.error && (
        <p role="alert" className="mx-4 mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Showing the last loaded data. Refresh failed: {state.error.message}
        </p>
      )}
      {children(state.data)}
    </div>
  );
}
