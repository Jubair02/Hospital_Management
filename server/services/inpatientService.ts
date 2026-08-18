import type { Types } from 'mongoose';
import Ward, { type WardDocument } from '../models/Ward.js';
import Bed, { type BedDocument } from '../models/Bed.js';
import Admission, {
  ACTIVE_ADMISSION_STATUSES,
  type AdmissionDocument,
  type AdmissionType,
} from '../models/Admission.js';
import BedTransfer, { type BedTransferDocument } from '../models/BedTransfer.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import ApiError from '../utils/ApiError.js';
import { nextSequenceId } from './sequenceService.js';
import { notifyDoctor, notifyPatient, notifyWardNurses } from './notificationService.js';

export const nextWardId = (): Promise<string> => nextSequenceId('wardId', 'WRD', 3);
export const nextBedId = (): Promise<string> => nextSequenceId('bedId', 'BED', 5);
export const nextAdmissionId = (): Promise<string> => nextSequenceId('admissionId', 'ADM', 6);
export const nextTransferId = (): Promise<string> => nextSequenceId('transferId', 'TRF', 6);

// ---------------------------------------------------------------------------
// Atomic bed operations — the concurrency core of this module.
// ---------------------------------------------------------------------------

/**
 * Claims a bed for a patient with a single guarded atomic update: the
 * write succeeds ONLY while the bed is still `available`, so two
 * concurrent assignments can never both occupy the same bed.
 */
const claimBed = async (
  bedId: Types.ObjectId,
  patientId: Types.ObjectId
): Promise<BedDocument | null> =>
  Bed.findOneAndUpdate(
    { _id: bedId, status: 'available' },
    { $set: { status: 'occupied', currentPatientId: patientId } },
    { new: true }
  );

/** Releases a bed, but only if it still holds THIS patient. */
const releaseBed = async (bedId: Types.ObjectId, patientId: Types.ObjectId): Promise<void> => {
  await Bed.updateOne(
    { _id: bedId, currentPatientId: patientId },
    { $set: { status: 'available', currentPatientId: null } }
  );
};

/** Validates that a bed is usable for assignment and inside an active ward. */
const assertBedAssignable = async (
  wardId: string,
  bedId: string
): Promise<{ ward: WardDocument; bed: BedDocument }> => {
  const ward = await Ward.findById(wardId);
  if (!ward) throw new ApiError(404, 'Ward not found');
  if (ward.status !== 'active') {
    throw new ApiError(400, 'Beds in an inactive ward cannot be assigned.');
  }

  const bed = await Bed.findById(bedId);
  if (!bed) throw new ApiError(404, 'Bed not found');
  if (!bed.wardId.equals(ward._id)) {
    throw new ApiError(400, 'The selected bed does not belong to the selected ward.');
  }
  if (bed.status !== 'available') {
    throw new ApiError(400, `This bed is ${bed.status} and cannot be assigned.`);
  }

  return { ward, bed };
};

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

export interface AdmitPatientInput {
  patientId: string;
  doctorId: string;
  wardId: string;
  bedId: string;
  appointmentId?: string;
  reason: string;
  admissionType: AdmissionType;
  expectedDischargeDate?: string;
  notes?: string;
}

/**
 * Admission workflow:
 *  1. Validate patient (active), doctor, ward (active), bed (available,
 *     belongs to ward).
 *  2. Atomically claim the bed (guarded update — concurrency-safe).
 *  3. Create the admission. The partial unique index on
 *     { patientId, isActive: true } makes a second active admission for
 *     the same patient impossible; on that conflict the bed claim is
 *     rolled back.
 */
