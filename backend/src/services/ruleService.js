import { z } from 'zod';
import { RULE_ACTIONS, SEVERITIES } from '../detection/constants.js';
import { ruleDefinitions, ruleDefinitionsById } from '../detection/rules/index.js';
import { Rule } from '../models/Rule.js';
import { broadcast, SOCKET_EVENTS } from '../sockets/realtime.js';
import { badRequest, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const rulePatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    severity: z.enum(SEVERITIES).optional(),
    action: z.enum(RULE_ACTIONS).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'provide at least one field to update');

function defaultConfig(definition) {
  return {
    enabled: true,
    severity: definition.defaultSeverity,
    action: definition.defaultAction,
    params: structuredClone(definition.defaultParams),
    updatedAt: null,
  };
}

/** In-memory copy used by the detection engine on every event; falls back to defaults without a DB. */
let configs = new Map(ruleDefinitions.map((definition) => [definition.id, defaultConfig(definition)]));

export function getRuleConfigs() {
  return configs;
}

export function resetRuleCache() {
  configs = new Map(ruleDefinitions.map((definition) => [definition.id, defaultConfig(definition)]));
}

function toConfig(definition, doc) {
  const fallback = defaultConfig(definition);
  const params = definition.paramsSchema.safeParse({ ...fallback.params, ...(doc.params ?? {}) });
  if (!params.success) logger.warn(`Stored params for rule "${definition.id}" are invalid; using defaults`);
  return {
    enabled: doc.enabled ?? fallback.enabled,
    severity: SEVERITIES.includes(doc.severity) ? doc.severity : fallback.severity,
    action: RULE_ACTIONS.includes(doc.action) ? doc.action : fallback.action,
    params: params.success ? params.data : fallback.params,
    updatedAt: doc.updatedAt ?? null,
  };
}

/** Seeds missing rules with defaults and loads all persisted rule configuration into memory. */
export async function loadRules() {
  await Promise.all(
    ruleDefinitions.map((definition) => {
      const { updatedAt: _ignored, ...seed } = defaultConfig(definition);
      return Rule.updateOne(
        { ruleId: definition.id },
        { $setOnInsert: { ruleId: definition.id, ...seed } },
        { upsert: true },
      );
    }),
  );
  const docs = await Rule.find({ ruleId: { $in: ruleDefinitions.map((d) => d.id) } }).lean();
  const byId = new Map(docs.map((doc) => [doc.ruleId, doc]));
  configs = new Map(
    ruleDefinitions.map((definition) => [definition.id, toConfig(definition, byId.get(definition.id) ?? {})]),
  );
  return configs;
}

export function describeRule(definition, ruleConfig = configs.get(definition.id)) {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    enabled: ruleConfig.enabled,
    severity: ruleConfig.severity,
    action: ruleConfig.action,
    params: ruleConfig.params,
    defaults: {
      severity: definition.defaultSeverity,
      action: definition.defaultAction,
      params: definition.defaultParams,
    },
    paramFields: definition.paramFields,
    updatedAt: ruleConfig.updatedAt,
  };
}

export function listRules() {
  return ruleDefinitions.map((definition) => describeRule(definition));
}

export async function updateRule(ruleId, patch) {
  const definition = ruleDefinitionsById.get(ruleId);
  if (!definition) throw notFound(`Unknown rule "${ruleId}"`);
  const current = configs.get(ruleId);

  let params = current.params;
  if (patch.params) {
    const unknownKeys = Object.keys(patch.params).filter((key) => !(key in definition.defaultParams));
    if (unknownKeys.length) throw badRequest(`Unknown parameter(s) for rule "${ruleId}": ${unknownKeys.join(', ')}`);
    const parsed = definition.paramsSchema.safeParse({ ...current.params, ...patch.params });
    if (!parsed.success) throw badRequest(`Invalid parameters for rule "${ruleId}"`, parsed.error.issues);
    params = parsed.data;
  }

  const next = {
    enabled: patch.enabled ?? current.enabled,
    severity: patch.severity ?? current.severity,
    action: patch.action ?? current.action,
    params,
  };
  const saved = await Rule.findOneAndUpdate(
    { ruleId },
    { $set: next },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  configs.set(ruleId, { ...next, updatedAt: saved.updatedAt });

  const described = describeRule(definition);
  broadcast(SOCKET_EVENTS.RULES_UPDATED, described);
  return described;
}
