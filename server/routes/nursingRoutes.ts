import { Router } from 'express';
import {
  createAdministration,
  getAdministrations,
  createNursingNote,
  getNursingNotes,
} from '../controllers/nursingController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateMedicationAdministration,
  validateNursingNote,
} from '../middleware/validateNursing.js';

const router = Router();

router.use(authenticate);

/**
 * The ward record. Nurses write it; doctors read and may write it too, since
 * they give doses and add to the running account of a stay as well.
 * Receptionists have no clinical access, as everywhere else.
 */
const CLINICAL = ['admin', 'doctor', 'nurse'] as const;

router
  .route('/administrations')
  .get(authorize(...CLINICAL), getAdministrations)
  .post(authorize(...CLINICAL), validateMedicationAdministration, createAdministration);

router
  .route('/notes')
  .get(authorize(...CLINICAL), getNursingNotes)
  .post(authorize(...CLINICAL), validateNursingNote, createNursingNote);

export default router;
