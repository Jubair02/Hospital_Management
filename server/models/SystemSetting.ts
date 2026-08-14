import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

/**
 * Single settings document (`_id: 'system'`). Only values the running
 * application actually consumes are stored here — no speculative
 * configuration framework.
 */
export interface ISystemSetting {
  _id: string;
  hospitalName: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  timezone: string;
  currency: string;
  /** Length of a bookable appointment slot, used by the booking flow. */
  appointmentSlotMinutes: number;
  /** Gates the pharmacy low-stock notifications. */
  notifyLowStock: boolean;
  updatedAt: Date;
  createdAt: Date;
}

export type SystemSettingDocument = HydratedDocument<ISystemSetting>;

export const SETTINGS_ID = 'system';

export const SETTINGS_DEFAULTS = {
  hospitalName: 'Tulip General Hospital',
  timezone: 'UTC',
  currency: 'USD',
  appointmentSlotMinutes: 30,
  notifyLowStock: true,
};

const systemSettingSchema = new Schema<ISystemSetting>(
  {
    _id: { type: String, default: SETTINGS_ID },
    hospitalName: {
      type: String,
      required: true,
      trim: true,
      default: SETTINGS_DEFAULTS.hospitalName,
      maxlength: [150, 'Hospital name cannot exceed 150 characters'],
    },
    contactPhone: { type: String, trim: true, maxlength: 30 },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 150,
      match: [/^$|^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    address: { type: String, trim: true, maxlength: 300 },
    timezone: { type: String, trim: true, default: SETTINGS_DEFAULTS.timezone, maxlength: 60 },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: SETTINGS_DEFAULTS.currency,
      maxlength: [8, 'Currency code cannot exceed 8 characters'],
    },
    appointmentSlotMinutes: {
      type: Number,
      default: SETTINGS_DEFAULTS.appointmentSlotMinutes,
      min: [5, 'Slot length must be at least 5 minutes'],
      max: [240, 'Slot length cannot exceed 240 minutes'],
    },
    notifyLowStock: { type: Boolean, default: SETTINGS_DEFAULTS.notifyLowStock },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

const SystemSetting: Model<ISystemSetting> = mongoose.model<ISystemSetting>(
  'SystemSetting',
  systemSettingSchema
);

export default SystemSetting;
