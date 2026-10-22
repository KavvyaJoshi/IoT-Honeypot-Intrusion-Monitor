import mongoose from 'mongoose';
import { RULE_ACTIONS, SEVERITIES } from '../detection/constants.js';

/**
 * Persisted, admin-editable configuration of a detection rule. The rule's logic lives in
 * src/detection/rules; this document only stores enabled state, severity, action and params.
 */
const ruleSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true, unique: true, maxlength: 64 },
    enabled: { type: Boolean, required: true, default: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    action: { type: String, enum: RULE_ACTIONS, required: true },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false },
);

export const Rule = mongoose.model('Rule', ruleSchema);
