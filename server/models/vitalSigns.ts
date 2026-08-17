import { Schema } from 'mongoose';

/**
 * One set of bedside measurements.
 *
 * Extracted from the consultation because it is not a doctor's concept: the
 * same eight numbers are what a nurse writes on a ward round, and defining
 * them twice would let the two drift into disagreeing about what counts as a
 * valid reading for the same patient on the same day.
 *
 * Every field is optional — a nurse who takes a temperature and nothing else
 * has still taken an observation.
 */
export interface IVitalSigns {
  temperature?: number;
  heartRate?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
}

const positiveNumber = (label: string) => ({
  type: Number,
  min: [0, `${label} cannot be negative`],
});

export const vitalSignsSchema = new Schema<IVitalSigns>(
  {
    temperature: positiveNumber('Temperature'),
    heartRate: positiveNumber('Heart rate'),
    bloodPressureSystolic: positiveNumber('Systolic blood pressure'),
    bloodPressureDiastolic: positiveNumber('Diastolic blood pressure'),
    respiratoryRate: positiveNumber('Respiratory rate'),
    oxygenSaturation: {
      type: Number,
      min: [0, 'Oxygen saturation must be between 0 and 100'],
      max: [100, 'Oxygen saturation must be between 0 and 100'],
    },
    weight: positiveNumber('Weight'),
    height: positiveNumber('Height'),
  },
  { _id: false }
);

/** True when nothing at all was measured — an observation with no content. */
export const isEmptyVitals = (vitals: IVitalSigns | undefined): boolean =>
  !vitals || Object.values(vitals).every((value) => value === undefined || value === null);
