import type { Types } from 'mongoose';
import Admission, { ACTIVE_ADMISSION_STATUSES } from '../models/Admission.js';
import Bed from '../models/Bed.js';
import type { UserDocument } from '../models/User.js';

/**
 * The wards a request should be limited to, or `null` for no limit.
 *
 * Only nurses are narrowed, and only once someone has assigned them wards.
 * An unassigned nurse keeps the hospital-wide view they have always had, so
 * turning this on cannot silently hide records from staff mid-shift — the
 * narrowing begins when an administrator chooses it.
 */
export const wardScopeFor = (user: UserDocument): Types.ObjectId[] | null => {
  if (user.role !== 'nurse') return null;
  const wards = user.assignedWards ?? [];
  return wards.length > 0 ? wards : null;
};

/**
 * The patients currently admitted to a set of wards.
 *
 * Nursing work is addressed to a patient but scoped by where that patient is
 * lying, and only an admission knows both. Returning ids keeps the callers
 * free to filter whatever collection they are already querying.
 */
export const patientIdsInWards = async (wardIds: Types.ObjectId[]): Promise<Types.ObjectId[]> => {
  const admissions = await Admission.find({
    wardId: { $in: wardIds },
    status: { $in: ACTIVE_ADMISSION_STATUSES },
  }).select('patientId');
  return admissions.map((admission) => admission.patientId);
};

/** The beds belonging to a set of wards. */
export const bedIdsInWards = async (wardIds: Types.ObjectId[]): Promise<Types.ObjectId[]> => {
  const beds = await Bed.find({ wardId: { $in: wardIds } }).select('_id');
  return beds.map((bed) => bed._id);
};

/**
 * Whether a nurse may act on a patient at all.
 *
 * Used by the write endpoints: reading a record you are not responsible for is
 * a privacy question the existing role checks already answer, but recording
 * observations or medications against one is a clinical safety question, and
 * the answer has to be "only where you are working".
 */
export const nurseMayActOnPatient = async (
  user: UserDocument,
  patientId: Types.ObjectId
): Promise<boolean> => {
  const wards = wardScopeFor(user);
  if (!wards) return true;

  const admitted = await Admission.exists({
    patientId,
    wardId: { $in: wards },
    status: { $in: ACTIVE_ADMISSION_STATUSES },
  });
  return Boolean(admitted);
};
