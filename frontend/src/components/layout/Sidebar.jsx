import {
  ChartColumn,
  Cpu,
  FlaskConical,
  LayoutDashboard,
  ListFilter,
  Radar,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router';

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/events', label: 'Security events', icon: ListFilter },
  { to: '/analytics', label: 'Analytics', icon: ChartColumn },
  { to: '/devices', label: 'Devices', icon: Cpu },
  { to: '/rules', label: 'Detection rules', icon: SlidersHorizontal },
  { to: '/simulator', label: 'Controlled testing', icon: FlaskConical },
  { to: '/settings', label: 'Settings & health', icon: Settings },
];

function NavItems({ onNavigate }) {
  return (
    <ul className="space-y-0.5">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-surface-3 font-medium text-ink shadow-[inset_2px_0_0_#38bdf8]'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2.5">
      <div className="grid size-8 place-items-center rounded-md bg-sky-500/15 ring-1 ring-sky-400/30">
        <Radar className="size-4 text-sky-300" aria-hidden="true" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-ink">IoT Honeypot</p>
        <p className="text-[11px] text-ink-3">Intrusion monitor</p>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <p className="px-2.5 text-[11px] leading-relaxed text-ink-3">
      Educational defensive-security lab. Monitor only devices and networks you own or are authorised to test.
    </p>
  );
}

export function Sidebar({ mobileOpen, onClose }) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-6 border-r border-line bg-surface py-5 px-3 lg:flex">
        <Brand />
        <nav aria-label="Main navigation" className="flex-1">
          <NavItems />
        </nav>
        <Footer />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col gap-6 border-r border-line bg-surface py-5 px-3">
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
