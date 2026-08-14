import Patient from '../models/Patient.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Resolves the Patient record that belongs to the authenticated portal
 * user and attaches it as req.patient. Must run after
 * authenticate + authorize('patient').
 *
 * This is the ownership anchor for the whole portal API: every portal
 * query filters on req.patient._id, which is derived from the JWT's
 * user — never from an id the client supplies. A patient-role account
 * with no linked record (or an inactive record) gets nothing.
 */
export const loadPatientProfile = asyncHandler(async (req, _res, next) => {
  const patient = await Patient.findOne({ userId: req.user!._id });

  if (!patient) {
    throw new ApiError(403, 'No patient profile is linked to this account.');
  }
  if (patient.status !== 'active') {
    throw new ApiError(403, 'This patient profile is inactive. Contact the hospital.');
  }

  req.patient = patient;
  next();
});
