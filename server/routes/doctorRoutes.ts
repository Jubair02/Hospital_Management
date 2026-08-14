import { Router } from 'express';
import {
  getDoctors,
  getSpecializations,
  getMyDoctorProfile,
  createDoctor,
  getDoctorById,
  updateDoctor,
  updateDoctorStatus,
  getAvailability,
  putAvailability,
} from '../controllers/doctorController.js';
import { getDoctorConsultations } from '../controllers/consultationController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateCreateDoctor,
  validateUpdateDoctor,
  validateDoctorStatus,
  validateAvailability,
} from '../middleware/validatePhase3.js';

const router = Router();

router.use(authenticate);

const ALL_ROLES = ['admin', 'doctor', 'receptionist', 'nurse'] as const;

// Viewing the doctor directory is open to all staff; management is admin only.
router
  .route('/')
  .get(authorize(...ALL_ROLES), getDoctors)
  .post(authorize('admin'), validateCreateDoctor, createDoctor);

// Static paths must be registered before /:id.
router.get('/specializations', authorize(...ALL_ROLES), getSpecializations);
router.get('/me', authorize('doctor'), getMyDoctorProfile);

router
  .route('/:id')
  .get(authorize(...ALL_ROLES), getDoctorById)
  .patch(authorize('admin'), validateUpdateDoctor, updateDoctor);

router.patch('/:id/status', authorize('admin'), validateDoctorStatus, updateDoctorStatus);

// Availability: everyone may view; PUT is admin or the owning doctor
// (ownership is verified inside the controller).
router
  .route('/:id/availability')
  .get(authorize(...ALL_ROLES), getAvailability)
  .put(authorize('admin', 'doctor'), validateAvailability, putAvailability);

// A doctor's consultations — admin any doctor, a doctor only their own
// (ownership is verified inside the controller).
router.get('/:doctorId/consultations', authorize('admin', 'doctor'), getDoctorConsultations);

export default router;
