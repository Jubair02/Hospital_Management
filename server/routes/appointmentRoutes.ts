import { Router } from 'express';
import {
  createAppointment,
  getAppointments,
  getStats,
  getAppointmentById,
  updateAppointment,
  updateAppointmentStatus,
} from '../controllers/appointmentController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateCreateAppointment,
  validateUpdateAppointment,
  validateAppointmentStatus,
} from '../middleware/validatePhase3.js';

const router = Router();

router.use(authenticate);

// Role matrix (enforced here + in the controller for doctor scoping):
//   list/detail — admin, receptionist, nurse (all records); doctor (own only)
//   create/edit — admin + receptionist
//   status      — admin + receptionist (all transitions); doctor (own:
//                 confirm/complete/no-show, checked in controller)
//   stats       — admin, receptionist, doctor (own scope)
router
  .route('/')
  .get(authorize('admin', 'doctor', 'receptionist', 'nurse'), getAppointments)
  .post(authorize('admin', 'receptionist'), validateCreateAppointment, createAppointment);

// Must be registered before /:id.
router.get('/stats', authorize('admin', 'receptionist', 'doctor'), getStats);

router
  .route('/:id')
  .get(authorize('admin', 'doctor', 'receptionist', 'nurse'), getAppointmentById)
  .patch(authorize('admin', 'receptionist'), validateUpdateAppointment, updateAppointment);

router.patch(
  '/:id/status',
  authorize('admin', 'receptionist', 'doctor'),
  validateAppointmentStatus,
  updateAppointmentStatus
);

export default router;
