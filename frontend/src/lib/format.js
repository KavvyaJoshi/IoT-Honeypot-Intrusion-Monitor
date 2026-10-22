const numberFormat = new Intl.NumberFormat();
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const hourMinute = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' });
const dayMonthTime = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function formatNumber(value) {
  return value === null || value === undefined ? '—' : numberFormat.format(value);
}

export function formatDateTime(value) {
  return value ? dateTimeFormat.format(new Date(value)) : '—';
}

export function formatTime(value) {
  return value ? timeFormat.format(new Date(value)) : '—';
}

export function formatRelative(value, now = Date.now()) {
  if (!value) return 'Never';
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${totalSeconds % 60}s`;
  return `${totalSeconds}s`;
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Axis tick label appropriate for the bucket size returned by the stats API. */
export function formatBucketTick(iso, bucketMs) {
  const date = new Date(iso);
  if (bucketMs >= 24 * 3600_000) return dayMonth.format(date);
  if (bucketMs >= 6 * 3600_000) return dayMonthTime.format(date);
  return hourMinute.format(date);
}

export function formatBucketRange(iso, bucketMs) {
  const start = new Date(iso);
  const end = new Date(start.getTime() + bucketMs);
  const format = bucketMs >= 24 * 3600_000 ? dayMonth : dayMonthTime;
  return `${format.format(start)} – ${format.format(end)}`;
}

/** Human-readable label for a rule parameter or JSON key such as "windowSeconds". */
export function humanize(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}
