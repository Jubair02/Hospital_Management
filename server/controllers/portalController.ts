import mongoose, { type FilterQuery } from 'mongoose';
import Appointment, {
  STATUS_TRANSITIONS,
  type AppointmentStatus,
  type IAppointment,
} from '../models/Appointment.js';
import Consultation from '../models/Consultation.js';
import Department from '../models/Department.js';
import Doctor from '../models/Doctor.js';
import Admission from '../models/Admission.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import LabOrder from '../models/LabOrder.js';
import LabResult from '../models/LabResult.js';
import DispensingRecord from '../models/DispensingRecord.js';
import PrescriptionFulfillment from '../models/PrescriptionFulfillment.js';
import { bookAppointment, toCalendarDate } from '../services/appointmentService.js';
import { getAvailableSlots, PORTAL_EDITABLE_FIELDS } from '../services/portalService.js';
import { notifyDoctor, unreadCount } from '../services/notificationService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/*
 * Every handler in this file reads the owning patient from req.patient,
 * which loadPatientProfile derived from the JWT. Route parameters are
 * used only to pick ONE record out of the patient's own set — always
 * combined with { patientId } in the query, so a manipulated id
 * resolves to 404, never to another patient's data.
 */

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const parsePage = (value: unknown): number => Math.max(parseInt(queryString(value) ?? '', 10) || 1, 1);
const parseLimit = (value: unknown, fallback = 10): number =>
  Math.min(Math.max(parseInt(queryString(value) ?? '', 10) || fallback, 1), 100);

const paginated = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(Math.ceil(total / limit), 1),
});

const assertObjectId = (value: string | undefined): string => {
  if (!value || !mongoose.isValidObjectId(value)) {
    throw new ApiError(404, 'Record not found');
  }
  return value;
};

// Populate projections: names and public identifiers only — no internal
// doctor/staff data leaves the portal API.
const DOCTOR_PUBLIC = { path: 'doctorId', select: 'firstName lastName specialization' };
const DEPARTMENT_PUBLIC = { path: 'departmentId', select: 'name' };

/**
 * Consultation fields a patient may see: their clinical summary.
 * Working notes (historyOfPresentIllness, physicalExamination,
 * clinicalNotes) are the doctor's in-progress documentation and are
 * deliberately excluded from the portal.
 */
