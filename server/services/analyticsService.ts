import type { PipelineStage } from 'mongoose';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import Appointment from '../models/Appointment.js';
import Consultation from '../models/Consultation.js';
import DispensingRecord from '../models/DispensingRecord.js';
import LabOrder from '../models/LabOrder.js';
import Admission from '../models/Admission.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Bed from '../models/Bed.js';
import { ACTIVE_ADMISSION_STATUSES } from '../models/Admission.js';
import { toCents, fromCents } from './billingService.js';

// ---------------------------------------------------------------------------
// Date ranges — resolved on the backend so the client never filters data
// itself and every report shares one definition of "this month".
// ---------------------------------------------------------------------------

export const RANGE_PRESETS = ['today', 'week', 'month', 'year', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface DateRange {
  start: Date;
  end: Date;
  preset: RangePreset;
  /** Time-series bucket size: day for short ranges, month for long ones. */
  granularity: 'day' | 'month';
}

const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const DAY_MS = 86_400_000;

/**
 * Resolves a preset (or explicit from/to dates) into a concrete range.
 * Unknown or malformed input falls back to the current month.
 */
export const resolveRange = (
  preset: string | undefined,
  from: string | undefined,
  to: string | undefined
): DateRange => {
  const now = new Date();
  const end = new Date();

  if (preset === 'custom' && from) {
    const start = new Date(`${from}T00:00:00.000`);
    const rawEnd = to ? new Date(`${to}T00:00:00.000`) : now;
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(rawEnd.getTime())) {
      const inclusiveEnd = new Date(rawEnd.getTime() + DAY_MS);
      const span = inclusiveEnd.getTime() - start.getTime();
      return {
        start,
        end: inclusiveEnd > now ? now : inclusiveEnd,
        preset: 'custom',
        granularity: span > 92 * DAY_MS ? 'month' : 'day',
      };
    }
  }

  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end, preset: 'today', granularity: 'day' };
    case 'week': {
      // Monday-based week start.
      const start = startOfDay(now);
      const weekday = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - weekday);
      return { start, end, preset: 'week', granularity: 'day' };
    }
    case 'year':
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end,
        preset: 'year',
        granularity: 'month',
      };
    case 'month':
    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end,
        preset: 'month',
        granularity: 'day',
      };
  }
};

export interface TimePoint {
  date: string;
  value: number;
}

/**
 * Groups documents into day/month buckets on a date field and returns a
 * gap-free series (missing buckets are emitted as zero) so charts read
 * correctly without any client-side filling.
 */
