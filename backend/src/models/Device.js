import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, maxlength: 64 },
    name: { type: String, maxlength: 80, default: null },
    hardware: { type: String, maxlength: 64, default: 'ESP8266' },
    firmwareVersion: { type: String, maxlength: 32, default: null },
    ipAddress: { type: String, maxlength: 64, default: null },
    registeredAt: { type: Date, required: true, default: Date.now },
    lastHeartbeatAt: { type: Date, default: null },
    // Any authenticated contact: registration, heartbeat or event report.
    lastSeenAt: { type: Date, default: null },
    // Values below are only ever reported by the device itself; the backend cannot measure them.
    lastRssi: { type: Number, min: -127, max: 0, default: null },
    lastUptimeMs: { type: Number, min: 0, default: null },
    lastFreeHeap: { type: Number, min: 0, default: null },
    heartbeatCount: { type: Number, min: 0, default: 0 },
  },
  {
    timestamps: true,
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

export const Device = mongoose.model('Device', deviceSchema);
