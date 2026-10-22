import { getSettings, publicEnvironment, updateSettings } from '../services/settingsService.js';

export function get(_req, res) {
  res.json({ data: { runtime: getSettings(), environment: publicEnvironment() } });
}

export async function update(req, res) {
  const runtime = await updateSettings(req.validated.body);
  res.json({ data: { runtime, environment: publicEnvironment() } });
}

export function verifyAdmin(_req, res) {
  res.json({ data: { valid: true } });
}
