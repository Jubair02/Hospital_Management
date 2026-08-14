import SystemSetting, {
  SETTINGS_ID,
  type SystemSettingDocument,
} from '../models/SystemSetting.js';

/** Editable setting fields (everything else on the document is metadata). */
export const EDITABLE_SETTINGS = [
  'hospitalName',
  'contactPhone',
  'contactEmail',
  'address',
  'timezone',
  'currency',
  'appointmentSlotMinutes',
  'notifyLowStock',
] as const;

export type EditableSetting = (typeof EDITABLE_SETTINGS)[number];

/**
 * Returns the settings document, creating it with defaults on first use
 * so the API always has a concrete value to serve.
 */
export const getSettings = async (): Promise<SystemSettingDocument> => {
  const existing = await SystemSetting.findById(SETTINGS_ID);
  if (existing) return existing;

  try {
    return await SystemSetting.create({ _id: SETTINGS_ID });
  } catch (err) {
    // A concurrent first request won the race — use its document.
    if ((err as { code?: number }).code === 11000) {
      const created = await SystemSetting.findById(SETTINGS_ID);
      if (created) return created;
    }
    throw err;
  }
};

export const updateSettings = async (
  updates: Partial<Record<EditableSetting, unknown>>
): Promise<SystemSettingDocument> => {
  const settings = await getSettings();

  for (const field of EDITABLE_SETTINGS) {
    if (updates[field] !== undefined) {
      settings.set(field, updates[field]);
    }
  }

  await settings.save();
  return settings;
};

/** Convenience reader used by services that need one value. */
export const getSetting = async <K extends EditableSetting>(
  key: K
): Promise<SystemSettingDocument[K]> => {
  const settings = await getSettings();
  return settings[key];
};
