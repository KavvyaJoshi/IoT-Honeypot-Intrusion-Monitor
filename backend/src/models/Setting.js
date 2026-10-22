import mongoose from 'mongoose';

/** Singleton document (key = "global") holding runtime-editable settings. */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    values: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);

export const Setting = mongoose.model('Setting', settingSchema);
