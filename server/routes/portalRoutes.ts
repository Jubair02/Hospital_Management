import { Router } from 'express';
import {
  getDashboard,
  getProfile,
  updateProfile,
  listAppointments,
  getAppointment,
  bookOwnAppointment,
  cancelOwnAppointment,
  listBookingDepartments,
  listBookingDoctors,
  listBookingSlots,
  listMedicalRecords,
  getMedicalRecord,
  listPrescriptions,
  listLaboratory,
  listMedications,
  listInvoices,
  getInvoice,
  getAdmissions,
} from '../controllers/portalController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { loadPatientProfile } from '../middleware/portal.js';
import { validatePortalProfile, validatePortalBooking } from '../middleware/validatePortal.js';

const router = Router();

/*
 * Patient self-service API (mounted at /api/patient — the staff patient
 * management API stays at /api/patients).
 *
 * Access model: `patient` role ONLY. Staff roles are deliberately
 * excluded — they have their own, fuller APIs — and every handler
 * scopes its queries to the Patient record resolved from the JWT by
 * loadPatientProfile. The portal exposes no write path to clinical,
 * laboratory, pharmacy, billing, or admission records.
 */
router.use(authenticate, authorize('patient'), loadPatientProfile);

router.get('/dashboard', getDashboard);

router.get('/profile', getProfile);
router.patch('/profile', validatePortalProfile, updateProfile);

// Booking support first, so 'booking' is not parsed as an appointment id.
router.get('/booking/departments', listBookingDepartments);
router.get('/booking/doctors', listBookingDoctors);
router.get('/booking/slots', listBookingSlots);

router.get('/appointments', listAppointments);
router.post('/appointments', validatePortalBooking, bookOwnAppointment);
router.get('/appointments/:id', getAppointment);
router.patch('/appointments/:id/cancel', cancelOwnAppointment);

router.get('/medical-records', listMedicalRecords);
router.get('/medical-records/:id', getMedicalRecord);

router.get('/prescriptions', listPrescriptions);
router.get('/laboratory', listLaboratory);
router.get('/medications', listMedications);

router.get('/billing', listInvoices);
router.get('/billing/:id', getInvoice);

router.get('/admission', getAdmissions);

export default router;