export const timeSeries = async (
  model: { aggregate: (p: PipelineStage[]) => { exec: () => Promise<unknown[]> } },
  dateField: string,
  range: DateRange,
  extraMatch: Record<string, unknown> = {},
  /** Defaults to counting documents; pass { $sum: '$field' } to total a field. */
  valueExpression?: { $sum: string | number }
): Promise<TimePoint[]> => {
  const format = range.granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';

  const rows = (await model
    .aggregate([
      { $match: { [dateField]: { $gte: range.start, $lt: range.end }, ...extraMatch } },
      {
        $group: {
          _id: { $dateToString: { format, date: `$${dateField}` } },
          value: valueExpression ?? { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .exec()) as Array<{ _id: string; value: number }>;

  const found = new Map(rows.map((r) => [r._id, r.value]));
  const points: TimePoint[] = [];

  if (range.granularity === 'month') {
    const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    while (cursor < range.end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      points.push({ date: key, value: found.get(key) ?? 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const cursor = startOfDay(range.start);
    while (cursor < range.end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
        cursor.getDate()
      ).padStart(2, '0')}`;
      points.push({ date: key, value: found.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return points;
};

/** Money time series (payments minus refunds) in currency units. */
const revenueSeries = async (range: DateRange): Promise<TimePoint[]> => {
  const format = range.granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';

  const rows = (await Payment.aggregate([
    {
      $match: {
        paidAt: { $gte: range.start, $lt: range.end },
        status: { $ne: 'failed' },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format, date: '$paidAt' } },
        value: {
          $sum: {
            $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ])) as Array<{ _id: string; value: number }>;

  const found = new Map(rows.map((r) => [r._id, fromCents(toCents(r.value))]));
  const base = await timeSeries(Payment, 'paidAt', range, { status: { $ne: 'failed' } });
  return base.map((p) => ({ date: p.date, value: found.get(p.date) ?? 0 }));
};

export interface AnalyticsOverview {
  range: { start: string; end: string; preset: RangePreset; granularity: 'day' | 'month' };
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

/**
 * One aggregation pass for the whole dashboard — a single request rather
 * than a dozen. KPIs that describe a period respect the range; those
 * that describe current state (inpatients, outstanding) do not.
 */
export const getAnalyticsOverview = async (range: DateRange): Promise<AnalyticsOverview> => {
  const inRange = { $gte: range.start, $lt: range.end };

  const [
    totalPatients,
    totalDoctors,
    totalAppointments,
    completedConsultations,
    pharmacyDispensings,
    laboratoryOrders,
    currentInpatients,
    revenueRows,
    outstandingRows,
    appointments,
    registrations,
    revenue,
    consultations,
    pharmacy,
    laboratory,
    admissions,
    discharges,
  ] = await Promise.all([
    Patient.countDocuments({}),
    Doctor.countDocuments({ status: 'active' }),
    Appointment.countDocuments({ createdAt: inRange }),
    Consultation.countDocuments({ status: 'completed', consultationDate: inRange }),
    DispensingRecord.countDocuments({ createdAt: inRange }),
    LabOrder.countDocuments({ orderedAt: inRange }),
    Admission.countDocuments({ status: { $in: ACTIVE_ADMISSION_STATUSES } }),
    Payment.aggregate([
      { $match: { paidAt: inRange, status: { $ne: 'failed' } } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'],
            },
          },
        },
      },
    ]),
    Invoice.aggregate([
      { $match: { invoiceStatus: 'issued' } },
      { $group: { _id: null, total: { $sum: '$dueAmount' } } },
    ]),
    timeSeries(Appointment, 'createdAt', range),
    timeSeries(Patient, 'createdAt', range),
    revenueSeries(range),
    timeSeries(Consultation, 'consultationDate', range),
    timeSeries(DispensingRecord, 'createdAt', range),
    timeSeries(LabOrder, 'orderedAt', range),
    timeSeries(Admission, 'admissionDate', range),
    timeSeries(Admission, 'dischargeDate', range, { status: 'discharged' }),
  ]);

  return {
    range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      preset: range.preset,
      granularity: range.granularity,
    },
    kpis: {
      totalPatients,
      totalDoctors,
      totalAppointments,
      completedConsultations,
      pharmacyDispensings,
      laboratoryOrders,
      currentInpatients,
      totalRevenue: fromCents(
        toCents((revenueRows[0] as { total?: number } | undefined)?.total ?? 0)
      ),
      outstandingPayments: fromCents(
        toCents((outstandingRows[0] as { total?: number } | undefined)?.total ?? 0)
      ),
    },
    series: {
      appointments,
      registrations,
      revenue,
      consultations,
      pharmacy,
      laboratory,
      admissions,
      discharges,
    },
  };
};

/** Current bed occupancy — shared by the dashboard and inpatient report. */
export const getBedOccupancy = async (): Promise<{
  totalBeds: number;
  availableBeds: number;
  occupiedBeds: number;
  occupancyRate: number;
}> => {
  const [totalBeds, availableBeds, occupiedBeds] = await Promise.all([
    Bed.countDocuments({}),
    Bed.countDocuments({ status: 'available' }),
    Bed.countDocuments({ status: 'occupied' }),
  ]);

  return {
    totalBeds,
    availableBeds,
    occupiedBeds,
    occupancyRate: totalBeds === 0 ? 0 : Math.round((occupiedBeds / totalBeds) * 1000) / 10,
  };
};
