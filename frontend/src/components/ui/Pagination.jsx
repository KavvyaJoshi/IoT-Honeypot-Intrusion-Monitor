import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '../../lib/format.js';
import { Button } from './Button.jsx';

export function Pagination({ page, totalPages, total, limit, onPageChange }) {
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-3" aria-label="Pagination">
      <p className="tabular">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="tabular">
          Page {page} of {totalPages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
