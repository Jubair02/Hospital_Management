import { Router } from 'express';
import {
  createPatient,
  getPatients,
  getStats,
  getPatientById,
  updatePatient,
  updatePatientStatus,
  createPortalAccount,
} from '../controllers/patientController.js';
import { getPatientConsultations } from '../controllers/consultationController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateCreatePatient,
  validateUpdatePatient,
  validatePatientStatus,
  validatePortalAccount,
} from '../middleware/validatePatient.js';

const router = Router();

// Every patient route requires a logged-in staff member.
router.use(authenticate);

// Role matrix (enforced here, mirrored in the UI):
//   view/search/filter — all staff roles
//   create/edit        — admin + receptionist
//   stats              — admin + receptionist
//   activate/deactivate — admin only
router
  .route('/')
  .get(authorize('admin', 'doctor', 'receptionist', 'nurse'), getPatients)
  .post(authorize('admin', 'receptionist'), validateCreatePatient, createPatient);

// Must be registered before /:id so "stats" is not parsed as an ObjectId.
router.get('/stats', authorize('admin', 'receptionist'), getStats);

router
  .route('/:id')
  .get(authorize('admin', 'doctor', 'receptionist', 'nurse'), getPatientById)
  .patch(authorize('admin', 'receptionist'), validateUpdatePatient, updatePatient);

router.patch('/:id/status', authorize('admin'), validatePatientStatus, updatePatientStatus);

// Portal login issuance — the only way a `patient`-role User is created.
router.post(
  '/:id/portal-account',
  authorize('admin', 'receptionist'),
  validatePortalAccount,
  createPortalAccount
);

// Clinical history — receptionists have no clinical access.
router.get(
  '/:patientId/consultations',
  authorize('admin', 'doctor', 'nurse'),
  getPatientConsultations
);

export default router;
