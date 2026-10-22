import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell.jsx';
import { LoadingState } from './components/ui/States.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { SystemProvider } from './context/SystemContext.jsx';
import { MissionsProvider } from './game/MissionsContext.jsx';

// Route-level code splitting keeps the charting library out of the initial bundle.
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const EventsPage = lazy(() => import('./pages/EventsPage.jsx'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage.jsx'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage.jsx'));
const DevicesPage = lazy(() => import('./pages/DevicesPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const SimulatorPage = lazy(() => import('./pages/SimulatorPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

const page = (Component) => (
  <Suspense fallback={<LoadingState rows={6} label="Loading page" />}>
    <Component />
  </Suspense>
);

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={page(DashboardPage)} />
        <Route path="events" element={page(EventsPage)} />
        <Route path="events/:id" element={page(EventDetailPage)} />
        <Route path="analytics" element={page(AnalyticsPage)} />
        <Route path="devices" element={page(DevicesPage)} />
        <Route path="admin" element={page(AdminPage)} />
        <Route path="rules" element={<Navigate to="/admin?tab=rules" replace />} />
        <Route path="lab" element={page(SimulatorPage)} />
        <Route path="simulator" element={<Navigate to="/lab" replace />} />
        <Route path="settings" element={<Navigate to="/admin?tab=settings" replace />} />
        <Route path="*" element={page(NotFoundPage)} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <SystemProvider>
      <ToastProvider>
        <MissionsProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </MissionsProvider>
      </ToastProvider>
    </SystemProvider>
  );
}
