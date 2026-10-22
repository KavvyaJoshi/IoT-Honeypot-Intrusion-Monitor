import failedLogin from './failedLogin.js';
import malformedRequest from './malformedRequest.js';
import notFoundRepeat from './notFoundRepeat.js';
import requestRate from './requestRate.js';
import suspiciousPath from './suspiciousPath.js';
import trafficAnomaly from './trafficAnomaly.js';

/**
 * Registry of rule definitions, evaluated in this order. To add a rule, create a module that
 * exports { id, name, description, category, defaultSeverity, defaultAction, defaultParams,
 * paramFields, paramsSchema, evaluate(ctx, params) } and append it here.
 */
export const ruleDefinitions = [
  requestRate,
  failedLogin,
  suspiciousPath,
  malformedRequest,
  notFoundRepeat,
  trafficAnomaly,
];

export const ruleDefinitionsById = new Map(ruleDefinitions.map((rule) => [rule.id, rule]));
