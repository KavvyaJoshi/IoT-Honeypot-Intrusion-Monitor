import mongoose from 'mongoose';
import {
  ACTIONS,
  CATEGORIES,
  CLASSIFICATIONS,
  RULE_ACTIONS,
  SEVERITIES,
  SOURCE_TYPES,
} from '../detection/constants.js';

const detectionSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true, maxlength: 64 },
    ruleName: { type: String, maxlength: 128 },
    category: { type: String, enum: CATEGORIES, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    reason: { type: String, required: true, maxlength: 1000 },
    evidence: { type: mongoose.Schema.Types.Mixed },
    recommendedAction: { type: String, enum: RULE_ACTIONS, required: true },
  },
  { _id: false },
);

const eventSchema = new mongoose.Schema(
  {
    // Server receive time. Device clocks are not trusted as the primary timestamp.
    timestamp: { type: Date, required: true, default: Date.now },
    sourceType: { type: String, enum: SOURCE_TYPES, required: true },
    simulated: { type: Boolean, required: true, default: false },
    deviceId: { type: String, maxlength: 64, default: null },
    sourceIdentifier: { type: String, required: true, maxlength: 128 },
    clientIp: { type: String, maxlength: 64, default: null },
    method: { type: String, required: true, maxlength: 16 },
    path: { type: String, required: true, maxlength: 600 },
    query: { type: String, maxlength: 600, default: null },
    responseStatus: { type: Number, min: 100, max: 599, default: null },
    userAgent: { type: String, maxlength: 300, default: null },
    loginResult: { type: String, enum: ['success', 'failed', null], default: null },

    // Computed by the detection engine only; never accepted from clients.
    category: { type: String, enum: CATEGORIES, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    severityRank: { type: Number, min: 0, max: 4, required: true },
    classification: { type: String, enum: CLASSIFICATIONS, required: true },
    detections: { type: [detectionSchema], default: [] },
    detectionReasons: { type: [String], default: [] },
    actionTaken: { type: String, enum: ACTIONS, required: true },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    correlationId: { type: String, maxlength: 64 },
  },
  {
    timestamps: { createdAt: 'receivedAt', updatedAt: false },
    minimize: false,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  },
);

// Indexes match the dashboard's query patterns (newest-first lists filtered by one field).
eventSchema.index({ timestamp: -1 });
eventSchema.index({ sourceType: 1, timestamp: -1 });
eventSchema.index({ severityRank: -1, timestamp: -1 });
eventSchema.index({ category: 1, timestamp: -1 });
eventSchema.index({ deviceId: 1, timestamp: -1 });
eventSchema.index({ simulated: 1, timestamp: -1 });
eventSchema.index(
  { correlationId: 1 },
  { unique: true, partialFilterExpression: { correlationId: { $type: 'string' } } },
);

export const Event = mongoose.model('Event', eventSchema);
