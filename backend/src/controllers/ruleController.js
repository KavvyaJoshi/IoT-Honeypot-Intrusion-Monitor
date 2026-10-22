import { listRules, updateRule } from '../services/ruleService.js';
import { getDetectionStats } from '../services/statsService.js';

export function list(_req, res) {
  res.json({ data: listRules() });
}

export async function update(req, res) {
  res.json({ data: await updateRule(req.params.id, req.validated.body) });
}

export async function detectionStats(req, res) {
  res.json({ data: await getDetectionStats(req.validated.query) });
}
