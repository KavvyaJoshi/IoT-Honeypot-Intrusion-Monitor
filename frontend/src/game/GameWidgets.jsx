import { CircleCheck, Lock, Trophy } from 'lucide-react';
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
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rank.progress * 100)} aria-label="Progress to next rank">
          <div className="h-full rounded-full bg-accent" style={{ width: `${rank.progress * 100}%`, transition: 'width 0.6s ease' }} />
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
  return (
    <ul className="stagger grid grid-cols-1 gap-2.5 md:grid-cols-2">
      {shown.map((mission) => {
        const Icon = mission.icon;
        return (
          <li
            key={mission.id}
            className={`lift flex items-start gap-3 rounded-xl border p-3.5 ${
              mission.done ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-line bg-surface-2/60'
            }`}
          >
            <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${mission.done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-surface-3 text-ink-3'}`}>
              {mission.done ? <CircleCheck className="size-5" aria-hidden="true" /> : <Icon className="size-5" aria-hidden="true" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{mission.title}</p>
                <span className={`shrink-0 text-xs font-semibold ${mission.done ? 'text-emerald-300' : 'text-accent'}`}>
                  {mission.done ? 'Done' : `+${mission.xp} XP`}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-ink-2">{mission.goal}</p>
              {!mission.done && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-3">
                  <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  {mission.how}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
