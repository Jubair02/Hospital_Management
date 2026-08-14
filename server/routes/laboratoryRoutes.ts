import { Router } from 'express';
import {
  getLabCategories,
  createLabCategory,
  updateLabCategory,
  updateLabCategoryStatus,
  getLabTests,
  createLabTest,
  updateLabTest,
  updateLabTestStatus,
  postLabOrder,
  getLabOrders,
  getLabOrderById,
  patchLabOrderStatus,
  getLabSamples,
  patchCollectSample,
  patchRejectSample,
  getLabResults,
  patchEnterResult,
  patchVerifyResult,
  getStats,
} from '../controllers/laboratoryController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateLabCategory,
  validateLabCategoryStatus,
  validateLabTest,
  validateLabTestStatus,
  validateCreateLabOrder,
  validateCancelOrder,
  validateCollectSample,
  validateRejectSample,
  validateEnterResult,
} from '../middleware/validateLaboratory.js';

const router = Router();

router.use(authenticate);

// Role matrix (mirrors the clinical-access rules established in Phase 4):
//   catalog manage — admin; catalog view — admin, lab tech, doctor
//   order create — doctor (own consultations only, checked in service)
//   order view — admin + lab tech (all); doctor (own + completed); nurse (completed)
//   samples & results workflow — admin + lab tech
//   receptionist / pharmacist — no laboratory access (lab data is clinical)

// --- Categories ---
router
  .route('/categories')
  .get(authorize('admin', 'lab_technician', 'doctor'), getLabCategories)
  .post(authorize('admin'), validateLabCategory(false), createLabCategory);
router.patch('/categories/:id', authorize('admin'), validateLabCategory(true), updateLabCategory);
router.patch(
  '/categories/:id/status',
  authorize('admin'),
  validateLabCategoryStatus,
  updateLabCategoryStatus
);

// --- Tests ---
router
  .route('/tests')
  .get(authorize('admin', 'lab_technician', 'doctor'), getLabTests)
  .post(authorize('admin'), validateLabTest(false), createLabTest);
router.patch('/tests/:id', authorize('admin'), validateLabTest(true), updateLabTest);
router.patch('/tests/:id/status', authorize('admin'), validateLabTestStatus, updateLabTestStatus);

// --- Orders ---
router
  .route('/orders')
  .get(authorize('admin', 'lab_technician', 'doctor', 'nurse'), getLabOrders)
  .post(authorize('doctor'), validateCreateLabOrder, postLabOrder);
router.get(
  '/orders/:id',
  authorize('admin', 'lab_technician', 'doctor', 'nurse'),
  getLabOrderById
);
router.patch(
  '/orders/:id/status',
  authorize('admin', 'lab_technician'),
  validateCancelOrder,
  patchLabOrderStatus
);

// --- Samples ---
router.get('/samples', authorize('admin', 'lab_technician'), getLabSamples);
router.patch(
  '/samples/:id/collect',
  authorize('admin', 'lab_technician'),
  validateCollectSample,
  patchCollectSample
);
router.patch(
  '/samples/:id/reject',
  authorize('admin', 'lab_technician'),
  validateRejectSample,
  patchRejectSample
);

// --- Results ---
router.get(
  '/results',
  authorize('admin', 'lab_technician', 'doctor', 'nurse'),
  getLabResults
);
router.patch(
  '/results/:id',
  authorize('admin', 'lab_technician'),
  validateEnterResult,
  patchEnterResult
);
router.patch('/results/:id/verify', authorize('admin', 'lab_technician'), patchVerifyResult);

// --- Stats ---
router.get('/stats', authorize('admin', 'lab_technician'), getStats);

export default router;
