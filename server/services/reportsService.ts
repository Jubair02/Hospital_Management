import { Types, isValidObjectId, type FilterQuery } from 'mongoose';
import Patient from '../models/Patient.js';
import Appointment, { type IAppointment } from '../models/Appointment.js';
import Consultation, { type IConsultation } from '../models/Consultation.js';
import DispensingRecord from '../models/DispensingRecord.js';
import Medicine from '../models/Medicine.js';
import InventoryBatch from '../models/InventoryBatch.js';
import LabOrder, { type ILabOrder } from '../models/LabOrder.js';
import LabResult from '../models/LabResult.js';
import Invoice, { type IInvoice } from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Admission, { ACTIVE_ADMISSION_STATUSES } from '../models/Admission.js';
import BedTransfer from '../models/BedTransfer.js';
import Ward from '../models/Ward.js';
import Bed from '../models/Bed.js';
import { toCents, fromCents } from './billingService.js';
import {
  getBedOccupancy,
  timeSeries,
  type DateRange,
  type TimePoint,
} from './analyticsService.js';

export interface NamedCount {
  label: string;
  count: number;
}

export interface ReportScope {
  /** Set for doctors — every query is restricted to their own records. */
  doctorId?: Types.ObjectId;
}

const rangeMatch = (field: string, range: DateRange): Record<string, unknown> => ({
  [field]: { $gte: range.start, $lt: range.end },
});

/**
 * Aggregation pipelines do NOT apply Mongoose schema casting, so an id
 * arriving as a string would silently match nothing in $match. Every id
 * filter goes through here first.
 */
const toObjectId = (value: string | undefined): Types.ObjectId | undefined =>
  value && isValidObjectId(value) ? new Types.ObjectId(value) : undefined;

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

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

export interface AppointmentReportFilters {
  doctorId?: string;
  departmentId?: string;
  status?: string;
}

