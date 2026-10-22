import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { describeError, errorCode } from '../api/client.js';
import { useSystem } from '../context/SystemContext.jsx';
import { Button } from './ui/Button.jsx';
import { TextField } from './ui/Controls.jsx';
import { Modal } from './ui/Modal.jsx';

export function AdminDialog() {
  const { adminDialogOpen, closeAdminDialog, unlockAdmin } = useSystem();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await unlockAdmin(token.trim());
      setToken('');
      closeAdminDialog();
    } catch (err) {
      setError(errorCode(err) === 'UNAUTHORIZED' ? 'That admin token is not valid.' : describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={adminDialogOpen} onClose={closeAdminDialog} title="Unlock admin actions">
      <form onSubmit={submit} className="space-y-4">
        <p>
          Running the simulator and changing rules or settings require the <code className="text-ink">ADMIN_TOKEN</code> from{' '}
          <code className="text-ink">backend/.env</code>. The token is kept in this browser tab only (session storage)
          and is sent as a Bearer header.
        </p>
        <TextField
          label="Admin token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          error={error}
          required
          minLength={16}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={closeAdminDialog}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={KeyRound} loading={busy} disabled={token.trim().length < 16}>
            Unlock
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Inline notice shown where an admin-only control lives. */
export function AdminRequiredNotice({ action = 'use this feature' }) {
  const { isAdmin, openAdminDialog } = useSystem();
  if (isAdmin) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent/[0.07] px-3 py-2.5 text-sm text-accent-ink">
      <span className="flex items-center gap-2">
        <KeyRound className="size-4 shrink-0" aria-hidden="true" />
        Admin token required to {action}.
      </span>
      <Button size="sm" variant="secondary" onClick={openAdminDialog}>
        Unlock admin
      </Button>
    </div>
  );
}
