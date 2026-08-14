import { Router } from 'express';
import {
  postInvoice,
  getInvoices,
  getInvoiceById,
  patchInvoice,
  patchInvoiceStatus,
  getBillables,
  postPayment,
  getPayments,
  getPaymentById,
  postRefund,
  getStats,
} from '../controllers/billingController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateCreateInvoice,
  validateUpdateInvoice,
  validateInvoiceStatus,
  validateRecordPayment,
  validateRefund,
} from '../middleware/validateBilling.js';

const router = Router();

router.use(authenticate);

// Role matrix:
//   invoices create/edit/issue + payments — admin, receptionist
//   invoice cancellation + refunds — admin only (cancel re-checked in controller)
//   invoice viewing — admin, receptionist (billing staff) + doctor, nurse (read-only)
//   pharmacist / lab technician — no billing access (their modules feed
//   billing through referenced records, not by editing invoices)

const BILLING_STAFF = ['admin', 'receptionist'] as const;
const READERS = ['admin', 'receptionist', 'doctor', 'nurse'] as const;

// --- Invoices ---
router
  .route('/invoices')
  .get(authorize(...READERS), getInvoices)
  .post(authorize(...BILLING_STAFF), validateCreateInvoice, postInvoice);
router
  .route('/invoices/:id')
  .get(authorize(...READERS), getInvoiceById)
  .patch(authorize(...BILLING_STAFF), validateUpdateInvoice, patchInvoice);
router.patch(
  '/invoices/:id/status',
  authorize(...BILLING_STAFF),
  validateInvoiceStatus,
  patchInvoiceStatus
);

// --- Billable sources (existing records → invoice items) ---
router.get('/billable/:patientId', authorize(...BILLING_STAFF), getBillables);

// --- Payments ---
router
  .route('/payments')
  .get(authorize(...READERS), getPayments)
  .post(authorize(...BILLING_STAFF), validateRecordPayment, postPayment);
router.get('/payments/:id', authorize(...READERS), getPaymentById);

// --- Refunds (admin only) ---
router.post('/refunds', authorize('admin'), validateRefund, postRefund);

// --- Stats ---
router.get('/stats', authorize(...BILLING_STAFF), getStats);

export default router;
