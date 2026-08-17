/** User roles — must stay in sync with the server's User model enum.
 * `patient` is the portal role (Phase 11); everything else is staff. */
export type Role =
  | 'admin'
  | 'doctor'
  | 'receptionist'
  | 'nurse'
  | 'pharmacist'
  | 'lab_technician'
  | 'patient';

import { isBeforeToday } from './utils/date';

/** A user as serialized by the API (passwords never leave the server). */
export interface User {
  _id: string;
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: Role;
  isActive: boolean;
  /** Three-state account status (Phase 10). `isActive` stays in sync with it. */
  status?: UserStatus;
  /**
   * Present only on portal logins, and only in the user list: the Patient
   * record this account signs in as. The reference is stored the other way
   * round, so the server resolves it for these rows rather than the client
   * having to search patients by email to find the same person.
   */
  patient?: { id: string; patientId: string };
  createdAt: string;
  updatedAt: string;
  fullName?: string;
}

/** Every API response uses this envelope. */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface LoginData {
  token: string;
  user: User;
}

export interface UsersListData {
  users: User[];
  pagination: Pagination;
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  role: Role;
}

export type UpdateUserPayload = Partial<CreateUserPayload>;

export interface UsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// Patients (Phase 2)
// ---------------------------------------------------------------------------

export type Gender = 'male' | 'female' | 'other';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'unknown';

export type PatientStatus = 'active' | 'inactive';

export const GENDERS: Gender[] = ['male', 'female', 'other'];

export const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];

/** The staff member who registered a patient, as populated by the API. */
export interface PatientCreator {
  _id: string;
  firstName: string;
  lastName: string;
  role?: Role;
}

/** A patient as serialized by the API. */
export interface Patient {
  _id: string;
  id?: string;
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  email?: string;
  address?: string;
  emergencyContact?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  nationalId?: string;
  maritalStatus?: string;
  occupation?: string;
  profileImage?: string;
  medicalHistory: string[];
  allergies: string[];
  status: PatientStatus;
  /** Linked portal login (User id), when an account has been issued. */
  userId?: string | null;
  createdBy?: PatientCreator | string | null;
  createdAt: string;
  updatedAt: string;
  fullName?: string;
  age?: number;
}

export interface PatientsListData {
  patients: Patient[];
  pagination: Pagination;
}

export interface PatientStats {
  totalPatients: number;
  activePatients: number;
  inactivePatients: number;
  newPatientsThisMonth: number;
}

export interface CreatePatientPayload {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  phone: string;
  bloodGroup?: BloodGroup;
  email?: string;
  address?: string;
  emergencyContact?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  nationalId?: string;
  maritalStatus?: string;
  occupation?: string;
  medicalHistory?: string[];
  allergies?: string[];
}

export type UpdatePatientPayload = Partial<CreatePatientPayload>;

