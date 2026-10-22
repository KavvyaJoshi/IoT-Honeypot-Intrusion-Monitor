import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pip } from '../components/mascot/Pip.jsx';
import { describeEvent, describeOutcome } from '../lib/describe.js';
import { makeEvent } from '../test/utils.jsx';
import { buildFacts, MISSIONS, rankFor, TOTAL_XP } from './missions.js';

const empty = { detection: { rules: [] }, overview: { totals: { total: 0 }, byCategory: [] }, devices: [], rules: [] };
const done = (facts) => MISSIONS.filter((m) => m.check(facts)).map((m) => m.id);

describe('missions', () => {
  it('nothing is complete on an empty system', () => {
    expect(done(buildFacts(empty, new Set()))).toEqual([]);
  });

  it('completes missions from real backend facts', () => {
    const facts = buildFacts(
      {
        detection: { rules: [{ ruleId: 'failed-login', matches: 2 }, { ruleId: 'suspicious-path', matches: 0 }] },
        overview: { totals: { total: 9 }, byCategory: [{ category: 'api-rate-limit', count: 1 }] },
        devices: [],
        rules: [{ id: 'request-rate', updatedAt: '2026-10-23T10:00:00Z' }],
      },
      new Set(['investigate']),
    );
    expect(done(facts)).toEqual(['first-signal', 'password-guesser', 'api-shield', 'investigator', 'tuner']);
  });

  it('hardware mission needs a real device heartbeat, not simulator traffic', () => {
    const simulatedOnly = buildFacts({ ...empty, overview: { totals: { total: 50 }, byCategory: [] } }, new Set());
    expect(done(simulatedOnly)).not.toContain('hardware');
    const withDevice = buildFacts({ ...empty, devices: [{ deviceId: 'esp', heartbeatCount: 3 }] }, new Set());
    expect(done(withDevice)).toContain('hardware');
  });

  it('ranks progress by XP', () => {
    expect(rankFor(0)).toMatchObject({ name: 'Rookie', level: 1 });
    expect(rankFor(260)).toMatchObject({ name: 'Analyst', level: 3 });
    expect(rankFor(TOTAL_XP)).toMatchObject({ name: 'Guardian', next: null, progress: 1 });
    expect(rankFor(175).progress).toBeCloseTo(0.5);
  });
});

describe('plain-language descriptions', () => {
  it.each([
    [{ category: 'repeated-failed-login' }, 'Kept failing to log in (possible password guessing)'],
    [{ category: 'normal', path: '/status' }, 'Normal visit to /status'],
    [{ category: 'route-enumeration' }, 'Guessed lots of pages that do not exist'],
  ])('%o', (overrides, expected) => {
    expect(describeEvent(makeEvent(overrides))).toBe(expected);
  });

  it('describes outcomes', () => {
    expect(describeOutcome(makeEvent({ actionTaken: 'blocked' }))).toBe('Blocked');
  });
});

describe('Pip mascot', () => {
  it.each([
    ['calm', /calm/],
    ['alert', /on alert/],
    ['sleep', /asleep/],
    ['party', /celebrating/],
  ])('renders the %s mood with an accessible label', (mood, label) => {
    render(<Pip mood={mood} />);
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
  });
});
