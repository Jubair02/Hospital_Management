import type { Role } from '../types';

/**
 * Patient-module permissions, mirroring the backend route authorization.
 * The backend is the enforcement point — these only shape the UI.
 */
export const canCreatePatient = (role: Role | null): boolean =>
  role === 'admin' || role === 'receptionist';

export const canEditPatient = canCreatePatient;

export const canChangePatientStatus = (role: Role | null): boolean => role === 'admin';

export const canViewPatientStats = (role: Role | null): boolean =>
  role === 'admin' || role === 'receptionist';

/** Nurses search only; the other roles also get the filter dropdowns. */
export const canFilterPatients = (role: Role | null): boolean => role !== null && role !== 'nurse';

/** The patients list path for the current role. */
export const patientsListPath = (role: Role | null): string =>
  role ? `/${role}/patients` : '/';

// ---------------------------------------------------------------------------
// Doctors / departments / appointments (Phase 3) — mirrors backend RBAC.
// ---------------------------------------------------------------------------

export const canManageDoctors = (role: Role | null): boolean => role === 'admin';

export const canManageDepartments = (role: Role | null): boolean => role === 'admin';

export const canCreateAppointment = (role: Role | null): boolean =>
  role === 'admin' || role === 'receptionist';

export const canEditAppointment = canCreateAppointment;

export const canCancelAppointment = canCreateAppointment;

/**
 * Who may close an appointment out by hand.
 *
 * Completion normally happens on its own when a doctor finishes the
 * consultation, so this is a fallback for the case that leaves a slot stuck:
 * the patient was seen, but the clinical record was never completed. The front
 * desk gets it because they are the ones reconciling the day's diary.
 *
 * Deliberately not doctors, even though the API would accept it from them — a
 * doctor closing the appointment without finishing the consultation is the
 * situation this exists to clean up, not a second way to do the same job.
 */
export const canMarkAppointmentCompleted = canCreateAppointment;

export const canViewAppointmentStats = (role: Role | null): boolean =>
  role === 'admin' || role === 'receptionist' || role === 'doctor';

/** Status targets each role may apply (server re-checks transitions). */
export const allowedStatusTargets = (role: Role | null): string[] => {
  if (role === 'admin' || role === 'receptionist') {
    return ['confirmed', 'completed', 'cancelled', 'no_show'];
  }
  if (role === 'doctor') return ['confirmed', 'completed', 'no_show'];
  return [];
};

/** The appointments list path for the current role. */
export const appointmentsListPath = (role: Role | null): string =>
  role ? `/${role}/appointments` : '/';

// ---------------------------------------------------------------------------
// Consultations / clinical records (Phase 4) — mirrors backend RBAC.
// ---------------------------------------------------------------------------

/** Only doctors author clinical records (their own appointments only). */
export const canAuthorConsultation = (role: Role | null): boolean => role === 'doctor';

/** Receptionists have no clinical access at all. */
/**
 * Who may open the inpatient dashboard at `/inpatient`.
 *
 * Narrower than the rest of the module: doctors can read wards, beds and
 * admissions but not the operations board, so anything linking *back* to it
 * has to check first or it sends them to the Unauthorized page.
 */
export const canViewInpatientDashboard = (role: Role | null): boolean =>
  role === 'admin' || role === 'receptionist' || role === 'nurse';

export const canViewClinical = (role: Role | null): boolean =>
  role === 'admin' || role === 'doctor' || role === 'nurse';

export const canViewConsultationStats = (role: Role | null): boolean =>
  role === 'admin' || role === 'doctor';

// ---------------------------------------------------------------------------
// Pharmacy (Phase 5) — mirrors backend RBAC.
// ---------------------------------------------------------------------------

/** The pharmacy module is admin + pharmacist only. */
export const canManagePharmacy = (role: Role | null): boolean =>
  role === 'admin' || role === 'pharmacist';

/** Roles that use the shared patient/appointment sections. */
export const isClinicalRole = (role: Role | null): boolean =>
  role === 'admin' || role === 'doctor' || role === 'receptionist' || role === 'nurse';

// ---------------------------------------------------------------------------
// Billing (Phase 7) — mirrors backend RBAC.
// ---------------------------------------------------------------------------

/**
 * Who may open the billing desk at `/billing` and the lists under it.
 *
 * Narrower than the invoice itself, which doctors and nurses can also read
 * (the server keeps them read-only). Anything linking *back* into the desk —
 * a back link, a breadcrumb, an empty-state button — has to check this first
 * or it sends those roles to the Unauthorized page.
 */
export const canViewBillingDesk = (role: Role | null): boolean =>
  role === 'admin' || role === 'receptionist';

/** Issuing an invoice and taking a payment against it. */
export const canOperateBilling = canViewBillingDesk;

/** Money leaving again, and voiding a record: administrators only. */
export const canReverseBilling = (role: Role | null): boolean => role === 'admin';

// ---------------------------------------------------------------------------
// Laboratory (Phase 6) — mirrors backend RBAC.
// ---------------------------------------------------------------------------

/** Sample collection, result entry, verification, cancellation. */
export const canProcessLab = (role: Role | null): boolean =>
  role === 'admin' || role === 'lab_technician';

/** Test/category catalog management is admin only. */
export const canManageLabCatalog = (role: Role | null): boolean => role === 'admin';

/** Who may open lab orders (backend further scopes doctor/nurse). */
export const canViewLabOrders = (role: Role | null): boolean =>
  role === 'admin' || role === 'lab_technician' || role === 'doctor' || role === 'nurse';
