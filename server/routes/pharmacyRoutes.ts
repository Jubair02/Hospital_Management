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
/**
 * One exception to the blanket guard below: nurses may read the medicine
 * catalogue. Charting an administration against a catalogue entry rather than
 * a hand-typed drug name is what keeps a misspelling out of a legal record.
 * Registered before the guard, and deliberately read-only.
 */
router.get('/medicines', authorize('admin', 'pharmacist', 'nurse'), getMedicines);
router.get('/medicines/:id', authorize('admin', 'pharmacist', 'nurse'), getMedicineById);

// Everything else in the pharmacy module is admin + pharmacist. Doctors author
// prescriptions through Phase 4; receptionists have no clinical access.
router.use(authorize('admin', 'pharmacist'));

// --- Categories ---
router.route('/categories').get(getCategories).post(validateCategory(false), createCategory);
router.patch('/categories/:id', validateCategory(true), updateCategory);
router.patch('/categories/:id/status', validateCategoryStatus, updateCategoryStatus);

// --- Medicines ---
router.route('/medicines').post(validateMedicine(false), createMedicine);
router.route('/medicines/:id').patch(validateMedicine(true), updateMedicine);
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
