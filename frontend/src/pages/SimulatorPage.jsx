import { Bug, FileWarning, FlaskConical, Gauge, Globe, KeyRound, Rocket, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { describeError } from '../api/client.js';
import { api } from '../api/endpoints.js';
import { AdminRequiredNotice } from '../components/admin/AdminAccess.jsx';
import { SketchUfo } from '../components/doodles/Doodles.jsx';
import { SpaceScene } from '../components/space/SpaceScene.jsx';
import { Button } from '../components/ui/Button.jsx';
import { PageHeader } from '../components/ui/Card.jsx';
import { Toggle } from '../components/ui/Controls.jsx';
import { AsyncContent, EmptyState } from '../components/ui/States.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { useSystem } from '../context/SystemContext.jsx';
import { MissionList, RankCard } from '../game/GameWidgets.jsx';
import { useApi } from '../hooks/useApi.js';

/** Friendly framing for each backend scenario. */
const CHALLENGES = {
  normal: { icon: Globe, story: 'A regular visitor opens a page.', expect: 'lands safely' },
  'repeated-requests': { icon: FileWarning, story: 'Someone guesses page names that do not exist.', expect: 'page guesser gets spotted' },
  'failed-login': { icon: KeyRound, story: 'A bot keeps guessing the admin password.', expect: 'password guesser gets shot down' },
  'suspicious-path': { icon: Search, story: 'A scanner looks for secret files like /.env.', expect: 'snooper gets spotted' },
  malformed: { icon: Bug, story: 'A broken or tricky request arrives.', expect: 'glitcher gets spotted' },
  'rate-limit-threshold': { icon: Gauge, story: 'One source floods the device with requests.', expect: 'flooder gets frozen' },
};

function resultMessage(result) {
  if (result.disabledRules.length) {
    return { tone: 'warning', title: 'No detection: rule is off', message: `Turn on ${result.disabledRules.join(', ')} in Admin panel → Rules.` };
  }
  if (result.scenario === 'normal') return { tone: 'success', title: 'Friendly landing', message: 'Normal traffic passed. No rules fired, as expected.' };
  const blocked = result.byAction.blocked ?? 0;
  const limited = result.byAction['rate-limited'] ?? 0;
  const outcome = blocked ? `${blocked} shot down` : limited ? `${limited} frozen` : 'spotted and logged';
  return { tone: 'success', title: `Wave repelled: ${result.flagged} of ${result.generated} flagged`, message: `${outcome}. Simulated source ${result.sourceIp}.` };
}

/** The API returns a compact event shape; add what the scene needs. Everything here is simulated. */
function toWave(result) {
  return result.events.map((e) => ({ ...e, classification: e.severity === 'info' ? 'normal' : 'suspicious', simulated: true }));
}

function waveSummary(result) {
  const parts = [];
  if (result.byAction.blocked) parts.push(`${result.byAction.blocked} shot down`);
  if (result.byAction['rate-limited']) parts.push(`${result.byAction['rate-limited']} frozen`);
  if (result.byAction.logged) parts.push(`${result.byAction.logged} spotted`);
  if (result.byAction.allowed) parts.push(`${result.byAction.allowed} landed safely`);
  return parts.join(' · ');
}

export default function SimulatorPage() {
  const { isAdmin, simulatorEnabled, databaseConnected, health } = useSystem();
  const { notify } = useToast();
  const scenarios = useApi(() => api.scenarios(), [], { enabled: health ? simulatorEnabled : true });
  const [runningId, setRunningId] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [waveKey, setWaveKey] = useState(0);
  const [reuseSource, setReuseSource] = useState(false);

  const canRun = isAdmin && simulatorEnabled && databaseConnected;

  async function launch(id) {
    setRunningId(id);
    try {
      const body = { scenario: id };
      if (reuseSource && lastResult?.sourceIp) body.sourceIp = lastResult.sourceIp;
      const result = await api.runScenario(body);
      setLastResult(result);
      setWaveKey((k) => k + 1);
      notify(resultMessage(result));
    } catch (err) {
      notify({ tone: 'warning', title: 'Could not launch the wave', message: describeError(err) });
    } finally {
      setRunningId(null);
    }
  }

  if (health && !simulatorEnabled) {
    return (
      <>
        <PageHeader title="Practice lab" />
        <EmptyState icon={FlaskConical} title="Simulator disabled on this server" description="Set SIMULATOR_ENABLED=true in backend/.env (development only) and restart the backend." />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Practice lab"
        description="Launch simulated alien waves at your own backend and watch the rules fight back. Nothing leaves your machine."
        doodle={<SketchUfo className="w-full" />}
      />


      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section aria-labelledby="challenges" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="challenges" className="font-semibold text-ink">
              Challenges
            </h2>
            <Toggle
              checked={reuseSource}
              onChange={setReuseSource}
              disabled={!lastResult}
              label={lastResult ? `Same attacker again (${lastResult.sourceIp})` : 'Same attacker again'}
            />
          </div>
          <AdminRequiredNotice action="launch waves" />
          {!databaseConnected && <p className="text-sm text-amber-200">The database is offline, so waves cannot be stored right now.</p>}
          <AsyncContent state={scenarios}>
            {(list) => (
              <ul className="stagger divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {list.map((scenario) => {
                  const challenge = CHALLENGES[scenario.id] ?? { icon: FlaskConical, story: scenario.description, expect: '' };
                  const Icon = challenge.icon;
                  const ruleOff = scenario.relatedRules.some((r) => !r.enabled);
                  return (
                    <li key={scenario.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-surface-2/60">
                      <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="text-sm font-medium text-ink">{scenario.label}</p>
                        <p className="text-sm text-ink-3">
                          {challenge.story} <span className="font-doodle text-base text-ink-2">→ {challenge.expect}</span>
                          {ruleOff && <span className="text-amber-300"> (a related rule is off)</span>}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={Rocket}
                        onClick={() => launch(scenario.id)}
                        disabled={!canRun || (runningId !== null && runningId !== scenario.id)}
                        loading={runningId === scenario.id}
                      >
                        Launch
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </AsyncContent>
          {lastResult && (
            <p className="text-sm text-ink-3">
              Last wave stored as simulated events.{' '}
              <Link to={`/events?sourceType=simulator&search=${encodeURIComponent(lastResult.sourceIp)}`} className="text-accent hover:text-accent-ink">
                See them in Events →
              </Link>
            </p>
          )}
        </section>
        <aside className="overflow-hidden rounded-2xl border border-line bg-[#030303] xl:sticky xl:top-20" aria-label="Practice arena">
          <SpaceScene
            mode="wave"
            events={lastResult ? toWave(lastResult) : []}
            waveKey={waveKey}
            onReplay={() => setWaveKey((k) => k + 1)}
            emptyNote="Launch a challenge"
            overlay={
              <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
                <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 font-mono text-[11px] tracking-wider text-fuchsia-200 uppercase">simulation</span>
                {lastResult && <span className="font-doodle text-lg text-ink-2">{waveSummary(lastResult)}</span>}
              </div>
            }
          />
          <p className="px-4 pb-3 text-xs text-ink-3">{lastResult ? 'Ships: lime = shot down, blue = frozen, amber = spotted, white = landed safely.' : 'Your launched wave plays here.'}</p>
        </aside>
      </div>

      <section aria-labelledby="missions" className="space-y-3">
        <h2 id="missions" className="font-semibold text-ink">
          Missions
        </h2>
        <div className="max-w-md">
          <RankCard compact />
        </div>
        <MissionList />
        <p className="text-xs text-ink-3">Progress is saved in this browser. Reset it in Admin panel → Lab tools.</p>
      </section>
    </div>
  );
}