const CONSULTATION_PORTAL_FIELDS =
  'consultationId consultationDate status chiefComplaint assessment diagnoses treatmentPlan prescriptions followUpDate vitalSigns doctorId departmentId';

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** GET /api/patient/dashboard — one call for the landing page. */
export const getDashboard = asyncHandler(async (req, res) => {
  const patient = req.patient!;
  const today = toCalendarDate(new Date().toISOString().slice(0, 10));

  const [
    upcomingAppointments,
    recentAppointments,
    activePrescriptionLines,
    recentLabResults,
    outstandingInvoices,
    recentPayments,
    currentAdmission,
    unreadNotifications,
  ] = await Promise.all([
    Appointment.find({
      patientId: patient._id,
      status: { $in: ['scheduled', 'confirmed'] },
      appointmentDate: { $gte: today },
    })
      .sort({ appointmentDate: 1, startTime: 1 })
      .limit(5)
      .populate([DOCTOR_PUBLIC, DEPARTMENT_PUBLIC]),
    Appointment.find({
      patientId: patient._id,
      $or: [{ appointmentDate: { $lt: today } }, { status: { $in: ['completed', 'cancelled', 'no_show'] } }],
    })
      .sort({ appointmentDate: -1, startTime: -1 })
      .limit(5)
      .populate([DOCTOR_PUBLIC, DEPARTMENT_PUBLIC]),
    PrescriptionFulfillment.find({ patientId: patient._id, status: 'partial' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('medicineName prescribedQuantity dispensedQuantity remaining status updatedAt'),
    LabResult.find({ patientId: patient._id, status: 'verified' })
      .sort({ verifiedAt: -1 })
      .limit(5)
      .select('resultId testName value unit referenceRange interpretation verifiedAt'),
    Invoice.find({ patientId: patient._id, invoiceStatus: 'issued', dueAmount: { $gt: 0 } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('invoiceId totalAmount amountPaid dueAmount paymentStatus createdAt'),
    Payment.find({ patientId: patient._id, type: 'payment' })
      .sort({ paidAt: -1 })
      .limit(5)
      .select('paymentId amount method paidAt status'),
    Admission.findOne({ patientId: patient._id, isActive: true })
      .populate([
        { path: 'wardId', select: 'name' },
        { path: 'bedId', select: 'bedNumber' },
        DOCTOR_PUBLIC,
      ])
      .select('admissionId admissionDate status reason wardId bedId doctorId'),
    unreadCount(req.user!._id),
  ]);

  res.json({
    success: true,
    message: 'Dashboard fetched',
    data: {
      patient,
      upcomingAppointments,
      recentAppointments,
      activePrescriptionLines,
      recentLabResults,
      outstandingInvoices,
      recentPayments,
      currentAdmission,
      unreadNotifications,
    },
  });
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** GET /api/patient/profile */
export const getProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Profile fetched', data: { patient: req.patient! } });
});

/**
 * PATCH /api/patient/profile
 * Contact/social fields only — validatePortalProfile rejects everything
 * else, so clinical and identity fields cannot be reached from here.
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const patient = req.patient!;
  const body = req.body as Record<string, unknown>;

  const changed: string[] = [];
  for (const field of PORTAL_EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      patient.set(field, body[field]);
      changed.push(field);
    }
  }

  await patient.save();

  await req.audit({
    action: 'portal_profile_updated',
    resourceType: 'patient',
    resourceId: patient._id,
    description: `Patient ${patient.patientId} updated their own contact details.`,
    metadata: { patientId: patient.patientId, fields: changed.join(', ') },
  });

  res.json({ success: true, message: 'Profile updated successfully', data: { patient } });
});

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

/** GET /api/patient/appointments?status=&page=&limit= */
export const listAppointments = asyncHandler(async (req, res) => {
  const patient = req.patient!;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);

  const filter: FilterQuery<IAppointment> = { patientId: patient._id };
  const status = queryString(req.query.status);
  if (status) filter.status = status as AppointmentStatus;

  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .sort({ appointmentDate: -1, startTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate([DOCTOR_PUBLIC, DEPARTMENT_PUBLIC]),
    Appointment.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Appointments fetched',
    data: { appointments, pagination: paginated(page, limit, total) },
  });
});

/** GET /api/patient/appointments/:id — own appointments only. */
export const getAppointment = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id);
  const appointment = await Appointment.findOne({
    _id: id,
    patientId: req.patient!._id,
  }).populate([DOCTOR_PUBLIC, DEPARTMENT_PUBLIC]);

  if (!appointment) throw new ApiError(404, 'Appointment not found');

  res.json({ success: true, message: 'Appointment fetched', data: { appointment } });
});

/**
 * POST /api/patient/appointments
 * Books for the authenticated patient — a patientId in the body is
 * ignored. Reuses the exact staff booking service, so availability
 * checks and double-booking prevention are identical.
 */
export const bookOwnAppointment = asyncHandler(async (req, res) => {
  const patient = req.patient!;
  const body = req.body as {
    doctorId: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    reason: string;
  };

  const appointment = await bookAppointment(
    {
      patientId: String(patient._id), // ownership forced server-side
      doctorId: body.doctorId,
      appointmentDate: body.appointmentDate,
      startTime: body.startTime,
      endTime: body.endTime,
      reason: body.reason,
    },
    req.user!._id
  );

  await req.audit({
    action: 'portal_appointment_booked',
    resourceType: 'appointment',
    resourceId: appointment._id,
    description: `Patient ${patient.patientId} booked appointment ${appointment.appointmentId}.`,
    metadata: {
      appointmentId: appointment.appointmentId,
      date: body.appointmentDate,
      startTime: body.startTime,
    },
  });

  await appointment.populate([DOCTOR_PUBLIC, DEPARTMENT_PUBLIC]);

  res.status(201).json({
    success: true,
    message: 'Appointment booked successfully',
    data: { appointment },
  });
});

