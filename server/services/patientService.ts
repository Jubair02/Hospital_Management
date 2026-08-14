import Patient from '../models/Patient.js';
import { nextSequenceId } from './sequenceService.js';

/** Next human-readable patient ID (PAT-000001, PAT-000002, …). */
export const nextPatientId = (): Promise<string> => nextSequenceId('patientId', 'PAT', 6);

export interface PatientStats {
  totalPatients: number;
  activePatients: number;
  inactivePatients: number;
  newPatientsThisMonth: number;
}

/** Dashboard statistics, computed from the database. */
export const getPatientStats = async (): Promise<PatientStats> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalPatients, activePatients, newPatientsThisMonth] = await Promise.all([
    Patient.countDocuments({}),
    Patient.countDocuments({ status: 'active' }),
    Patient.countDocuments({ createdAt: { $gte: startOfMonth } }),
  ]);

  return {
    totalPatients,
    activePatients,
    inactivePatients: totalPatients - activePatients,
    newPatientsThisMonth,
  };
};
