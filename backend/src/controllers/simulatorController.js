import { listScenarios, resetSimulatorData, runScenario } from '../services/simulatorService.js';

export function scenarios(_req, res) {
  res.json({ data: listScenarios() });
}

export async function run(req, res) {
  res.status(201).json({ data: await runScenario(req.validated.body) });
}

export async function reset(_req, res) {
  res.json({ data: await resetSimulatorData() });
}

/** Target for the API rate-limiter demonstration; the limiter in front of it does the work. */
export function probe(req, res) {
  const remaining = req.rateLimit?.remaining ?? null;
  res.json({ data: { accepted: true, limit: req.rateLimit?.limit ?? null, remaining } });
}