/**
 * PATCH /api/patient/appointments/:id/cancel
 * A patient may cancel their own scheduled/confirmed appointments.
 * Completed, cancelled, and no-show appointments are immutable —
 * enforced by the same transition table the staff API uses.
 */
export const cancelOwnAppointment = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id);
  const patient = req.patient!;

  const appointment = await Appointment.findOne({ _id: id, patientId: patient._id });
  if (!appointment) throw new ApiError(404, 'Appointment not found');

  if (!STATUS_TRANSITIONS[appointment.status].includes('cancelled')) {
    throw new ApiError(400, `A ${appointment.status} appointment can no longer be cancelled.`);
  }

  appointment.status = 'cancelled';
  await appointment.save();

  await req.audit({
    action: 'portal_appointment_cancelled',
    resourceType: 'appointment',
    resourceId: appointment._id,
    description: `Patient ${patient.patientId} cancelled appointment ${appointment.appointmentId}.`,
    metadata: { appointmentId: appointment.appointmentId },
  });

  // Secondary effect — never allowed to fail the cancellation.
  await notifyDoctor(appointment.doctorId, {
    type: 'appointment',
    title: 'Appointment cancelled by patient',
    message: `${patient.firstName} ${patient.lastName} cancelled ${appointment.appointmentId} on ${appointment.appointmentDate
      .toISOString()
      .slice(0, 10)} at ${appointment.startTime}.`,
    referenceType: 'appointment',
    referenceId: appointment._id,
    dedupeKey: `appointment:cancelled:${appointment._id}`,
  });

  await appointment.populate([DOCTOR_PUBLIC, DEPARTMENT_PUBLIC]);

  res.json({
    success: true,
    message: 'Appointment cancelled successfully',
    data: { appointment },
  });
});

// ---------------------------------------------------------------------------
// Booking support — departments, doctors, free slots
// ---------------------------------------------------------------------------

/** GET /api/patient/booking/departments — active departments, names only. */
export const listBookingDepartments = asyncHandler(async (_req, res) => {
  const departments = await Department.find({ status: 'active' })
    .sort({ name: 1 })
    .select('name description');
  res.json({ success: true, message: 'Departments fetched', data: { departments } });
});

/** GET /api/patient/booking/doctors?departmentId= — public directory fields. */
export const listBookingDoctors = asyncHandler(async (req, res) => {
  const departmentId = queryString(req.query.departmentId);
  if (!departmentId || !mongoose.isValidObjectId(departmentId)) {
    throw new ApiError(400, 'A valid departmentId is required.');
  }

  const doctors = await Doctor.find({ departmentId, status: 'active' })
    .sort({ lastName: 1 })
    .select('doctorId firstName lastName specialization departmentId');

  res.json({ success: true, message: 'Doctors fetched', data: { doctors } });
});

/**
 * GET /api/patient/booking/slots?doctorId=&date=YYYY-MM-DD
 * Free ranges only — other patients' bookings never leave the server.
 */
export const listBookingSlots = asyncHandler(async (req, res) => {
  const doctorId = queryString(req.query.doctorId);
  const date = queryString(req.query.date);

  if (!doctorId || !mongoose.isValidObjectId(doctorId)) {
    throw new ApiError(400, 'A valid doctorId is required.');
  }
  if (!date) throw new ApiError(400, 'A date is required.');

  const slots = await getAvailableSlots(doctorId, date);
  res.json({ success: true, message: 'Slots fetched', data: { slots } });
});

// ---------------------------------------------------------------------------
// Medical records (read-only)
// ---------------------------------------------------------------------------

