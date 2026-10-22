import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Button } from './Button.jsx';

/** Accessible modal built on the native <dialog> element (focus trap and Esc handled by the browser). */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      open={typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal ? true : undefined}
      className={`m-auto w-[calc(100%-2rem)] ${size === 'lg' ? 'max-w-2xl' : 'max-w-md'} rounded-lg border border-line-strong bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60`}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id={titleId} className="text-sm font-semibold">
          {title}
        </h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-ink-3 hover:text-ink" aria-label="Close dialog">
          <X className="size-4" />
        </button>
      </div>
      <div className="px-4 py-4 text-sm text-ink-2">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
