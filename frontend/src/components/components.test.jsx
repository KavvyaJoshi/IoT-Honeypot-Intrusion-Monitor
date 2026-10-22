import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeEvent, renderWithProviders } from '../test/utils.jsx';
import { BarList } from './charts/BarList.jsx';
import { EventDetails } from './events/EventDetails.jsx';
import { EventTable } from './events/EventTable.jsx';
import { SystemBanner } from './layout/SystemBanner.jsx';
import { AsyncContent } from './ui/States.jsx';

describe('AsyncContent', () => {
  const base = { data: undefined, error: null, loading: false, refreshing: false, refetch: vi.fn() };

  it('shows a loading state before the first response', () => {
    renderWithProviders(<AsyncContent state={{ ...base, loading: true }}>{() => 'content'}</AsyncContent>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('shows an actionable error with retry', async () => {
    const refetch = vi.fn();
    renderWithProviders(
      <AsyncContent state={{ ...base, error: { message: 'Cannot reach the backend API' }, refetch }}>{() => 'content'}</AsyncContent>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the backend API');
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the empty state when data is empty', () => {
    renderWithProviders(
      <AsyncContent state={{ ...base, data: [] }} isEmpty={(d) => d.length === 0} empty={<p>Nothing here</p>}>
        {() => 'content'}
      </AsyncContent>,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('keeps previous data visible when a refresh fails', () => {
    renderWithProviders(
      <AsyncContent state={{ ...base, data: [1], error: { message: 'timeout' } }}>{() => <p>old data</p>}</AsyncContent>,
    );
    expect(screen.getByText('old data')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh failed: timeout');
  });
});

describe('EventTable', () => {
  it('distinguishes simulated, suspicious and blocked events', () => {
    const events = [
      makeEvent({ id: 'a', sourceType: 'simulator', simulated: true, sourceIdentifier: '203.0.113.9' }),
      makeEvent({
        id: 'b',
        path: '/.env',
        category: 'suspicious-path',
        severity: 'medium',
        classification: 'suspicious',
        actionTaken: 'logged',
        detectionReasons: ['Requested path "/.env" matches the sensitive-looking pattern "/.env".'],
      }),
      makeEvent({ id: 'c', severity: 'high', classification: 'high-risk', actionTaken: 'blocked', category: 'repeated-failed-login' }),
    ];
    renderWithProviders(<EventTable events={events} sort="timestamp" order="desc" onSort={() => {}} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Simulated')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Medium')).toBeInTheDocument();
    expect(within(rows[1]).getByText(/sensitive-looking pattern/)).toBeInTheDocument();
    expect(within(rows[2]).getByText('Blocked')).toBeInTheDocument();
    expect(rows[2].className).toContain('border-l-red-500');
  });

  it('expands a row to show detection details', async () => {
    const onToggle = vi.fn();
    renderWithProviders(<EventTable events={[makeEvent()]} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: /expand event details/i }));
    expect(onToggle).toHaveBeenCalledWith('e1');
  });
});

describe('EventDetails', () => {
  it('explains when no rule matched', () => {
    renderWithProviders(<EventDetails event={makeEvent()} />);
    expect(screen.getByText(/No detection rule matched/)).toBeInTheDocument();
  });

  it('lists matched rules with reasons, evidence and redacted headers', () => {
    const event = makeEvent({
      severity: 'high',
      classification: 'high-risk',
      actionTaken: 'blocked',
      detections: [
        {
          ruleId: 'failed-login',
          ruleName: 'Repeated failed test-login attempts',
          category: 'repeated-failed-login',
          severity: 'high',
          reason: '5 failed login attempts against test endpoint /login',
          evidence: { count: 5, threshold: 5 },
          recommendedAction: 'block',
        },
      ],
      metadata: { headers: { authorization: '[REDACTED]', 'content-type': 'text/plain' } },
    });
    renderWithProviders(<EventDetails event={event} />);
    expect(screen.getByText('Repeated failed test-login attempts')).toBeInTheDocument();
    expect(screen.getByText(/5 failed login attempts/)).toBeInTheDocument();
    expect(screen.getByText('recommends: block')).toBeInTheDocument();
    expect(screen.getByText('[REDACTED]')).toBeInTheDocument();
    expect(screen.getByText(/application layer only/)).toBeInTheDocument();
  });

  it('labels simulated events as not real attacks', () => {
    renderWithProviders(<EventDetails event={makeEvent({ sourceType: 'simulator', simulated: true })} />);
    expect(screen.getByText(/not a real attack/)).toBeInTheDocument();
  });
});

describe('BarList', () => {
  it('renders labels and values, or an empty message', () => {
    const { rerender } = renderWithProviders(<BarList items={[{ key: 'a', label: '/login', value: 6 }]} />);
    expect(screen.getByText('/login')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    rerender(<BarList items={[]} emptyLabel="Nothing yet" />);
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });
});

describe('SystemBanner', () => {
  it('warns when the API is unreachable', () => {
    renderWithProviders(<SystemBanner />, { system: { apiReachable: false } });
    expect(screen.getByRole('alert')).toHaveTextContent('Backend API unreachable');
  });

  it('warns when MongoDB is down', () => {
    renderWithProviders(<SystemBanner />, { system: { databaseConnected: false, database: { state: 'disconnected' } } });
    expect(screen.getByRole('alert')).toHaveTextContent('MongoDB is not connected');
  });

  it('renders nothing when healthy', () => {
    renderWithProviders(<SystemBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