/** GET /api/patient/medical-records?page=&limit= */
export const listMedicalRecords = asyncHandler(async (req, res) => {
  const patient = req.patient!;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);

  const filter = { patientId: patient._id, status: { $ne: 'cancelled' } };

  const [consultations, total] = await Promise.all([
    Consultation.find(filter)
      .sort({ consultationDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(CONSULTATION_PORTAL_FIELDS)
      .populate([DOCTOR_PUBLIC, DEPARTMENT_PUBLIC]),
    Consultation.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Medical records fetched',
    data: {
      consultations,
      medicalHistory: patient.medicalHistory,
      allergies: patient.allergies,
      pagination: paginated(page, limit, total),
    },
  });
});

/** GET /api/patient/medical-records/:id */
export const getMedicalRecord = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id);
  const consultation = await Consultation.findOne({
    _id: id,
    patientId: req.patient!._id,
    status: { $ne: 'cancelled' },
  })
    .select(CONSULTATION_PORTAL_FIELDS)
    .populate([DOCTOR_PUBLIC, DEPARTMENT_PUBLIC]);

  if (!consultation) throw new ApiError(404, 'Medical record not found');

  res.json({ success: true, message: 'Medical record fetched', data: { consultation } });
});

// ---------------------------------------------------------------------------
// Prescriptions (read-only)
// ---------------------------------------------------------------------------

/**
 * GET /api/patient/prescriptions?page=&limit=
 * Prescription lines live inside consultations; dispensing progress
 * lives in pharmacy fulfillment records. Join the two per consultation.
 */
export const listPrescriptions = asyncHandler(async (req, res) => {
  const patient = req.patient!;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);

  const filter = {
    patientId: patient._id,
    status: { $ne: 'cancelled' },
    'prescriptions.0': { $exists: true },
  };

  const [consultations, total] = await Promise.all([
    Consultation.find(filter)
      .sort({ consultationDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('consultationId consultationDate prescriptions doctorId')
      .populate([DOCTOR_PUBLIC]),
    Consultation.countDocuments(filter),
  ]);

  const fulfillments = await PrescriptionFulfillment.find({
    consultationId: { $in: consultations.map((c) => c._id) },
  }).select('consultationId prescriptionIndex status dispensedQuantity remaining');

  const fulfillmentKey = (consultationId: string, index: number) => `${consultationId}:${index}`;
  const byLine = new Map(
    fulfillments.map((f) => [fulfillmentKey(String(f.consultationId), f.prescriptionIndex), f])
  );

  const records = consultations.map((consultation) => ({
    _id: consultation._id,
    consultationId: consultation.consultationId,
    consultationDate: consultation.consultationDate,
    doctorId: consultation.doctorId,
    prescriptions: consultation.prescriptions.map((line, index) => {
      const fulfillment = byLine.get(fulfillmentKey(String(consultation._id), index));
      return {
        // Subdocuments must be unwrapped before spreading — spreading the
        // mongoose wrapper copies internals, not the prescription fields.
        ...(line as unknown as { toObject: () => Record<string, unknown> }).toObject(),
        // 'pending' = pharmacy has not dispensed against this line yet.
        dispenseStatus: fulfillment?.status ?? 'pending',
        dispensedQuantity: fulfillment?.dispensedQuantity ?? 0,
      };
    }),
  }));

  res.json({
    success: true,
    message: 'Prescriptions fetched',
    data: { records, pagination: paginated(page, limit, total) },
  });
});

// ---------------------------------------------------------------------------
// Laboratory (read-only, verified results only)
// ---------------------------------------------------------------------------

/** GET /api/patient/laboratory?page=&limit= */
export const listLaboratory = asyncHandler(async (req, res) => {
  const patient = req.patient!;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);

  const filter = { patientId: patient._id };

  const [orders, total] = await Promise.all([
    LabOrder.find(filter)
      .sort({ orderedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('orderId tests status priority orderedAt doctorId')
      .populate([DOCTOR_PUBLIC]),
    LabOrder.countDocuments(filter),
  ]);

  // Only VERIFIED results are final and patient-visible. Values entered
  // but not yet verified stay internal, as do technicians' notes.
  const results = await LabResult.find({
    patientId: patient._id,
    orderId: { $in: orders.map((o) => o._id) },
    status: 'verified',
  }).select('resultId orderId testName value unit referenceRange interpretation status verifiedAt');

  res.json({
    success: true,
    message: 'Laboratory data fetched',
    data: { orders, results, pagination: paginated(page, limit, total) },
  });
});

// ---------------------------------------------------------------------------
// Medications (read-only)
// ---------------------------------------------------------------------------

/** GET /api/patient/medications — fulfillment progress + dispensing history. */
export const listMedications = asyncHandler(async (req, res) => {
  const patient = req.patient!;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);

  const [fulfillments, dispensings, total] = await Promise.all([
    PrescriptionFulfillment.find({ patientId: patient._id })
      .sort({ updatedAt: -1 })
      .select(
        'consultationId medicineName prescribedQuantity dispensedQuantity remaining status updatedAt'
      ),
    // Batches (numbers, expiry, stock internals) are pharmacy data and
    // are projected away — the patient sees medicine names + quantities.
    DispensingRecord.find({ patientId: patient._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('dispensingId consultationId items.medicineName items.quantity items.prescriptionIndex createdAt'),
    DispensingRecord.countDocuments({ patientId: patient._id }),
  ]);

  res.json({
    success: true,
    message: 'Medications fetched',
    data: { fulfillments, dispensings, pagination: paginated(page, limit, total) },
  });
});

// ---------------------------------------------------------------------------
// Billing (read-only)
// ---------------------------------------------------------------------------

/**
 * GET /api/patient/billing?page=&limit=
 * Draft invoices are internal working documents and are excluded until
 * they are issued.
 */
export const listInvoices = asyncHandler(async (req, res) => {
  const patient = req.patient!;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);

  const filter = { patientId: patient._id, invoiceStatus: { $ne: 'draft' } };

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('invoiceId createdAt totalAmount amountPaid dueAmount paymentStatus invoiceStatus'),
    Invoice.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Invoices fetched',
    data: { invoices, pagination: paginated(page, limit, total) },
  });
});

