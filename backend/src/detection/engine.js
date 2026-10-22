import {
  RULE_ACTION_RANK,
  SEVERITY_RANK,
  classificationForSeverity,
  escalateSeverity,
  maxSeverity,
} from './constants.js';
import { ruleDefinitions } from './rules/index.js';
import { detectionState, sourceKeyFor } from './state.js';

function describeEnforcement(entry, now) {
  const remaining = Math.max(1, Math.ceil((entry.until - now) / 1000));
  const verb = entry.action === 'block' ? 'block' : 'rate-limit';
  return (
    `Source is under an active ${verb} decision from rule "${entry.ruleId}" ` +
    `(${remaining}s remaining). This request is recorded as ${verb === 'block' ? 'blocked' : 'rate-limited'}.`
  );
}

/**
 * Applies all enabled rules to a normalized event and returns an explainable verdict.
 *
 * @param {object} input
 * @param {object} input.event     normalized event record (see services/normalize.js)
 * @param {object} input.analysis  raw values used only for detection (never persisted as-is)
 * @param {object} options
 * @param {Map<string, {enabled, severity, action, params}>} options.ruleConfigs
 * @param {{enforcementDurationSeconds:number, testLoginPaths:string[]}} options.settings
 * @param {number} [options.now]
 * @param {{counters, enforcement}} [options.state]
 */
export function evaluateEvent({ event, analysis }, { ruleConfigs, settings, now = Date.now(), state = detectionState }) {
  const sourceKey = sourceKeyFor(event);
  const ctx = { event, analysis, settings, now, sourceKey, counters: state.counters };

  const detections = [];
  for (const definition of ruleDefinitions) {
    const ruleConfig = ruleConfigs.get(definition.id);
    if (!ruleConfig?.enabled) continue;
    const match = definition.evaluate(ctx, ruleConfig.params);
    if (!match) continue;
    detections.push({
      ruleId: definition.id,
      ruleName: definition.name,
      category: definition.category,
      severity: ruleConfig.severity,
      reason: match.reason,
      evidence: match.evidence,
      recommendedAction: ruleConfig.action,
    });
  }

  // Enforcement: the strongest non-"log" action among this event's matches starts or extends
  // a time-limited decision for the source. Existing decisions keep applying until they expire.
  const previousEnforcement = state.enforcement.get(sourceKey, now);
  const enforcing = detections
    .filter((d) => d.recommendedAction !== 'log')
    .sort((a, b) => RULE_ACTION_RANK[b.recommendedAction] - RULE_ACTION_RANK[a.recommendedAction])[0];

  let enforcement = previousEnforcement;
  if (enforcing) {
    enforcement = state.enforcement.apply(
      sourceKey,
      {
        action: enforcing.recommendedAction,
        ruleId: enforcing.ruleId,
        reason: enforcing.reason,
        until: now + settings.enforcementDurationSeconds * 1000,
        sourceType: event.sourceType,
        deviceId: event.deviceId,
        sourceIdentifier: event.sourceIdentifier,
        simulated: event.simulated,
      },
      now,
    );
  } else if (previousEnforcement) {
    detections.push({
      ruleId: 'active-enforcement',
      ruleName: 'Active enforcement decision',
      category: 'active-enforcement',
      severity: 'low',
      reason: describeEnforcement(previousEnforcement, now),
      evidence: {
        triggeredBy: previousEnforcement.ruleId,
        expiresAt: new Date(previousEnforcement.until).toISOString(),
      },
      recommendedAction: previousEnforcement.action,
    });
  }

  const reasons = detections.map((d) => d.reason);
  let severity = maxSeverity(detections.map((d) => d.severity));
  const distinctRules = new Set(detections.filter((d) => d.ruleId !== 'active-enforcement').map((d) => d.ruleId));
  if (distinctRules.size >= 2) {
    const escalated = escalateSeverity(severity);
    if (escalated !== severity) {
      reasons.push(`Severity escalated from ${severity} to ${escalated} because ${distinctRules.size} rules matched the same request.`);
      severity = escalated;
    }
  }

  const primary = [...detections].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];

  let actionTaken = 'allowed';
  if (enforcement) actionTaken = enforcement.action === 'block' ? 'blocked' : 'rate-limited';
  else if (detections.length > 0) actionTaken = 'logged';

  return {
    category: primary?.category ?? 'normal',
    severity,
    severityRank: SEVERITY_RANK[severity],
    classification: classificationForSeverity(severity),
    detections,
    detectionReasons: reasons,
    actionTaken,
    enforcement: enforcement
      ? { action: enforcement.action, ruleId: enforcement.ruleId, until: new Date(enforcement.until) }
      : null,
  };
}
