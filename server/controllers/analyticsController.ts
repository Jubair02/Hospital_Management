import type { Types } from 'mongoose';
import Doctor from '../models/Doctor.js';
import { getAnalyticsOverview, resolveRange, type DateRange } from '../services/analyticsService.js';
import {
  buildAppointmentReport,
  buildPatientReport,
  buildClinicalReport,
  buildPharmacyReport,
  buildLaboratoryReport,
  buildBillingReport,
  buildInpatientReport,
  type NamedCount,
  type ReportScope,
} from '../services/reportsService.js';
import { toCsv, csvFilename, type CsvSection } from '../utils/csv.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const rangeFromQuery = (query: Record<string, unknown>): DateRange =>
  resolveRange(queryString(query.range), queryString(query.from), queryString(query.to));

/**
 * Doctors may only ever see their own clinical/appointment activity —
 * the scope is derived from their profile, never from query params.
 */
const scopeFor = async (user: { _id: Types.ObjectId; role: string }): Promise<ReportScope> => {
  if (user.role !== 'doctor') return {};
  const profile = await Doctor.findOne({ userId: user._id }).select('_id').lean();
  if (!profile) throw new ApiError(403, 'No doctor profile is linked to your account.');
  return { doctorId: profile._id };
};

const wantsCsv = (query: Record<string, unknown>): boolean =>
  queryString(query.format)?.toLowerCase() === 'csv';

const countSection = (title: string, rows: NamedCount[]): CsvSection => ({
  title,
  headers: ['Label', 'Count'],
  rows: rows.map((r) => [r.label, r.count]),
});

const summarySection = (summary: Record<string, number>): CsvSection => ({
  title: 'Summary',
  headers: ['Metric', 'Value'],
  rows: Object.entries(summary).map(([key, value]) => [
    key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    value,
  ]),
});

const seriesSection = (title: string, points: Array<{ date: string; value: number }>): CsvSection => ({
  title,
  headers: ['Date', 'Value'],
  rows: points.map((p) => [p.date, p.value]),
});

/** Sends the report as CSV honoring the same filters as the JSON view. */
const sendCsv = (
  res: { setHeader: (k: string, v: string) => void; send: (body: string) => void },
  report: string,
  range: DateRange,
  sections: CsvSection[]
): void => {
  const meta: CsvSection = {
    title: `${report.charAt(0).toUpperCase() + report.slice(1)} report`,
    headers: ['Range', 'From', 'To', 'Generated'],
    rows: [[range.preset, range.start.toISOString(), range.end.toISOString(), new Date()]],
  };

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${csvFilename(report)}"`);
  res.send(toCsv([meta, ...sections]));
};

// ---------------------------------------------------------------------------
// Analytics overview
// ---------------------------------------------------------------------------

export const getOverview = asyncHandler(async (req, res) => {
  const range = rangeFromQuery(req.query as Record<string, unknown>);
  const overview = await getAnalyticsOverview(range);

  res.json({ success: true, message: 'Analytics overview fetched', data: overview });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const getAppointmentReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const range = rangeFromQuery(query);
  const scope = await scopeFor(req.user!);

  const report = await buildAppointmentReport(
    range,
    {
      doctorId: queryString(query.doctorId),
      departmentId: queryString(query.departmentId),
      status: queryString(query.status),
    },
    scope
  );

  if (wantsCsv(query)) {
    sendCsv(res, 'appointments', range, [
      summarySection(report.summary),
      countSection('Appointments by doctor', report.byDoctor),
      countSection('Appointments by department', report.byDepartment),
      seriesSection('Appointments over time', report.series),
    ]);
    return;
  }

  res.json({ success: true, message: 'Appointment report fetched', data: report });
});

export const getPatientReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const range = rangeFromQuery(query);
  const report = await buildPatientReport(range);

  if (wantsCsv(query)) {
    sendCsv(res, 'patients', range, [
      summarySection(report.summary),
      countSection('Patients by gender', report.byGender),
      countSection('Patients by age group', report.byAgeGroup),
      seriesSection('Registrations over time', report.series),
    ]);
    return;
  }

  res.json({ success: true, message: 'Patient report fetched', data: report });
});

export const getClinicalReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const range = rangeFromQuery(query);
  const scope = await scopeFor(req.user!);

  const report = await buildClinicalReport(
    range,
    { doctorId: queryString(query.doctorId), departmentId: queryString(query.departmentId) },
    scope
  );

  if (wantsCsv(query)) {
    sendCsv(res, 'clinical', range, [
      summarySection(report.summary),
      countSection('Consultations by doctor', report.byDoctor),
      countSection('Consultations by department', report.byDepartment),
      countSection('Recorded diagnoses', report.topDiagnoses),
      seriesSection('Consultations over time', report.series),
    ]);
    return;
  }

  res.json({ success: true, message: 'Clinical report fetched', data: report });
});

export const getPharmacyReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const range = rangeFromQuery(query);
  const report = await buildPharmacyReport(range);

  if (wantsCsv(query)) {
    sendCsv(res, 'pharmacy', range, [
      summarySection(report.summary),
      countSection('Most dispensed medicines (units)', report.topMedicines),
      {
        title: 'Low stock',
        headers: ['Medicine', 'Usable stock', 'Reorder level'],
        rows: report.lowStock.map((r) => [r.label, r.count, r.reorderLevel]),
      },
      seriesSection('Dispensing events over time', report.series),
    ]);
    return;
  }

  res.json({ success: true, message: 'Pharmacy report fetched', data: report });
});

export const getLaboratoryReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const range = rangeFromQuery(query);
  const report = await buildLaboratoryReport(range, { status: queryString(query.status) });

  if (wantsCsv(query)) {
    sendCsv(res, 'laboratory', range, [
      summarySection(report.summary),
      countSection('Tests by category', report.byCategory),
      countSection('Most requested tests', report.topTests),
      seriesSection('Lab orders over time', report.series),
    ]);
    return;
  }

  res.json({ success: true, message: 'Laboratory report fetched', data: report });
});

export const getBillingReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const range = rangeFromQuery(query);
  const report = await buildBillingReport(range, {
    method: queryString(query.method),
    invoiceStatus: queryString(query.invoiceStatus),
  });

  if (wantsCsv(query)) {
    sendCsv(res, 'billing', range, [
      summarySection(report.summary),
      {
        title: 'Payments by method',
        headers: ['Method', 'Payments', 'Amount'],
        rows: report.byMethod.map((r) => [r.label, r.count, r.amount]),
      },
      seriesSection('Payments over time', report.series),
    ]);
    return;
  }

  res.json({ success: true, message: 'Billing report fetched', data: report });
});

export const getInpatientReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const range = rangeFromQuery(query);
  const report = await buildInpatientReport(range);

  if (wantsCsv(query)) {
    sendCsv(res, 'inpatient', range, [
      summarySection(report.summary),
      {
        title: 'By ward',
        headers: ['Ward', 'Inpatients', 'Occupied beds', 'Total beds'],
        rows: report.byWard.map((r) => [r.label, r.count, r.occupied, r.total]),
      },
      seriesSection('Admissions over time', report.admissionSeries),
      seriesSection('Discharges over time', report.dischargeSeries),
    ]);
    return;
  }

  res.json({ success: true, message: 'Inpatient report fetched', data: report });
});
