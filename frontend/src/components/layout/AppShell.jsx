import { useState } from 'react';
import { Outlet } from 'react-router';
import { AdminDialog } from '../AdminDialog.jsx';
import { Sidebar } from './Sidebar.jsx';
import { SystemBanner } from './SystemBanner.jsx';
import { TopBar } from './TopBar.jsx';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-60">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <SystemBanner />
        <main id="main" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
      <AdminDialog />
    </div>
  );
}
