import { ChartColumn, Cpu, FlaskConical, House, ListFilter, Lock, LockOpen, SatelliteDish, ShieldCheck, X } from 'lucide-react';
import { NavLink } from 'react-router';
import { useSystem } from '../../context/SystemContext.jsx';

export const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/', label: 'Home', icon: House, end: true },
      { to: '/events', label: 'Events', icon: ListFilter },
      { to: '/analytics', label: 'Insights', icon: ChartColumn },
      { to: '/devices', label: 'Devices', icon: Cpu },
    ],
  },
  { label: 'Learn', items: [{ to: '/lab', label: 'Practice lab', icon: FlaskConical }] },
  { label: 'Manage', items: [{ to: '/admin', label: 'Admin panel', icon: ShieldCheck, lockState: true }] },
];

function NavItems({ onNavigate }) {
  const { isAdmin } = useSystem();
  return (
    <div className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label ?? 'main'}>
          {group.label && <p className="label mb-1.5 px-3">{group.label}</p>}
          <ul className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon, end, lockState }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive ? 'bg-surface-3 font-medium text-ink shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`size-4.5 shrink-0 ${isActive ? 'text-accent' : ''}`} aria-hidden="true" />
                      <span className="flex-1">{label}</span>
                      {lockState &&
                        (isAdmin ? (
                          <LockOpen className="size-3.5 text-emerald-300" aria-label="unlocked" />
                        ) : (
                          <Lock className="size-3.5 text-ink-3" aria-label="locked" />
                        ))}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-3">
      <div className="grid size-9 place-items-center rounded-lg bg-ink text-canvas">
        <SatelliteDish className="size-5" strokeWidth={2.25} aria-hidden="true" />
      </div>
      <div className="leading-tight">
        <p className="text-base font-semibold tracking-tight text-ink">Outpost</p>
        <p className="text-xs text-ink-3">IoT honeypot monitor</p>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <p className="px-3 pb-24 text-[11px] leading-relaxed text-ink-3">For devices and networks you own or may test.</p>
  );
}

export function Sidebar({ mobileOpen, onClose }) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-7 border-r border-line bg-surface py-5 px-3 lg:flex">
        <Brand />
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto">
          <NavItems />
        </nav>
        <Footer />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-7 overflow-y-auto border-r border-line bg-surface py-5 px-3">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={onClose} className="rounded p-1.5 text-ink-3 hover:text-ink" aria-label="Close navigation">
                <X className="size-5" />
              </button>
            </div>
            <nav aria-label="Main navigation" className="flex-1">
              <NavItems onNavigate={onClose} />
            </nav>
            <Footer />
          </aside>
        </div>
      )}
    </>
  );
}
