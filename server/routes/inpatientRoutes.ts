import { Router } from 'express';
import {
  getWards,
  createWard,
  getWardById,
  updateWard,
  updateWardStatus,
  getBeds,
  createBed,
  updateBed,
  updateBedStatus,
  postAdmission,
  getAdmissions,
  getAdmissionById,
  postTransfer,
  getTransfers,
  postDischarge,
  getStats,
} from '../controllers/inpatientController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateWard,
  validateWardStatus,
  validateBed,
  validateBedStatus,
  validateAdmission,
  validateTransfer,
  validateDischarge,
} from '../middleware/validateInpatient.js';

const router = Router();

router.use(authenticate);

// Role matrix:
//   ward/bed management — admin
//   admissions / transfers / discharges — admin + receptionist
//   admission cancellation — admin (checked in controller)
//   viewing — admin, receptionist, nurse (all); doctor (own patients only)
//   pharmacist / lab technician — no inpatient access

const OPERATORS = ['admin', 'receptionist'] as const;
const READERS = ['admin', 'receptionist', 'doctor', 'nurse'] as const;
/**
 * Whether a bed is occupied, free, or needs cleaning is observed on the ward,
 * and nurses are the staff standing there when it changes. Admitting and
 * discharging stay with OPERATORS — those are administrative decisions about
 * a stay, not a report of the state of a bed.
 */
const BED_STATUS_ROLES = ['admin', 'receptionist', 'nurse'] as const;

// --- Wards ---
router
  .route('/wards')
  .get(authorize(...READERS), getWards)
  .post(authorize('admin'), validateWard(false), createWard);
router
  .route('/wards/:id')
  .get(authorize(...READERS), getWardById)
  .patch(authorize('admin'), validateWard(true), updateWard);
router.patch('/wards/:id/status', authorize('admin'), validateWardStatus, updateWardStatus);

// --- Beds ---
router
  .route('/beds')
  .get(authorize(...READERS), getBeds)
  .post(authorize('admin'), validateBed(false), createBed);
router.patch('/beds/:id', authorize('admin'), validateBed(true), updateBed);
router.patch(
  '/beds/:id/status',
  authorize(...BED_STATUS_ROLES),
  validateBedStatus,
  updateBedStatus
);

// --- Admissions ---
router
  .route('/admissions')
  .get(authorize(...READERS), getAdmissions)
  .post(authorize(...OPERATORS), validateAdmission, postAdmission);
router.get('/admissions/:id', authorize(...READERS), getAdmissionById);

// --- Transfers ---
router
  .route('/transfers')
  .get(authorize(...READERS), getTransfers)
  .post(authorize(...OPERATORS), validateTransfer, postTransfer);

// --- Discharge (and admin-only cancellation via outcome) ---
router.post('/discharges', authorize(...OPERATORS), validateDischarge, postDischarge);

// --- Stats ---
router.get('/stats', authorize('admin', 'receptionist', 'nurse'), getStats);

export default router;
