import { Router } from 'express';
import {
  getAppointmentReport,
  getPatientReport,
  getClinicalReport,
  getPharmacyReport,
  getLaboratoryReport,
  getBillingReport,
  getInpatientReport,
} from '../controllers/analyticsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Reports inherit the data-access rules of the modules they summarize:
//   appointments — admin, receptionist, doctor (own activity only)
//   patients     — admin, receptionist
//   clinical     — admin, doctor (own activity only)
//   pharmacy     — admin, pharmacist
//   laboratory   — admin, lab technician
//   billing      — admin, receptionist
//   inpatient    — admin, receptionist, nurse
// CSV export runs through the same handlers, so it inherits the same
// roles, filters, and doctor scoping automatically.
router.get('/appointments', authorize('admin', 'receptionist', 'doctor'), getAppointmentReport);
router.get('/patients', authorize('admin', 'receptionist'), getPatientReport);
router.get('/clinical', authorize('admin', 'doctor'), getClinicalReport);
router.get('/pharmacy', authorize('admin', 'pharmacist'), getPharmacyReport);
router.get('/laboratory', authorize('admin', 'lab_technician'), getLaboratoryReport);
router.get('/billing', authorize('admin', 'receptionist'), getBillingReport);
router.get('/inpatient', authorize('admin', 'receptionist', 'nurse'), getInpatientReport);

export default router;
