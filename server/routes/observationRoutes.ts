import { Router } from 'express';
import {
  createObservation,
  getObservations,
} from '../controllers/observationController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateObservation } from '../middleware/validateNursing.js';

const router = Router();

router.use(authenticate);

// Recording is the point of this collection: nurses take observations, and
// doctors take them too during a visit. Receptionists have no clinical access,
// which is the rule everywhere else in the app.
router
  .route('/')
  .get(authorize('admin', 'doctor', 'nurse'), getObservations)
  .post(authorize('admin', 'doctor', 'nurse'), validateObservation, createObservation);

export default router;
