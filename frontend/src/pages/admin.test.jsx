import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fateOf, SpaceScene } from '../components/space/SpaceScene.jsx';
import { makeEvent, renderWithProviders } from '../test/utils.jsx';

vi.mock('../api/endpoints.js', () => ({
  tzOffset: () => 0,
  api: {
    rules: vi.fn(),
    detectionStats: vi.fn(),
    settings: vi.fn(),
    databaseHealth: vi.fn(),
    devices: vi.fn(),
  },
}));

const { api } = await import('../api/endpoints.js');
const { default: AdminPage } = await import('./AdminPage.jsx');

beforeEach(() => vi.resetAllMocks());

describe('AdminPage', () => {
  it('shows the unlock form when locked and unlocks with a token', async () => {
    const unlockAdmin = vi.fn().mockResolvedValue();
    renderWithProviders(<AdminPage />, { route: '/admin', system: { unlockAdmin } });
    expect(screen.getByRole('tab', { name: /Access/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Locked')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Admin token/), 'a-very-long-admin-token-123');
    await userEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    expect(unlockAdmin).toHaveBeenCalledWith('a-very-long-admin-token-123');
  });

  it('shows a clear error for a wrong token', async () => {
    const unlockAdmin = vi.fn().mockRejectedValue({ response: { data: { error: { code: 'UNAUTHORIZED', message: 'nope' } } } });
    renderWithProviders(<AdminPage />, { route: '/admin', system: { unlockAdmin } });
    await userEvent.type(screen.getByLabelText(/Admin token/), 'wrong-token-wrong-token');
    await userEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    expect(await screen.findByText('That admin token is not valid.')).toBeInTheDocument();
  });

  it('offers Lock when already unlocked', () => {
    const lockAdmin = vi.fn();
    renderWithProviders(<AdminPage />, { route: '/admin', system: { isAdmin: true, lockAdmin } });
    expect(screen.getByText('Unlocked')).toBeInTheDocument();
    screen.getByRole('button', { name: /Lock/ }).click();
    expect(lockAdmin).toHaveBeenCalled();
  });

  it('opens the Rules tab from the URL', async () => {
    api.rules.mockResolvedValue([
      {
        id: 'failed-login',
        name: 'Repeated failed test-login attempts',
        description: 'desc',
        category: 'repeated-failed-login',
        enabled: true,
        severity: 'high',
        action: 'block',
        params: { threshold: 5, windowSeconds: 300 },
        defaults: { severity: 'high', action: 'block', params: { threshold: 5, windowSeconds: 300 } },
        paramFields: [],
        updatedAt: null,
      },
    ]);
    api.detectionStats.mockResolvedValue({ rules: [], activeEnforcements: [] });
    renderWithProviders(<AdminPage />, { route: '/admin?tab=rules' });
    expect(await screen.findByText('Password guessing')).toBeInTheDocument();
    expect(screen.getByText('Fires at 5 failures in 300s')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('switch')).toBeDisabled());
  });
});

describe('SpaceScene', () => {
  it('maps real outcomes to ship fates', () => {
    expect(fateOf(makeEvent({ classification: 'high-risk', actionTaken: 'blocked' }))).toBe('destroyed');
    expect(fateOf(makeEvent({ classification: 'suspicious', actionTaken: 'rate-limited' }))).toBe('frozen');
    expect(fateOf(makeEvent({ classification: 'suspicious', actionTaken: 'logged' }))).toBe('spotted');
    expect(fateOf(makeEvent({ classification: 'normal', actionTaken: 'allowed' }))).toBe('friendly');
  });

  it('draws one ship per flagged event (static when motion is reduced) and tags simulated ones', () => {
    const events = [
      makeEvent({ id: 'a', classification: 'high-risk', severity: 'high', actionTaken: 'blocked', category: 'repeated-failed-login', simulated: true }),
      makeEvent({ id: 'b', classification: 'suspicious', severity: 'medium', actionTaken: 'logged', category: 'suspicious-path' }),
      makeEvent({ id: 'c' }),
    ];
    const { container } = renderWithProviders(<SpaceScene events={events} />);
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent);
    expect(titles).toHaveLength(2);
    expect(titles.some((t) => /^password guesser · sim: /.test(t))).toBe(true);
    expect(titles.some((t) => /^snooper: /.test(t))).toBe(true);
    expect(screen.getByRole('img', { name: /2 recent flagged requests/ })).toBeInTheDocument();
  });

  it('shows the empty note when there is nothing to show', () => {
    renderWithProviders(<SpaceScene events={[]} emptyNote="All quiet" />);
    expect(screen.getByText('All quiet')).toBeInTheDocument();
  });
});