/** GET /api/patient/billing/:id — one issued invoice + its payments. */
export const getInvoice = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id);
  const invoice = await Invoice.findOne({
    _id: id,
    patientId: req.patient!._id,
    invoiceStatus: { $ne: 'draft' },
  }).select('-createdBy');

  if (!invoice) throw new ApiError(404, 'Invoice not found');

  const payments = await Payment.find({ invoiceId: invoice._id })
    .sort({ paidAt: -1 })
    .select('paymentId type amount method transactionReference status paidAt');

  res.json({
    success: true,
    message: 'Invoice fetched',
    data: { invoice, payments },
  });
});

// ---------------------------------------------------------------------------
// Admission (read-only)
// ---------------------------------------------------------------------------

/** GET /api/patient/admission — current admission + history. */
export const getAdmissions = asyncHandler(async (req, res) => {
  const patient = req.patient!;

  const POPULATE = [
    { path: 'wardId', select: 'name type floor' },
    { path: 'bedId', select: 'bedNumber' },
    DOCTOR_PUBLIC,
  ];
  const FIELDS =
    'admissionId admissionDate expectedDischargeDate dischargeDate status reason admissionType wardId bedId doctorId';

  const [current, history] = await Promise.all([
    Admission.findOne({ patientId: patient._id, isActive: true })
      .populate(POPULATE)
      .select(FIELDS),
    Admission.find({ patientId: patient._id, isActive: false })
      .sort({ admissionDate: -1 })
      .limit(20)
      .populate(POPULATE)
      .select(FIELDS),
  ]);

  res.json({
    success: true,
    message: 'Admissions fetched',
    data: { current, history },
  });
});