export interface PatientsQuery {
  page?: number;
  limit?: number;
  search?: string;
  gender?: string;
  bloodGroup?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// Departments, doctors, appointments (Phase 3)
// ---------------------------------------------------------------------------

export type DepartmentStatus = 'active' | 'inactive';
export type DoctorStatus = 'active' | 'inactive';

export interface Department {
  _id: string;
  id?: string;
  departmentId: string;
  name: string;
  description?: string;
  status: DepartmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type DayOfWeek =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export interface AvailabilitySlot {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface Doctor {
  _id: string;
  id?: string;
  userId: string;
  doctorId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization: string;
  departmentId: Department | string | null;
  qualification?: string;
  licenseNumber?: string;
  experienceYears?: number;
  consultationFee?: number;
  profileImage?: string;
  bio?: string;
  availability: AvailabilitySlot[];
  status: DoctorStatus;
  fullName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorsListData {
  doctors: Doctor[];
  pagination: Pagination;
}

export interface DoctorsQuery {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  specialization?: string;
  status?: string;
}

export interface NewDoctorUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface DoctorProfilePayload {
  specialization: string;
  departmentId: string;
  qualification?: string;
  licenseNumber?: string;
  experienceYears?: number;
  consultationFee?: number;
  bio?: string;
}

export interface CreateDoctorPayload extends DoctorProfilePayload {
  userId?: string;
  user?: NewDoctorUserInput;
}

export type UpdateDoctorPayload = Partial<
  DoctorProfilePayload & { firstName: string; lastName: string; phone: string }
>;

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
];

/** Mirrors the server's transition table for building UI actions. */
/**
 * Mirrors the server's map. `confirmed` and `completed` are reached by
 * starting and finishing a consultation rather than by pressing a button, so
 * the only transitions a person drives are the two exits: the patient did not
 * come (`no_show`), or the appointment is called off (`cancelled`).
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

/**
 * The transitions offered as buttons, in the order they should appear —
 * benign first, irreversible-and-negative last, so the destructive one is
 * never where a hand lands by habit.
 *
 * `completed` is here as a fallback rather than a step: it is applied
 * automatically when a consultation finishes, and only the front desk sees the
 * button (see `canMarkAppointmentCompleted`). `confirmed` is absent entirely —
 * starting a consultation is the only thing that confirms an appointment.
 */
export const MANUAL_APPOINTMENT_ACTIONS: AppointmentStatus[] = [
  'completed',
  'no_show',
  'cancelled',
];

export interface AppointmentPatientRef {
  _id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status?: string;
  dateOfBirth?: string;
}

export interface AppointmentDoctorRef {
  _id: string;
  doctorId: string;
  firstName: string;
  lastName: string;
  specialization?: string;
  status?: string;
}

export interface AppointmentDepartmentRef {
  _id: string;
  departmentId?: string;
  name: string;
}

export interface Appointment {
  _id: string;
  id?: string;
  appointmentId: string;
  patientId: AppointmentPatientRef | null;
  doctorId: AppointmentDoctorRef | null;
  departmentId: AppointmentDepartmentRef | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  notes?: string;
  status: AppointmentStatus;
  createdBy?: { _id: string; firstName: string; lastName: string; role?: Role } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentsListData {
  appointments: Appointment[];
  pagination: Pagination;
}

export interface AppointmentsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  doctorId?: string;
  departmentId?: string;
  patientId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateAppointmentPayload {
  patientId: string;
  doctorId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  notes?: string;
}

export interface UpdateAppointmentPayload {
  appointmentDate?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  notes?: string;
}

export interface AppointmentStats {
  todaysAppointments: number;
  pendingAppointments: number;
  scheduledToday: number;
  confirmedToday: number;
  cancelledToday: number;
  completedToday: number;
  upcomingAppointments: number;
  totalDoctors: number;
  activeDoctors: number;
}

// ---------------------------------------------------------------------------
// Consultations & clinical records (Phase 4)
// ---------------------------------------------------------------------------

export type ConsultationStatus = 'in_progress' | 'completed' | 'cancelled';

export type DiagnosisType = 'primary' | 'secondary';

export interface VitalSigns {
  temperature?: number;
  heartRate?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
}

export interface Diagnosis {
  diagnosis: string;
  type: DiagnosisType;
  notes?: string;
}

export interface PrescriptionMedicine {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  route?: string;
  instructions?: string;
}

export interface ConsultationPatientRef extends AppointmentPatientRef {
  gender?: Gender;
  bloodGroup?: BloodGroup;
  allergies?: string[];
}

export interface ConsultationAppointmentRef {
  _id: string;
  appointmentId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
}

export interface Consultation {
  _id: string;
  id?: string;
  consultationId: string;
  appointmentId: ConsultationAppointmentRef | null;
  patientId: ConsultationPatientRef | null;
  doctorId: AppointmentDoctorRef | null;
  departmentId: AppointmentDepartmentRef | null;
  consultationDate: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  clinicalNotes?: string;
  physicalExamination?: string;
  assessment?: string;
  /** Absent on records saved before the container was persisted empty. */
  vitalSigns?: VitalSigns;
  diagnoses: Diagnosis[];
  treatmentPlan?: string;
  prescriptions: PrescriptionMedicine[];
  followUpDate?: string;
  status: ConsultationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ConsultationsListData {
  consultations: Consultation[];
  pagination: Pagination;
}

export interface ConsultationsQuery {
  page?: number;
  limit?: number;
  status?: string;
  doctorId?: string;
  patientId?: string;
  appointmentId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface UpdateConsultationPayload {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  clinicalNotes?: string;
  physicalExamination?: string;
  assessment?: string;
  vitalSigns?: VitalSigns;
  diagnoses?: Diagnosis[];
  treatmentPlan?: string;
  prescriptions?: PrescriptionMedicine[];
  followUpDate?: string;
}

export interface ConsultationStats {
  totalConsultations: number;
  completedConsultations: number;
  inProgressConsultations: number;
  todaysConsultations: number;
  completedToday: number;
}

// ---------------------------------------------------------------------------
// Pharmacy (Phase 5)
// ---------------------------------------------------------------------------

export type ActiveStatus = 'active' | 'inactive';

export interface MedicineCategory {
  _id: string;
  id?: string;
  categoryId: string;
  name: string;
  description?: string;
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Medicine {
  _id: string;
  id?: string;
  medicineId: string;
  name: string;
  genericName?: string;
  brandName?: string;
  category: MedicineCategory | string | null;
  dosageForm: string;
  strength?: string;
  manufacturer?: string;
  prescriptionRequired: boolean;
  reorderLevel: number;
  status: ActiveStatus;
  /** Present on list responses (aggregated usable stock). */
  totalStock?: number;
  lowStock?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MedicinesListData {
  medicines: Medicine[];
  pagination: Pagination;
}

export interface MedicinePayload {
  name: string;
  genericName?: string;
  brandName?: string;
  category: string;
  dosageForm: string;
  strength?: string;
  manufacturer?: string;
  prescriptionRequired?: boolean;
  reorderLevel?: number;
}

export interface InventoryBatch {
  _id: string;
  id?: string;
  batchId: string;
  medicineId: Medicine | string | null;
  batchNumber: string;
  quantity: number;
  initialQuantity: number;
  unitCost: number;
  sellingPrice: number;
  manufactureDate?: string;
  expiryDate: string;
  notes?: string;
  isExpired?: boolean;
  isDepleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryListData {
  batches: InventoryBatch[];
  pagination: Pagination;
}

export interface StockInPayload {
  medicineId: string;
  batchNumber: string;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
  manufactureDate?: string;
  expiryDate: string;
  notes?: string;
}

export type StockTransactionType = 'stock_in' | 'dispense' | 'adjustment' | 'expiry' | 'return';

export interface StockTransaction {
  _id: string;
  id?: string;
  transactionId: string;
  type: StockTransactionType;
  medicineId: { _id: string; medicineId: string; name: string } | null;
  batchId: { _id: string; batchId: string; batchNumber: string } | null;
  quantityChange: number;
  balanceAfter: number;
  reference?: string;
  notes?: string;
  performedBy?: { _id: string; firstName: string; lastName: string; role?: Role } | null;
  createdAt: string;
}

export interface TransactionsListData {
  transactions: StockTransaction[];
  pagination: Pagination;
}

export type FulfillmentStatus = 'partial' | 'dispensed';

export interface PrescriptionFulfillment {
  _id: string;
  consultationId: string;
  prescriptionIndex: number;
  medicineId: string;
  medicineName: string;
  prescribedQuantity: number;
  dispensedQuantity: number;
  remaining: number;
  status: FulfillmentStatus;
}

/** A completed consultation as shown in the pharmacy queue. */
export interface PharmacyPrescription {
  _id: string;
  consultationId: string;
  consultationDate: string;
  prescriptions: PrescriptionMedicine[];
  patientId: AppointmentPatientRef | null;
  doctorId: AppointmentDoctorRef | null;
  status: string;
}

export interface PharmacyPrescriptionsData {
  consultations: PharmacyPrescription[];
  fulfillments: PrescriptionFulfillment[];
  pagination: Pagination;
}

export interface DispensedBatch {
  batchId: string;
  batchNumber: string;
  quantity: number;
  sellingPrice: number;
}

export interface DispensedItem {
  prescriptionIndex: number;
  medicineId: string;
  medicineName: string;
  quantity: number;
  batches: DispensedBatch[];
}

export interface DispensingRecord {
  _id: string;
  id?: string;
  dispensingId: string;
  consultationId: { _id: string; consultationId: string } | string | null;
  patientId: { _id: string; patientId: string; firstName: string; lastName: string } | null;
  items: DispensedItem[];
  dispensedBy?: { _id: string; firstName: string; lastName: string } | null;
  createdAt: string;
}

export interface DispensingListData {
  records: DispensingRecord[];
  pagination: Pagination;
}

export interface DispenseItemPayload {
  prescriptionIndex: number;
  medicineId: string;
  quantity: number;
  prescribedQuantity?: number;
}

export interface DispensePayload {
  consultationId: string;
  items: DispenseItemPayload[];
}

export interface PharmacyStats {
  totalMedicines: number;
  activeMedicines: number;
  lowStockCount: number;
  expiredBatches: number;
  pendingPrescriptions: number;
  todaysDispensings: number;
}

// ---------------------------------------------------------------------------
// Laboratory (Phase 6)
// ---------------------------------------------------------------------------

export type SampleType = 'blood' | 'urine' | 'stool' | 'saliva' | 'swab' | 'other';
export type LabResultType = 'numeric' | 'text' | 'positive_negative';
export type LabPriority = 'routine' | 'urgent';
export type LabOrderStatus =
  | 'ordered'
  | 'sample_collected'
  | 'processing'
  | 'completed'
  | 'cancelled';
export type SampleStatus = 'pending' | 'collected' | 'rejected';
export type LabResultStatus = 'pending' | 'processing' | 'completed' | 'verified';

export const SAMPLE_TYPES: SampleType[] = ['blood', 'urine', 'stool', 'saliva', 'swab', 'other'];
export const LAB_RESULT_TYPES: LabResultType[] = ['numeric', 'text', 'positive_negative'];

export interface LabCategory {
  _id: string;
  id?: string;
  categoryId: string;
  name: string;
  description?: string;
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LabTest {
  _id: string;
  id?: string;
  testId: string;
  name: string;
  category: LabCategory | string | null;
  description?: string;
  sampleType: SampleType;
  preparationInstructions?: string;
  price: number;
  turnaroundTime?: string;
  resultType: LabResultType;
  unit?: string;
  referenceRange?: string;
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LabTestsListData {
  tests: LabTest[];
  pagination: Pagination;
}

export interface LabTestPayload {
  name: string;
  category: string;
  description?: string;
  sampleType: SampleType;
  preparationInstructions?: string;
  price: number;
  turnaroundTime?: string;
  resultType?: LabResultType;
  unit?: string;
  referenceRange?: string;
}

export interface LabOrderTestItem {
  testId: string;
  testName: string;
  price: number;
}

export interface LabOrder {
  _id: string;
  id?: string;
  orderId: string;
  patientId: AppointmentPatientRef | null;
  doctorId: AppointmentDoctorRef | null;
  appointmentId?: string | null;
  consultationId: { _id: string; consultationId: string } | string | null;
  tests: LabOrderTestItem[];
  clinicalNotes?: string;
  priority: LabPriority;
  status: LabOrderStatus;
  orderedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LabOrdersListData {
  orders: LabOrder[];
  pagination: Pagination;
}

export interface LabOrdersQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  priority?: string;
  patientId?: string;
  doctorId?: string;
  consultationId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateLabOrderPayload {
  consultationId: string;
  tests: string[];
  clinicalNotes?: string;
  priority?: LabPriority;
}

export interface LabSample {
  _id: string;
  id?: string;
  sampleId: string;
  orderId: { _id: string; orderId: string; priority?: LabPriority; status?: LabOrderStatus } | string | null;
  patientId: { _id: string; patientId: string; firstName: string; lastName: string } | string | null;
  sampleType: SampleType;
  status: SampleStatus;
  collectedBy?: { _id: string; firstName: string; lastName: string } | null;
  collectedAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
}

export interface LabSamplesListData {
  samples: LabSample[];
  pagination: Pagination;
}

export interface LabResult {
  _id: string;
  id?: string;
  resultId: string;
  orderId: { _id: string; orderId: string; priority?: LabPriority; status?: LabOrderStatus } | string | null;
  testId: string;
  patientId: { _id: string; patientId: string; firstName: string; lastName: string } | string | null;
  testName: string;
  value?: string;
  unit?: string;
  referenceRange?: string;
  interpretation?: string;
  notes?: string;
  performedBy?: { _id: string; firstName: string; lastName: string } | null;
  verifiedBy?: { _id: string; firstName: string; lastName: string } | null;
  performedAt?: string;
  verifiedAt?: string;
  status: LabResultStatus;
  createdAt: string;
}

export interface LabResultsListData {
  results: LabResult[];
  pagination: Pagination;
}

export interface EnterLabResultPayload {
  value: string;
  unit?: string;
  referenceRange?: string;
  interpretation?: string;
  notes?: string;
}

export interface LaboratoryStats {
  pendingOrders: number;
  samplesAwaitingCollection: number;
  testsInProcessing: number;
  completedTests: number;
  urgentOrders: number;
  todaysOrders: number;
}

// ---------------------------------------------------------------------------
// Billing & payments (Phase 7)
// ---------------------------------------------------------------------------

export type InvoiceStatus = 'draft' | 'issued' | 'cancelled';
export type InvoicePaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'refunded';
export type InvoiceItemType = 'consultation' | 'lab_order' | 'pharmacy' | 'service';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mobile_banking';
export type PaymentRecordStatus = 'completed' | 'failed' | 'refunded';
export type PaymentType = 'payment' | 'refund';

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'mobile_banking'];

export interface InvoiceItem {
  itemType: InvoiceItemType;
  referenceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Invoice {
  _id: string;
  id?: string;
  invoiceId: string;
  patientId: AppointmentPatientRef | null;
  appointmentId?: string | null;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  totalAmount: number;
  amountPaid: number;
  dueAmount: number;
  paymentStatus: InvoicePaymentStatus;
  invoiceStatus: InvoiceStatus;
  createdBy?: { _id: string; firstName: string; lastName: string; role?: Role } | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoicesListData {
  invoices: Invoice[];
  pagination: Pagination;
}

export interface InvoiceItemInput {
  itemType: InvoiceItemType;
  referenceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoicePayload {
  patientId: string;
  appointmentId?: string;
  items: InvoiceItemInput[];
  discount?: number;
  tax?: number;
}

export interface InvoicesQuery {
  page?: number;
  limit?: number;
  search?: string;
  invoiceStatus?: string;
  paymentStatus?: string;
  patientId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface BillingPayment {
  _id: string;
  id?: string;
  paymentId: string;
  invoiceId: { _id: string; invoiceId: string } | string | null;
  patientId: { _id: string; patientId: string; firstName: string; lastName: string } | null;
  type: PaymentType;
  amount: number;
  method: PaymentMethod;
  transactionReference?: string;
  status: PaymentRecordStatus;
  refundOf?: string | null;
  receivedBy?: { _id: string; firstName: string; lastName: string } | null;
  paidAt: string;
  notes?: string;
}

export interface PaymentsListData {
  payments: BillingPayment[];
  pagination: Pagination;
}

export interface PaymentsQuery {
  page?: number;
  limit?: number;
  search?: string;
  method?: string;
  status?: string;
  type?: string;
  invoiceId?: string;
  patientId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface RecordPaymentPayload {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  transactionReference?: string;
  notes?: string;
}

export interface BillableItem {
  itemType: InvoiceItemType;
  referenceId: string;
  description: string;
  unitPrice: number;
}

export interface BillingStats {
  todaysRevenue: number;
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  partiallyPaidInvoices: number;
  outstandingAmount: number;
  todaysPayments: number;
}

// ---------------------------------------------------------------------------
// Inpatient & bed management (Phase 8)
// ---------------------------------------------------------------------------

export type WardType =
  | 'general'
  | 'icu'
  | 'emergency'
  | 'pediatric'
  | 'maternity'
  | 'surgical'
  | 'private';

export const WARD_TYPES: WardType[] = [
  'general',
  'icu',
  'emergency',
  'pediatric',
  'maternity',
  'surgical',
  'private',
];

export type BedStatus = 'available' | 'occupied' | 'reserved' | 'maintenance' | 'inactive';
export type AdmissionType = 'emergency' | 'scheduled' | 'transfer';
export type AdmissionStatus = 'admitted' | 'transferred' | 'discharged' | 'cancelled';

export interface Ward {
  _id: string;
  id?: string;
  wardId: string;
  name: string;
  type: WardType;
  department?: { _id: string; departmentId?: string; name: string } | string | null;
  floor?: string;
  description?: string;
  status: ActiveStatus;
  bedSummary?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface WardsListData {
  wards: Ward[];
  pagination: Pagination;
}

export interface HospitalBed {
  _id: string;
  id?: string;
  bedId: string;
  wardId: { _id: string; wardId?: string; name: string; status?: ActiveStatus } | string | null;
  bedNumber: string;
  bedType?: string;
  status: BedStatus;
  currentPatientId?: { _id: string; patientId: string; firstName: string; lastName: string } | null;
  createdAt: string;
}

export interface BedsListData {
  beds: HospitalBed[];
  pagination: Pagination;
}

export interface Admission {
  _id: string;
  id?: string;
  admissionId: string;
  patientId: AppointmentPatientRef | null;
  doctorId: AppointmentDoctorRef | null;
  wardId: { _id: string; wardId?: string; name: string; type?: WardType; floor?: string } | null;
  bedId: { _id: string; bedId?: string; bedNumber: string; bedType?: string } | null;
  appointmentId?: string | null;
  reason: string;
  admissionType: AdmissionType;
  admissionDate: string;
  expectedDischargeDate?: string;
  dischargeDate?: string;
  status: AdmissionStatus;
  isActive: boolean;
  notes?: string;
  admittedBy?: { _id: string; firstName: string; lastName: string; role?: Role } | null;
  createdAt: string;
}

export interface AdmissionsListData {
  admissions: Admission[];
  pagination: Pagination;
}

export interface AdmissionsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  wardId?: string;
  patientId?: string;
  doctorId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdmitPatientPayload {
  patientId: string;
  doctorId: string;
  wardId: string;
  bedId: string;
  appointmentId?: string;
  reason: string;
  admissionType: AdmissionType;
  expectedDischargeDate?: string;
  notes?: string;
}

export interface BedTransfer {
  _id: string;
  id?: string;
  transferId: string;
  admissionId: string;
  patientId: { _id: string; patientId: string; firstName: string; lastName: string } | string | null;
  fromWardId: { _id: string; name: string } | null;
  fromBedId: { _id: string; bedNumber: string } | null;
  toWardId: { _id: string; name: string } | null;
  toBedId: { _id: string; bedNumber: string } | null;
  reason?: string;
  transferredBy?: { _id: string; firstName: string; lastName: string } | null;
  transferredAt: string;
}

export interface InpatientStats {
  totalWards: number;
  totalBeds: number;
  availableBeds: number;
  occupiedBeds: number;
  reservedBeds: number;
  maintenanceBeds: number;
  currentInpatients: number;
  todaysAdmissions: number;
  todaysDischarges: number;
}

// ---------------------------------------------------------------------------
// Analytics, reports & notifications (Phase 9)
// ---------------------------------------------------------------------------

export type RangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export interface ReportFilters {
  range?: RangePreset;
  from?: string;
  to?: string;
}

export interface TimePoint {
  date: string;
  value: number;
}

export interface NamedCount {
  label: string;
  count: number;
}

export interface ResolvedRange {
  start: string;
  end: string;
  preset: RangePreset;
  granularity: 'day' | 'month';
}

export interface AnalyticsOverview {
  range: ResolvedRange;
  kpis: {
    totalPatients: number;
    totalDoctors: number;
    totalAppointments: number;
    completedConsultations: number;
    pharmacyDispensings: number;
    laboratoryOrders: number;
    currentInpatients: number;
    totalRevenue: number;
    outstandingPayments: number;
  };
  series: {
    appointments: TimePoint[];
    registrations: TimePoint[];
    revenue: TimePoint[];
    consultations: TimePoint[];
    pharmacy: TimePoint[];
    laboratory: TimePoint[];
    admissions: TimePoint[];
    discharges: TimePoint[];
  };
}

export interface AppointmentReport {
  summary: {
    total: number;
    scheduled: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  byDoctor: NamedCount[];
  byDepartment: NamedCount[];
  series: TimePoint[];
}

export interface PatientReport {
  summary: { total: number; newInRange: number; active: number; inactive: number };
  byGender: NamedCount[];
  byAgeGroup: NamedCount[];
  series: TimePoint[];
}

export interface ClinicalReport {
  summary: { total: number; completed: number; inProgress: number; withFollowUp: number };
  byDoctor: NamedCount[];
  byDepartment: NamedCount[];
  topDiagnoses: NamedCount[];
  series: TimePoint[];
}

export interface PharmacyReportData {
  summary: {
    dispensingEvents: number;
    unitsDispensed: number;
    lowStockCount: number;
    expiredBatches: number;
  };
  topMedicines: NamedCount[];
  lowStock: Array<{ label: string; count: number; reorderLevel: number }>;
  series: TimePoint[];
}

export interface LaboratoryReportData {
  summary: {
    totalOrders: number;
    completed: number;
    pending: number;
    cancelled: number;
    verifiedResults: number;
  };
  byCategory: NamedCount[];
  topTests: NamedCount[];
  series: TimePoint[];
}

export interface BillingReportData {
  summary: {
    revenue: number;
    paid: number;
    refunds: number;
    outstanding: number;
    invoices: number;
    paidInvoices: number;
    partiallyPaidInvoices: number;
    unpaidInvoices: number;
  };
  byMethod: Array<{ label: string; count: number; amount: number }>;
  series: TimePoint[];
}

export interface InpatientReportData {
  summary: {
    currentInpatients: number;
    admissions: number;
    discharges: number;
    transfers: number;
    totalBeds: number;
    availableBeds: number;
    occupiedBeds: number;
    occupancyRate: number;
  };
  byWard: Array<{ label: string; count: number; occupied: number; total: number }>;
  admissionSeries: TimePoint[];
  dischargeSeries: TimePoint[];
}

export type NotificationType =
  | 'appointment'
  | 'lab_result'
  | 'prescription'
  | 'payment'
  | 'admission'
  | 'discharge'
  | 'low_stock'
  | 'system';

export type NotificationReferenceType =
  | 'appointment'
  | 'consultation'
  | 'lab_order'
  | 'lab_result'
  | 'invoice'
  | 'payment'
  | 'admission'
  | 'medicine'
  | 'none';

export interface AppNotification {
  _id: string;
  id?: string;
  notificationId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceType: NotificationReferenceType;
  referenceId?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface NotificationsListData {
  notifications: AppNotification[];
  unreadCount: number;
  pagination: Pagination;
}

export interface NotificationFilters {
  page?: number;
  limit?: number;
  type?: string;
  unread?: string;
}

// ---------------------------------------------------------------------------
// Security, audit & system administration (Phase 10)
// ---------------------------------------------------------------------------

export type UserStatus = 'active' | 'inactive' | 'suspended';

export const USER_STATUSES: UserStatus[] = ['active', 'inactive', 'suspended'];

/** Free-form to stay in step with the server's action vocabulary, which
 *  the audit page fetches at runtime rather than hard-coding. */
export type AuditAction = string;
export type AuditResourceType = string;

export interface AuditLogEntry {
  _id: string;
  id?: string;
  auditId: string;
  actorId?: { _id: string; firstName: string; lastName: string; email: string; role: Role } | null;
  actorRole?: Role;
  actorLabel?: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  createdAt: string;
}

export interface AuditLogsListData {
  logs: AuditLogEntry[];
  pagination: Pagination;
}

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  resourceType?: string;
  actorRole?: string;
  actorId?: string;
  from?: string;
  to?: string;
  sort?: 'createdAt' | 'action';
  order?: 'asc' | 'desc';
}

export interface AuditVocabulary {
  actions: string[];
  resourceTypes: string[];
  roles: Role[];
}

export interface SystemSettings {
  _id: string;
  hospitalName: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  timezone: string;
  currency: string;
  appointmentSlotMinutes: number;
  notifyLowStock: boolean;
  updatedAt: string;
}

export type SystemSettingsPayload = Partial<
  Pick<
    SystemSettings,
    | 'hospitalName'
    | 'contactPhone'
    | 'contactEmail'
    | 'address'
    | 'timezone'
    | 'currency'
    | 'appointmentSlotMinutes'
    | 'notifyLowStock'
  >
>;

export interface SystemHealth {
  api: { status: string; uptimeSeconds: number };
  database: { status: string; name: string | null };
  application: { version: string; environment: string; nodeVersion: string };
  traffic: {
    startedAt: string;
    requests: number;
    clientErrors: number;
    serverErrors: number;
    lastServerErrorAt: string | null;
  };
}

export interface AdminUserFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// Patient portal (Phase 11)
// ---------------------------------------------------------------------------

/** Doctor as the portal sees them: public directory fields only. */
export interface PortalDoctor {
  _id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
  doctorId?: string;
}

export interface PortalDepartment {
  _id: string;
  name: string;
  description?: string;
}

export interface PortalAppointment {
  _id: string;
  appointmentId: string;
  doctorId: PortalDoctor | null;
  departmentId: PortalDepartment | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  notes?: string;
  status: AppointmentStatus;
  createdAt: string;
}

export interface PortalBookingSlot {
  startTime: string;
  endTime: string;
}

export interface PortalBookingPayload {
  doctorId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface PortalDiagnosis {
  diagnosis: string;
  type: 'primary' | 'secondary';
  notes?: string;
}

export interface PortalVitalSigns {
  temperature?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
}

export interface PortalPrescriptionLine {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  route?: string;
  instructions?: string;
}

/** A consultation as exposed by the portal — clinical summary only. */
export interface PortalMedicalRecord {
  _id: string;
  consultationId: string;
  consultationDate: string;
  status: string;
  chiefComplaint?: string;
  assessment?: string;
  diagnoses: PortalDiagnosis[];
  treatmentPlan?: string;
  prescriptions: PortalPrescriptionLine[];
  followUpDate?: string;
  vitalSigns?: PortalVitalSigns;
  doctorId: PortalDoctor | null;
  departmentId: PortalDepartment | null;
}

export type PortalDispenseStatus = 'pending' | 'partial' | 'dispensed';

export interface PortalPrescriptionRecord {
  _id: string;
  consultationId: string;
  consultationDate: string;
  doctorId: PortalDoctor | null;
  prescriptions: Array<
    PortalPrescriptionLine & {
      dispenseStatus: PortalDispenseStatus;
      dispensedQuantity: number;
    }
  >;
}

export interface PortalLabOrder {
  _id: string;
  orderId: string;
  tests: Array<{ testName: string; price: number }>;
  status: string;
  priority: string;
  orderedAt: string;
  doctorId: PortalDoctor | null;
}

export interface PortalLabResult {
  _id: string;
  resultId: string;
  orderId: string;
  testName: string;
  value?: string;
  unit?: string;
  referenceRange?: string;
  interpretation?: string;
  status: string;
  verifiedAt?: string;
}

export interface PortalFulfillment {
  _id: string;
  consultationId: string;
  medicineName: string;
  prescribedQuantity: number;
  dispensedQuantity: number;
  remaining: number;
  status: 'partial' | 'dispensed';
  updatedAt: string;
}

export interface PortalDispensing {
  _id: string;
  dispensingId: string;
  consultationId: string;
  items: Array<{ medicineName: string; quantity: number; prescriptionIndex: number }>;
  createdAt: string;
}

export interface PortalInvoice {
  _id: string;
  invoiceId: string;
  createdAt: string;
  totalAmount: number;
  amountPaid: number;
  dueAmount: number;
  paymentStatus: InvoicePaymentStatus;
  invoiceStatus: InvoiceStatus;
}

export interface PortalInvoiceDetail extends PortalInvoice {
  items: Array<{
    itemType: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
}

export interface PortalPayment {
  _id: string;
  paymentId: string;
  type: 'payment' | 'refund';
  amount: number;
  method: string;
  transactionReference?: string;
  status: string;
  paidAt: string;
}

export interface PortalAdmission {
  _id: string;
  admissionId: string;
  admissionDate: string;
  expectedDischargeDate?: string;
  dischargeDate?: string;
  status: string;
  reason: string;
  admissionType: string;
  wardId: { _id: string; name: string; type?: string; floor?: string } | null;
  bedId: { _id: string; bedNumber: string } | null;
  doctorId: PortalDoctor | null;
}

export interface PortalDashboard {
  patient: Patient;
  upcomingAppointments: PortalAppointment[];
  recentAppointments: PortalAppointment[];
  activePrescriptionLines: PortalFulfillment[];
  recentLabResults: PortalLabResult[];
  outstandingInvoices: PortalInvoice[];
  recentPayments: PortalPayment[];
  currentAdmission: PortalAdmission | null;
  unreadNotifications: number;
}

/** Contact/social fields a patient may edit about themselves. */
export interface PortalProfilePayload {
  phone?: string;
  email?: string;
  address?: string;
  emergencyContact?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  maritalStatus?: string;
  occupation?: string;
}

/**
 * An appointment whose day has passed while it still holds the doctor's time.
 *
 * `scheduled` and `confirmed` are the two statuses that block booking, so one
 * left in either state after its date keeps a slot unbookable for good —
 * there is no job that closes them, and nothing else in the interface says so.
 */
export const isAppointmentOverdue = (appointment: {
  status: AppointmentStatus;
  appointmentDate: string;
}): boolean =>
  (appointment.status === 'scheduled' || appointment.status === 'confirmed') &&
  isBeforeToday(appointment.appointmentDate);
