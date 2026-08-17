/**
 * What counts as a valid set of measurements.
 *
 * Shared by the consultation and observation validators. The same eight
 * numbers are accepted from a doctor mid-visit and a nurse on a ward round, so
 * a reading either side would reject must be a reading both reject — otherwise
 * the same patient's chart holds figures that only one half of the app
 * considers possible.
 */

const NUMERIC_FIELDS = [
  'temperature',
  'heartRate',
  'bloodPressureSystolic',
  'bloodPressureDiastolic',
  'respiratoryRate',
  'weight',
  'height',
] as const;

/** Optional non-negative finite number; the cap keeps typos out of the chart. */
const isVital = (value: unknown, max = 100_000): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;

const isSet = (value: unknown): boolean => value !== undefined && value !== null;

export const vitalsErrors = (value: unknown): string[] => {
  if (value === undefined) return [];
  if (typeof value !== 'object' || value === null) return ['vitalSigns must be an object.'];

  const vitals = value as Record<string, unknown>;
  const errors: string[] = [];

  for (const field of NUMERIC_FIELDS) {
    if (isSet(vitals[field]) && !isVital(vitals[field])) {
      errors.push(`${field} must be a non-negative number.`);
    }
  }

  if (isSet(vitals.oxygenSaturation) && !isVital(vitals.oxygenSaturation, 100)) {
    errors.push('oxygenSaturation must be between 0 and 100.');
  }

  return errors;
};
