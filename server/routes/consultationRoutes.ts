import { Router } from 'express';
import {
  createConsultation,
  getConsultations,
  getStats,
  getConsultationById,
  updateConsultation,
  updateConsultationStatus,
} from '../controllers/consultationController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateStartConsultation,
  validateUpdateConsultation,
  validateConsultationStatus,
} from '../middleware/validateConsultation.js';

const router = Router();

router.use(authenticate);

// Clinical records are sensitive. Role matrix (visibility is further
// narrowed inside the controller):
//   author (create/edit/complete) — doctor only, own appointments only
//   read — admin (all), doctor (own + completed), nurse (completed only)
//   receptionist — NO clinical access
router
  .route('/')
  .get(authorize('admin', 'doctor', 'nurse'), getConsultations)
  .post(authorize('doctor'), validateStartConsultation, createConsultation);

// Must be registered before /:id.
router.get('/stats', authorize('admin', 'doctor'), getStats);

router
  .route('/:id')
  .get(authorize('admin', 'doctor', 'nurse'), getConsultationById)
  .patch(authorize('doctor'), validateUpdateConsultation, updateConsultation);

router.patch(
  '/:id/status',
  authorize('doctor'),
  validateConsultationStatus,
  updateConsultationStatus
);

export default router;
