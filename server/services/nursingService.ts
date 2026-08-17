import type { Types } from 'mongoose';
import Admission, {
  ACTIVE_ADMISSION_STATUSES,
  type AdmissionDocument,
} from '../models/Admission.js';
import Patient, { type PatientDocument } from '../models/Patient.js';
import type { UserDocument } from '../models/User.js';
import { nurseMayActOnPatient } from './nurseScope.js';
import ApiError from '../utils/ApiError.js';

/**
 * The checks every bedside write shares: the patient exists and is active, the
 * nurse is assigned where that patient is lying, and the stay they are lying
 * in is found rather than asked for.
 *
 * Resolving the admission here rather than accepting it from the client is
 * deliberate. Someone at a bedside knows the patient; making them also name
 * the admission invites filing a reading against a stay that ended last month,
 * and there is no reading a caller could give us that we cannot derive.
 */
export const resolveNursingTarget = async (
  actor: UserDocument,
  patientId: string | Types.ObjectId
): Promise<{ patient: PatientDocument; admission: AdmissionDocument | null }> => {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new ApiError(404, 'Patient not found');
  if (patient.status !== 'active') {
    throw new ApiError(400, 'This patient record is inactive.');
  }

  if (!(await nurseMayActOnPatient(actor, patient._id))) {
    throw new ApiError(403, 'This patient is not on a ward you are assigned to.');
  }

  const admission = await Admission.findOne({
    patientId: patient._id,
    status: { $in: ACTIVE_ADMISSION_STATUSES },
  }).sort({ admissionDate: -1 });

  return { patient, admission };
};
