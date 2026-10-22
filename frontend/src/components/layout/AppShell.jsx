import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useMissions } from '../../game/MissionsContext.jsx';
import { Confetti } from '../fx/Confetti.jsx';
import { PipBuddy } from '../mascot/PipBuddy.jsx';
import { Sidebar } from './Sidebar.jsx';
import { SystemBanner } from './SystemBanner.jsx';
import { TopBar } from './TopBar.jsx';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  const { celebration } = useMissions();
  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-64">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <SystemBanner />
        {/* Keyed by path so every page change replays the entrance animation. */}
        <main id="main" key={pathname} className="page-in mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-8">
          <Outlet />
        </main>
      </div>
      <PipBuddy />
      <Confetti burstKey={celebration?.at} />
    </div>
  );
}
