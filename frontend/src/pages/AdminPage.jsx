import { HeartPulse, KeyRound, Lock, LockOpen, SlidersHorizontal, Wrench } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { AdminAccess } from '../components/admin/AdminAccess.jsx';
import { LabTools } from '../components/admin/LabTools.jsx';
import { RulesSection } from '../components/admin/RulesSection.jsx';
import { SettingsSection } from '../components/admin/SettingsSection.jsx';
import { SketchRocket } from '../components/doodles/Doodles.jsx';
import { PageHeader } from '../components/ui/Card.jsx';
import { useSystem } from '../context/SystemContext.jsx';

const TABS = [
  { id: 'access', label: 'Access', icon: KeyRound },
  { id: 'rules', label: 'Rules', icon: SlidersHorizontal },
  { id: 'settings', label: 'Settings & health', icon: HeartPulse },
  { id: 'tools', label: 'Lab tools', icon: Wrench },
];

const UNLOCKS = [
  'Turn detection rules on or off and tune their thresholds',
  'Change heartbeat timeout, block duration, retention and the test login path',
  'Launch practice waves in the Practice lab',
  'Run the API rate-limit test and clear simulated data',
];

/** Everything that needs the admin token lives here, behind one menu item. */
export default function AdminPage() {
  const { isAdmin } = useSystem();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'access';

  return (
    <>
      <PageHeader
        title="Admin panel"
        description="Access, rules, settings and lab tools in one place. Viewing is open; changes need the admin token."
        doodle={<SketchRocket className="w-full" />}
        actions={
          <span className={`inline-flex items-center gap-1.5 text-sm ${isAdmin ? 'text-emerald-300' : 'text-ink-3'}`}>
            {isAdmin ? <LockOpen className="size-4" aria-hidden="true" /> : <Lock className="size-4" aria-hidden="true" />}
            {isAdmin ? 'Unlocked' : 'Locked'}
          </span>
        }
      />

      <div role="tablist" aria-label="Admin sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = id === tab;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setParams(id === 'access' ? {} : { tab: id }, { replace: true })}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                active ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" key={tab} className="page-in">
        {tab === 'access' && (
          <div className="max-w-2xl space-y-6">
            <AdminAccess />
            <div>
              <h2 className="label mb-2">{isAdmin ? 'You can now' : 'Unlocking lets you'}</h2>
              <ul className="space-y-1.5 text-sm text-ink-2">
                {UNLOCKS.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-accent" aria-hidden="true">
                      ›
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {tab === 'rules' && <RulesSection />}
        {tab === 'settings' && <SettingsSection />}
        {tab === 'tools' && (
          <div className="max-w-3xl">
            <LabTools />
          </div>
        )}
      </div>
    </>
  );
}