export const admitPatient = async (
  input: AdmitPatientInput,
  actorId: Types.ObjectId
): Promise<AdmissionDocument> => {
  const patient = await Patient.findById(input.patientId);
  if (!patient) throw new ApiError(404, 'Patient not found');
  if (patient.status !== 'active') {
    throw new ApiError(400, 'Inactive patients cannot be admitted.');
  }

  const doctor = await Doctor.findById(input.doctorId);
  if (!doctor) throw new ApiError(404, 'Doctor not found');
  if (doctor.status !== 'active') {
    throw new ApiError(400, 'The attending doctor must be active.');
  }

  // Friendly pre-check; the partial unique index is the real guarantee.
  const existing = await Admission.findOne({ patientId: patient._id, isActive: true });
  if (existing) {
    throw new ApiError(409, `This patient is already admitted (${existing.admissionId}).`);
  }

  const { ward, bed } = await assertBedAssignable(input.wardId, input.bedId);

  const claimed = await claimBed(bed._id, patient._id);
  if (!claimed) {
    throw new ApiError(409, 'This bed was just taken. Pick another bed.');
  }

  try {
    const admission = await Admission.create({
      admissionId: await nextAdmissionId(),
      patientId: patient._id,
      doctorId: doctor._id,
      wardId: ward._id,
      bedId: bed._id,
      appointmentId: input.appointmentId,
      reason: input.reason,
      admissionType: input.admissionType,
      expectedDischargeDate: input.expectedDischargeDate
        ? new Date(`${input.expectedDischargeDate}T00:00:00.000Z`)
        : undefined,
      notes: input.notes,
      admittedBy: actorId,
    });

    // Secondary effect — never allowed to fail the admission.
    await notifyDoctor(doctor._id, {
      type: 'admission',
      title: 'Patient admitted',
      message: `${patient.firstName} ${patient.lastName} admitted to ${ward.name}, bed ${bed.bedNumber}.`,
      referenceType: 'admission',
      referenceId: admission._id,
      dedupeKey: `admission:created:${admission._id}`,
    });

    await notifyWardNurses(ward._id, {
      type: 'admission',
      title: 'Patient arriving on your ward',
      message: `${patient.firstName} ${patient.lastName} admitted to bed ${bed.bedNumber} (${admission.admissionId}).`,
      referenceType: 'admission',
      referenceId: admission._id,
      dedupeKey: `admission:created:nurses:${admission._id}`,
    });

    await notifyPatient(patient._id, {
      type: 'admission',
      title: 'Admission recorded',
      message: `You were admitted to ${ward.name}, bed ${bed.bedNumber} (${admission.admissionId}).`,
      referenceType: 'admission',
      referenceId: admission._id,
      dedupeKey: `admission:created:patient:${admission._id}`,
    });

    return admission;
  } catch (err) {
    // Roll the bed claim back — e.g. a concurrent admission won the
    // unique-index race for this patient.
    await releaseBed(bed._id, patient._id);
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(409, 'This patient already has an active admission.');
    }
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------

export interface TransferInput {
  admissionId: string;
  toWardId: string;
  toBedId: string;
  reason?: string;
}

/**
 * Transfer workflow (claim-new-first, fully compensated):
 *  1. Validate the admission is active and the target bed assignable.
 *  2. Atomically claim the NEW bed.
 *  3. Guarded admission update — succeeds only while the admission is
 *     still active AND still on the old bed, so concurrent transfers of
 *     the same admission cannot fork state. On failure the new claim is
 *     rolled back.
 *  4. Release the OLD bed and write the transfer record.
 *
 * The old bed is only released after the admission points at the new
 * bed, so a patient never ends up with zero beds; failures never leave
 * both beds occupied because compensation releases the new claim.
 */
export const transferPatient = async (
  input: TransferInput,
  actorId: Types.ObjectId
): Promise<BedTransferDocument> => {
  const admission = await Admission.findById(input.admissionId);
  if (!admission) throw new ApiError(404, 'Admission not found');
  if (!admission.isActive) {
    throw new ApiError(400, `A ${admission.status} admission cannot be transferred.`);
  }

  if (String(admission.bedId) === input.toBedId) {
    throw new ApiError(400, 'The patient already occupies this bed.');
  }

  const { ward: toWard, bed: toBed } = await assertBedAssignable(input.toWardId, input.toBedId);

  const fromWardId = admission.wardId;
  const fromBedId = admission.bedId;

  const claimed = await claimBed(toBed._id, admission.patientId);
  if (!claimed) {
    throw new ApiError(409, 'The target bed was just taken. Pick another bed.');
  }

  // Guarded move: only one concurrent transfer can pass this gate.
  const moved = await Admission.findOneAndUpdate(
    { _id: admission._id, isActive: true, bedId: fromBedId },
    { $set: { wardId: toWard._id, bedId: toBed._id, status: 'transferred' } },
    { new: true }
  );

  if (!moved) {
    await releaseBed(toBed._id, admission.patientId);
    throw new ApiError(409, 'The admission changed while transferring. Reload and try again.');
  }

  await releaseBed(fromBedId, admission.patientId);

  const transfer = await BedTransfer.create({
    transferId: await nextTransferId(),
    admissionId: admission._id,
    patientId: admission.patientId,
    fromWardId,
    fromBedId,
    toWardId: toWard._id,
    toBedId: toBed._id,
    reason: input.reason,
    transferredBy: actorId,
  });

  await notifyDoctor(admission.doctorId, {
    type: 'admission',
    title: 'Patient transferred',
    message: `${admission.admissionId} moved to ${toWard.name}, bed ${toBed.bedNumber}.`,
    referenceType: 'admission',
    referenceId: admission._id,
    dedupeKey: `admission:transfer:${transfer._id}`,
  });

  // Both ends of a move are staffed by different people: one ward is losing a
  // patient and another is receiving one.
  await notifyWardNurses(toWard._id, {
    type: 'admission',
    title: 'Patient arriving on your ward',
    message: `${admission.admissionId} transferred in to bed ${toBed.bedNumber}.`,
    referenceType: 'admission',
    referenceId: admission._id,
    dedupeKey: `admission:transfer:in:${transfer._id}`,
  });

  await notifyWardNurses(fromWardId, {
    type: 'admission',
    title: 'Patient left your ward',
    message: `${admission.admissionId} transferred to ${toWard.name}, bed ${toBed.bedNumber}.`,
    referenceType: 'admission',
    referenceId: admission._id,
    dedupeKey: `admission:transfer:out:${transfer._id}`,
  });

  return transfer;
};

// ---------------------------------------------------------------------------
// Discharge / cancel
// ---------------------------------------------------------------------------

/**
 * Ends an admission (discharge or cancellation): a guarded update flips
 * isActive exactly once, then the bed is released (only if it still
 * holds this patient). The admission remains a permanent record.
 */
export const endAdmission = async (
  admissionMongoId: string,
  outcome: 'discharged' | 'cancelled',
  notes: string | undefined
): Promise<AdmissionDocument> => {
  const ended = await Admission.findOneAndUpdate(
    { _id: admissionMongoId, isActive: true },
    {
      $set: {
        status: outcome,
        isActive: false,
        dischargeDate: new Date(),
        ...(notes ? { notes } : {}),
      },
    },
    { new: true }
  );

  if (!ended) {
    const existing = await Admission.findById(admissionMongoId);
    if (!existing) throw new ApiError(404, 'Admission not found');
    throw new ApiError(400, `This admission is already ${existing.status}.`);
  }

  await releaseBed(ended.bedId, ended.patientId);

  if (outcome === 'discharged') {
    await notifyDoctor(ended.doctorId, {
      type: 'discharge',
      title: 'Patient discharged',
      message: `${ended.admissionId} was discharged and the bed released.`,
      referenceType: 'admission',
      referenceId: ended._id,
      dedupeKey: `admission:discharged:${ended._id}`,
    });

    await notifyPatient(ended.patientId, {
      type: 'discharge',
      title: 'Discharge recorded',
      message: `Your admission ${ended.admissionId} was closed. Take care and follow your treatment plan.`,
      referenceType: 'admission',
      referenceId: ended._id,
      dedupeKey: `admission:discharged:patient:${ended._id}`,
    });
  }

  return ended;
};

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface InpatientStats {
  totalWards: number;
  totalBeds: number;
  availableBeds: number;
  occupiedBeds: number;
  reservedBeds: number;
  maintenanceBeds: number;
  currentInpatients: number;
  todaysAdmissions: number;
  todaysDischarges: number;
}

export const getInpatientStats = async (): Promise<InpatientStats> => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalWards,
    totalBeds,
    availableBeds,
    occupiedBeds,
    reservedBeds,
    maintenanceBeds,
    currentInpatients,
    todaysAdmissions,
    todaysDischarges,
  ] = await Promise.all([
    Ward.countDocuments({}),
    Bed.countDocuments({}),
    Bed.countDocuments({ status: 'available' }),
    Bed.countDocuments({ status: 'occupied' }),
    Bed.countDocuments({ status: 'reserved' }),
    Bed.countDocuments({ status: 'maintenance' }),
    Admission.countDocuments({ status: { $in: ACTIVE_ADMISSION_STATUSES } }),
    Admission.countDocuments({ admissionDate: { $gte: startOfDay } }),
    Admission.countDocuments({ status: 'discharged', dischargeDate: { $gte: startOfDay } }),
  ]);

  return {
    totalWards,
    totalBeds,
    availableBeds,
    occupiedBeds,
    reservedBeds,
    maintenanceBeds,
    currentInpatients,
    todaysAdmissions,
    todaysDischarges,
  };
};
