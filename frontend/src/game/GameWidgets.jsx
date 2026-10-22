import { CircleCheck, Flag, Lock, Rocket, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { useMissions } from './MissionsContext.jsx';

/** Circular XP ring with the level number in the middle. */
export function LevelRing({ size = 44 }) {
  const { rank } = useMissions();
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - rank.progress)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold text-ink">{rank.level}</span>
    </div>
  );
}

/** Compact rank chip for the top bar. */
export function RankChip() {
  const { rank, xp } = useMissions();
  return (
    <Link
      to="/lab"
      className="hidden items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-xs hover:border-line-strong sm:inline-flex"
      title={`${xp} XP. Open the Practice lab to earn more.`}
    >
      <Trophy className="size-3.5 text-accent" aria-hidden="true" />
      <span className="font-semibold text-ink">{rank.name}</span>
      <span className="text-ink-3">{xp} XP</span>
    </Link>
  );
}

/** Rank card with XP progress bar, used on Home and in the Practice lab. */
export function RankCard({ compact = false }) {
  const { rank, xp, completed, missions } = useMissions();
  return (
    <div className="flex items-center gap-4">
      <LevelRing size={compact ? 48 : 64} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Your analyst rank</p>
        <p className={`${compact ? 'text-base' : 'text-xl'} font-semibold text-ink`}>
          {rank.name} <span className="text-sm font-normal text-ink-3">· level {rank.level}</span>
        </p>
        {/* A rocket flying toward the next rank's flag. */}
        <div className="relative mt-3 h-1.5 rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rank.progress * 100)} aria-label="Progress to next rank">
          <div className="h-full rounded-full bg-accent" style={{ width: `${rank.progress * 100}%`, transition: 'width 0.6s ease' }} />
          <span className="rocket-bob absolute -top-2.5" style={{ left: `${Math.max(3, Math.min(97, rank.progress * 100))}%` }}>
            <Rocket className="size-4 fill-canvas text-accent" aria-hidden="true" />
          </span>
          <Flag className="absolute -top-3 -right-1 size-3.5 text-ink-3" aria-hidden="true" />
        </div>
        <p className="mt-1.5 text-xs text-ink-3">
          {xp} XP · {completed}/{missions.length} missions
          {rank.next ? ` · ${rank.next.min - xp} XP to ${rank.next.name}` : ' · top rank reached'}
        </p>
      </div>
    </div>
  );
}

/** Mission list: done missions show a check, the rest show how to complete them. */
export function MissionList({ limit }) {
  const { missions } = useMissions();
  const ordered = [...missions].sort((a, b) => Number(a.done) - Number(b.done));
  const shown = limit ? ordered.slice(0, limit) : ordered;
  // One compact list: open missions show how to finish them, completed ones collapse to a line.
  return (
    <ul className="stagger divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {shown.map((mission) => {
        const Icon = mission.icon;
        return (
          <li key={mission.id} className="flex items-start gap-3 px-4 py-3">
            {mission.done ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden="true" />
            ) : (
              <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${mission.done ? 'text-ink-3' : 'font-medium text-ink'}`}>
                {mission.title}
                {!mission.done && <span className="font-normal text-ink-2"> · {mission.goal}</span>}
              </p>
              {!mission.done && (
                <p className="mt-0.5 flex items-start gap-1.5 text-xs text-ink-3">
                  <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  {mission.how}
                </p>
              )}
            </div>
            <span className={`shrink-0 font-mono text-xs ${mission.done ? 'text-emerald-300' : 'text-accent'}`}>
              {mission.done ? 'done' : `+${mission.xp} XP`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
