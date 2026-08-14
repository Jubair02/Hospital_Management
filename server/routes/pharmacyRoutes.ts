import { Router } from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  getMedicines,
  createMedicine,
  getMedicineById,
  updateMedicine,
  updateMedicineStatus,
  getInventory,
  postStockIn,
  postAdjustment,
  getTransactions,
  getPharmacyPrescriptions,
  getPharmacyPrescriptionById,
  postDispense,
  getDispensings,
  getStats,
} from '../controllers/pharmacyController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateCategory,
  validateCategoryStatus,
  validateMedicine,
  validateMedicineStatus,
  validateStockIn,
  validateAdjustment,
  validateDispense,
} from '../middleware/validatePharmacy.js';

const router = Router();

router.use(authenticate);

// The whole pharmacy module is admin + pharmacist. Doctors author
// prescriptions through Phase 4; nurses keep their read-only access to
// completed consultations (which include prescriptions) via the Phase 4
// routes; receptionists have no clinical/pharmacy access.
router.use(authorize('admin', 'pharmacist'));

// --- Categories ---
router.route('/categories').get(getCategories).post(validateCategory(false), createCategory);
router.patch('/categories/:id', validateCategory(true), updateCategory);
router.patch('/categories/:id/status', validateCategoryStatus, updateCategoryStatus);

// --- Medicines ---
router.route('/medicines').get(getMedicines).post(validateMedicine(false), createMedicine);
router
  .route('/medicines/:id')
  .get(getMedicineById)
  .patch(validateMedicine(true), updateMedicine);
router.patch('/medicines/:id/status', validateMedicineStatus, updateMedicineStatus);

// --- Inventory ---
router.route('/inventory').get(getInventory).post(validateStockIn, postStockIn);
router.patch('/inventory/:id/adjust', validateAdjustment, postAdjustment);

// --- Stock transaction ledger (read-only) ---
router.get('/transactions', getTransactions);

// --- Prescription queue (clinical data is read-only here) ---
router.get('/prescriptions', getPharmacyPrescriptions);
router.get('/prescriptions/:id', getPharmacyPrescriptionById);

// --- Dispensing ---
router.route('/dispensing').get(getDispensings).post(validateDispense, postDispense);

// --- Statistics ---
router.get('/stats', getStats);

export default router;
