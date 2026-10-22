import { KeyRound, Lock, LockOpen } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { describeError, errorCode } from '../../api/client.js';
import { useSystem } from '../../context/SystemContext.jsx';
import { Button } from '../ui/Button.jsx';
import { TextField } from '../ui/Controls.jsx';

/** Unlock/lock form for the admin token, shown inline in the Admin panel (no pop-up). */
export function AdminAccess() {
  const { isAdmin, unlockAdmin, lockAdmin } = useSystem();
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
    } catch (err) {
      setError(errorCode(err) === 'UNAUTHORIZED' ? 'That admin token is not valid.' : describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (isAdmin) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <LockOpen className="size-4" aria-hidden="true" /> Admin unlocked for this browser tab.
        </p>
        <Button size="sm" variant="secondary" icon={Lock} onClick={lockAdmin}>
          Lock
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <TextField
        className="min-w-0 flex-1 basis-64"
        label="Admin token (ADMIN_TOKEN in backend/.env)"
        type="password"
        autoComplete="off"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        error={error}
        hint="Kept in this tab only and sent as a Bearer header."
        required
        minLength={16}
      />
      <Button type="submit" variant="primary" icon={KeyRound} loading={busy} disabled={token.trim().length < 16} className="mb-5">
        Unlock
      </Button>
    </form>
  );
}

/** One-line pointer to the Admin panel wherever an admin-only control lives. */
export function AdminRequiredNotice({ action = 'use this feature' }) {
  const { isAdmin } = useSystem();
  if (isAdmin) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
      <Lock className="size-3.5" aria-hidden="true" />
      Locked: unlock in the
      <Link to="/admin" className="font-medium text-accent hover:text-accent-ink">
        Admin panel
      </Link>
      to {action}.
    </p>
  );
}
