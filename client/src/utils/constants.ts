import type { Role } from '../types';

export const ROLES = {
  ADMIN: 'admin',
  DOCTOR: 'doctor',
  RECEPTIONIST: 'receptionist',
  NURSE: 'nurse',
  PHARMACIST: 'pharmacist',
  LAB_TECHNICIAN: 'lab_technician',
  PATIENT: 'patient',
} as const satisfies Record<string, Role>;

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  nurse: 'Nurse',
  pharmacist: 'Pharmacist',
  lab_technician: 'Lab Technician',
  patient: 'Patient',
};

/** Staff roles assignable from user management — patients get their
 * accounts through the patient record, never through this screen. */
export const STAFF_ROLE_LABELS: Partial<Record<Role, string>> = {
  admin: ROLE_LABELS.admin,
  doctor: ROLE_LABELS.doctor,
  receptionist: ROLE_LABELS.receptionist,
  nurse: ROLE_LABELS.nurse,
  pharmacist: ROLE_LABELS.pharmacist,
  lab_technician: ROLE_LABELS.lab_technician,
};

/** Landing page for each role after login. */
export const DASHBOARD_PATHS: Record<Role, string> = {
  admin: '/admin/dashboard',
  doctor: '/doctor/dashboard',
  receptionist: '/receptionist/dashboard',
  nurse: '/nurse/dashboard',
  pharmacist: '/pharmacist/dashboard',
  lab_technician: '/laboratory',
  patient: '/patient',
};

export const APP_NAME = 'HMS';
export const HOSPITAL_NAME = 'Tulip General Hospital';