export const buildAppointmentReport = async (
  range: DateRange,
  filters: AppointmentReportFilters,
  scope: ReportScope
): Promise<AppointmentReport> => {
  const match: FilterQuery<IAppointment> = { ...rangeMatch('createdAt', range) };

  // A doctor's own scope always wins over any requested doctorId.
  const doctorId = scope.doctorId ?? toObjectId(filters.doctorId);
  const departmentId = toObjectId(filters.departmentId);

  if (doctorId) match.doctorId = doctorId;
  if (departmentId) match.departmentId = departmentId;
  if (filters.status) match.status = filters.status as IAppointment['status'];

  const [statusRows, byDoctorRows, byDepartmentRows, series] = await Promise.all([
    Appointment.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Appointment.aggregate([
      { $match: match },
      { $group: { _id: '$doctorId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $lookup: { from: 'doctors', localField: '_id', foreignField: '_id', as: 'doctor' } },
      { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
    ]),
    Appointment.aggregate([
      { $match: match },
      { $group: { _id: '$departmentId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
    ]),
    timeSeries(Appointment, 'createdAt', range, {
      ...(doctorId ? { doctorId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    }),
  ]);

  const counts = new Map(
    (statusRows as Array<{ _id: string; count: number }>).map((r) => [r._id, r.count])
  );
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);

  return {
    summary: {
      total,
      scheduled: counts.get('scheduled') ?? 0,
      confirmed: counts.get('confirmed') ?? 0,
      completed: counts.get('completed') ?? 0,
      cancelled: counts.get('cancelled') ?? 0,
      noShow: counts.get('no_show') ?? 0,
    },
    byDoctor: (byDoctorRows as Array<{ count: number; doctor?: { firstName: string; lastName: string } }>).map(
      (r) => ({
        label: r.doctor ? `Dr. ${r.doctor.firstName} ${r.doctor.lastName}` : 'Unknown',
        count: r.count,
      })
    ),
    byDepartment: (byDepartmentRows as Array<{ count: number; department?: { name: string } }>).map(
      (r) => ({ label: r.department?.name ?? 'Unknown', count: r.count })
    ),
    series,
  };
};

// ---------------------------------------------------------------------------
// Patients (aggregate only — no personal details)
// ---------------------------------------------------------------------------

export interface PatientReport {
  summary: { total: number; newInRange: number; active: number; inactive: number };
  byGender: NamedCount[];
  byAgeGroup: NamedCount[];
  series: TimePoint[];
}

const AGE_BUCKETS = [
  { label: '0–17', min: 0, max: 17 },
  { label: '18–34', min: 18, max: 34 },
  { label: '35–49', min: 35, max: 49 },
  { label: '50–64', min: 50, max: 64 },
  { label: '65+', min: 65, max: 200 },
];

export const buildPatientReport = async (range: DateRange): Promise<PatientReport> => {
  const now = new Date();

  const [total, newInRange, active, inactive, genderRows, ageRows, series] = await Promise.all([
    Patient.countDocuments({}),
    Patient.countDocuments(rangeMatch('createdAt', range)),
    Patient.countDocuments({ status: 'active' }),
    Patient.countDocuments({ status: 'inactive' }),
    Patient.aggregate([{ $group: { _id: '$gender', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Patient.aggregate([
      {
        $addFields: {
          age: {
            $dateDiff: { startDate: '$dateOfBirth', endDate: now, unit: 'year' },
          },
        },
      },
      {
        $bucket: {
          groupBy: '$age',
          boundaries: [0, 18, 35, 50, 65, 201],
          default: 'unknown',
          output: { count: { $sum: 1 } },
        },
      },
    ]),
    timeSeries(Patient, 'createdAt', range),
  ]);

  const ageMap = new Map(
    (ageRows as Array<{ _id: number | string; count: number }>).map((r) => [String(r._id), r.count])
  );

  return {
    summary: { total, newInRange, active, inactive },
    byGender: (genderRows as Array<{ _id: string; count: number }>).map((r) => ({
      label: r._id ? r._id.charAt(0).toUpperCase() + r._id.slice(1) : 'Unknown',
      count: r.count,
    })),
    byAgeGroup: AGE_BUCKETS.map((bucket) => ({
      label: bucket.label,
      count: ageMap.get(String(bucket.min)) ?? 0,
    })),
    series,
  };
};

// ---------------------------------------------------------------------------
// Clinical
// ---------------------------------------------------------------------------

export interface ClinicalReport {
  summary: { total: number; completed: number; inProgress: number; withFollowUp: number };
  byDoctor: NamedCount[];
  byDepartment: NamedCount[];
  topDiagnoses: NamedCount[];
  series: TimePoint[];
}

export const buildClinicalReport = async (
  range: DateRange,
  filters: { doctorId?: string; departmentId?: string },
  scope: ReportScope
): Promise<ClinicalReport> => {
  const match: FilterQuery<IConsultation> = { ...rangeMatch('consultationDate', range) };

  const doctorId = scope.doctorId ?? toObjectId(filters.doctorId);
  const departmentId = toObjectId(filters.departmentId);

  if (doctorId) match.doctorId = doctorId;
  if (departmentId) match.departmentId = departmentId;

  const [statusRows, withFollowUp, byDoctorRows, byDepartmentRows, diagnosisRows, series] =
    await Promise.all([
      Consultation.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Consultation.countDocuments({ ...match, followUpDate: { $ne: null, $exists: true } }),
      Consultation.aggregate([
        { $match: match },
        { $group: { _id: '$doctorId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        { $lookup: { from: 'doctors', localField: '_id', foreignField: '_id', as: 'doctor' } },
        { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
      ]),
      Consultation.aggregate([
        { $match: match },
        { $group: { _id: '$departmentId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
        { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      ]),
      // Frequency of diagnoses exactly as the doctors recorded them —
      // no interpretation, no derived medical analysis.
      Consultation.aggregate([
        { $match: match },
        { $unwind: '$diagnoses' },
        { $group: { _id: { $toLower: '$diagnoses.diagnosis' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      timeSeries(Consultation, 'consultationDate', range, {
        ...(doctorId ? { doctorId } : {}),
        ...(departmentId ? { departmentId } : {}),
      }),
    ]);

  const counts = new Map(
    (statusRows as Array<{ _id: string; count: number }>).map((r) => [r._id, r.count])
  );

  return {
    summary: {
      total: [...counts.values()].reduce((sum, n) => sum + n, 0),
      completed: counts.get('completed') ?? 0,
      inProgress: counts.get('in_progress') ?? 0,
      withFollowUp,
    },
    byDoctor: (byDoctorRows as Array<{ count: number; doctor?: { firstName: string; lastName: string } }>).map(
      (r) => ({
        label: r.doctor ? `Dr. ${r.doctor.firstName} ${r.doctor.lastName}` : 'Unknown',
        count: r.count,
      })
    ),
    byDepartment: (byDepartmentRows as Array<{ count: number; department?: { name: string } }>).map(
      (r) => ({ label: r.department?.name ?? 'Unknown', count: r.count })
    ),
    topDiagnoses: (diagnosisRows as Array<{ _id: string; count: number }>).map((r) => ({
      label: r._id ? r._id.charAt(0).toUpperCase() + r._id.slice(1) : 'Unspecified',
      count: r.count,
    })),
    series,
  };
};

// ---------------------------------------------------------------------------
// Pharmacy
// ---------------------------------------------------------------------------

export interface PharmacyReport {
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

export const buildPharmacyReport = async (range: DateRange): Promise<PharmacyReport> => {
  const [dispensingEvents, unitRows, lowStockRows, expiredBatches, topRows, series] =
    await Promise.all([
      DispensingRecord.countDocuments(rangeMatch('createdAt', range)),
      DispensingRecord.aggregate([
        { $match: rangeMatch('createdAt', range) },
        { $unwind: '$items' },
        { $group: { _id: null, units: { $sum: '$items.quantity' } } },
      ]),
      // Active medicines whose usable stock sits below the reorder level.
      Medicine.aggregate([
        { $match: { status: 'active' } },
        {
          $lookup: {
            from: 'inventorybatches',
            let: { mid: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$medicineId', '$$mid'] }, { $gt: ['$expiryDate', new Date()] }],
                  },
                },
              },
              { $group: { _id: null, total: { $sum: '$quantity' } } },
            ],
            as: 'stock',
          },
        },
        {
          $addFields: {
            totalStock: { $ifNull: [{ $arrayElemAt: ['$stock.total', 0] }, 0] },
          },
        },
        { $match: { $expr: { $lt: ['$totalStock', '$reorderLevel'] } } },
        { $sort: { totalStock: 1 } },
        { $limit: 25 },
        { $project: { name: 1, strength: 1, totalStock: 1, reorderLevel: 1 } },
      ]),
      InventoryBatch.countDocuments({ expiryDate: { $lte: new Date() }, quantity: { $gt: 0 } }),
      DispensingRecord.aggregate([
        { $match: rangeMatch('createdAt', range) },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.medicineName',
            count: { $sum: '$items.quantity' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      timeSeries(DispensingRecord, 'createdAt', range),
    ]);

  return {
    summary: {
      dispensingEvents,
      unitsDispensed: (unitRows[0] as { units?: number } | undefined)?.units ?? 0,
      lowStockCount: (lowStockRows as unknown[]).length,
      expiredBatches,
    },
    topMedicines: (topRows as Array<{ _id: string; count: number }>).map((r) => ({
      label: r._id ?? 'Unknown',
      count: r.count,
    })),
    lowStock: (
      lowStockRows as Array<{ name: string; strength?: string; totalStock: number; reorderLevel: number }>
    ).map((r) => ({
      label: `${r.name}${r.strength ? ` ${r.strength}` : ''}`,
      count: r.totalStock,
      reorderLevel: r.reorderLevel,
    })),
    series,
  };
};

// ---------------------------------------------------------------------------
// Laboratory
// ---------------------------------------------------------------------------

export interface LaboratoryReport {
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

export const buildLaboratoryReport = async (
  range: DateRange,
  filters: { status?: string }
): Promise<LaboratoryReport> => {
  const match: FilterQuery<ILabOrder> = { ...rangeMatch('orderedAt', range) };
  if (filters.status) match.status = filters.status as ILabOrder['status'];


  const [statusRows, verifiedResults, categoryRows, topRows, series] = await Promise.all([
    LabOrder.aggregate([
      { $match: rangeMatch('orderedAt', range) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    LabResult.countDocuments({ ...rangeMatch('createdAt', range), status: 'verified' }),
    LabOrder.aggregate([
      { $match: match },
      { $unwind: '$tests' },
      { $lookup: { from: 'labtests', localField: 'tests.testId', foreignField: '_id', as: 'test' } },
      { $unwind: { path: '$test', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'labcategories',
          localField: 'test.category',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$category.name', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    LabOrder.aggregate([
      { $match: match },
      { $unwind: '$tests' },
      { $group: { _id: '$tests.testName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    timeSeries(LabOrder, 'orderedAt', range, filters.status ? { status: filters.status } : {}),
  ]);

  const counts = new Map(
    (statusRows as Array<{ _id: string; count: number }>).map((r) => [r._id, r.count])
  );

  return {
    summary: {
      totalOrders: [...counts.values()].reduce((sum, n) => sum + n, 0),
      completed: counts.get('completed') ?? 0,
      pending:
        (counts.get('ordered') ?? 0) +
        (counts.get('sample_collected') ?? 0) +
        (counts.get('processing') ?? 0),
      cancelled: counts.get('cancelled') ?? 0,
      verifiedResults,
    },
    byCategory: (categoryRows as Array<{ _id: string | null; count: number }>).map((r) => ({
      label: r._id ?? 'Uncategorized',
      count: r.count,
    })),
    topTests: (topRows as Array<{ _id: string; count: number }>).map((r) => ({
      label: r._id ?? 'Unknown',
      count: r.count,
    })),
    series,
  };
};

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export interface BillingReport {
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

export const buildBillingReport = async (
  range: DateRange,
  filters: { method?: string; invoiceStatus?: string }
): Promise<BillingReport> => {
  const invoiceMatch: FilterQuery<IInvoice> = { ...rangeMatch('createdAt', range) };
  if (filters.invoiceStatus) invoiceMatch.invoiceStatus = filters.invoiceStatus as IInvoice['invoiceStatus'];

  const paymentMatch: Record<string, unknown> = {
    ...rangeMatch('paidAt', range),
    status: { $ne: 'failed' },
  };
  if (filters.method) paymentMatch.method = filters.method;

  const [paymentRows, outstandingRows, invoiceRows, methodRows, series] = await Promise.all([
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { invoiceStatus: 'issued' } },
      { $group: { _id: null, total: { $sum: '$dueAmount' } } },
    ]),
    Invoice.aggregate([
      { $match: invoiceMatch },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: '$method', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      { $sort: { amount: -1 } },
    ]),
    timeSeries(Payment, 'paidAt', range, { status: { $ne: 'failed' }, type: 'payment' }, {
      $sum: '$amount',
    }),
  ]);

  const payments = new Map(
    (paymentRows as Array<{ _id: string; total: number; count: number }>).map((r) => [r._id, r])
  );
  const paidCents = toCents(payments.get('payment')?.total ?? 0);
  const refundCents = toCents(payments.get('refund')?.total ?? 0);

  const invoiceCounts = new Map(
    (invoiceRows as Array<{ _id: string; count: number }>).map((r) => [r._id, r.count])
  );

  return {
    summary: {
      revenue: fromCents(paidCents - refundCents),
      paid: fromCents(paidCents),
      refunds: fromCents(refundCents),
      outstanding: fromCents(
        toCents((outstandingRows[0] as { total?: number } | undefined)?.total ?? 0)
      ),
      invoices: [...invoiceCounts.values()].reduce((sum, n) => sum + n, 0),
      paidInvoices: invoiceCounts.get('paid') ?? 0,
      partiallyPaidInvoices: invoiceCounts.get('partially_paid') ?? 0,
      unpaidInvoices: invoiceCounts.get('unpaid') ?? 0,
    },
    byMethod: (methodRows as Array<{ _id: string; count: number; amount: number }>).map((r) => ({
      label: r._id.replace('_', ' '),
      count: r.count,
      amount: fromCents(toCents(r.amount)),
    })),
    series: series.map((p) => ({ date: p.date, value: fromCents(toCents(p.value)) })),
  };
};

// ---------------------------------------------------------------------------
// Inpatient
// ---------------------------------------------------------------------------

export interface InpatientReport {
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

export const buildInpatientReport = async (range: DateRange): Promise<InpatientReport> => {
  const [
    currentInpatients,
    admissions,
    discharges,
    transfers,
    occupancy,
    wards,
    bedRows,
    admissionSeries,
    dischargeSeries,
  ] = await Promise.all([
    Admission.countDocuments({ status: { $in: ACTIVE_ADMISSION_STATUSES } }),
    Admission.countDocuments(rangeMatch('admissionDate', range)),
    Admission.countDocuments({ ...rangeMatch('dischargeDate', range), status: 'discharged' }),
    BedTransfer.countDocuments(rangeMatch('transferredAt', range)),
    getBedOccupancy(),
    Ward.find({}).select('name').sort({ name: 1 }).lean(),
    // One pass for bed totals/occupancy per ward.
    Bed.aggregate([
      {
        $group: {
          _id: '$wardId',
          total: { $sum: 1 },
          occupied: { $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0] } },
        },
      },
    ]),
    timeSeries(Admission, 'admissionDate', range),
    timeSeries(Admission, 'dischargeDate', range, { status: 'discharged' }),
  ]);

  // Active inpatients per ward.
  const inpatientRows = (await Admission.aggregate([
    { $match: { status: { $in: ACTIVE_ADMISSION_STATUSES } } },
    { $group: { _id: '$wardId', count: { $sum: 1 } } },
  ])) as Array<{ _id: Types.ObjectId; count: number }>;

  const inpatientsPerWard = new Map(inpatientRows.map((r) => [String(r._id), r.count]));
  const bedsPerWard = new Map(
    (bedRows as Array<{ _id: Types.ObjectId; total: number; occupied: number }>).map((r) => [
      String(r._id),
      r,
    ])
  );

  return {
    summary: {
      currentInpatients,
      admissions,
      discharges,
      transfers,
      ...occupancy,
    },
    byWard: wards.map((ward) => {
      const beds = bedsPerWard.get(String(ward._id));
      return {
        label: ward.name,
        count: inpatientsPerWard.get(String(ward._id)) ?? 0,
        occupied: beds?.occupied ?? 0,
        total: beds?.total ?? 0,
      };
    }),
    admissionSeries,
    dischargeSeries,
  };
};
