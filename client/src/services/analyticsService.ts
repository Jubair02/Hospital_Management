import api from './api';
import type {
  AnalyticsOverview,
  ApiResponse,
  AppointmentReport,
  BillingReportData,
  ClinicalReport,
  InpatientReportData,
  LaboratoryReportData,
  PatientReport,
  PharmacyReportData,
  ReportFilters,
} from '../types';

/** Query params shared by the dashboard and every report. */
const rangeParams = (filters: ReportFilters): Record<string, string> => {
  const params: Record<string, string> = {};
  if (filters.range) params.range = filters.range;
  if (filters.range === 'custom') {
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
  }
  return params;
};

export const getAnalyticsOverview = async (
  filters: ReportFilters = {}
): Promise<AnalyticsOverview> => {
  const { data } = await api.get<ApiResponse<AnalyticsOverview>>('/analytics/overview', {
    params: rangeParams(filters),
  });
  return data.data;
};

export interface AppointmentReportFilters extends ReportFilters {
  doctorId?: string;
  departmentId?: string;
  status?: string;
}

export const getAppointmentReport = async (
  filters: AppointmentReportFilters = {}
): Promise<AppointmentReport> => {
  const { data } = await api.get<ApiResponse<AppointmentReport>>('/reports/appointments', {
    params: {
      ...rangeParams(filters),
      ...(filters.doctorId ? { doctorId: filters.doctorId } : {}),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
  });
  return data.data;
};

export const getPatientReport = async (filters: ReportFilters = {}): Promise<PatientReport> => {
  const { data } = await api.get<ApiResponse<PatientReport>>('/reports/patients', {
    params: rangeParams(filters),
  });
  return data.data;
};

export interface ClinicalReportFilters extends ReportFilters {
  doctorId?: string;
  departmentId?: string;
}

export const getClinicalReport = async (
  filters: ClinicalReportFilters = {}
): Promise<ClinicalReport> => {
  const { data } = await api.get<ApiResponse<ClinicalReport>>('/reports/clinical', {
    params: {
      ...rangeParams(filters),
      ...(filters.doctorId ? { doctorId: filters.doctorId } : {}),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    },
  });
  return data.data;
};

export const getPharmacyReport = async (
  filters: ReportFilters = {}
): Promise<PharmacyReportData> => {
  const { data } = await api.get<ApiResponse<PharmacyReportData>>('/reports/pharmacy', {
    params: rangeParams(filters),
  });
  return data.data;
};

export const getLaboratoryReport = async (
  filters: ReportFilters & { status?: string } = {}
): Promise<LaboratoryReportData> => {
  const { data } = await api.get<ApiResponse<LaboratoryReportData>>('/reports/laboratory', {
    params: { ...rangeParams(filters), ...(filters.status ? { status: filters.status } : {}) },
  });
  return data.data;
};

export const getBillingReport = async (
  filters: ReportFilters & { method?: string; invoiceStatus?: string } = {}
): Promise<BillingReportData> => {
  const { data } = await api.get<ApiResponse<BillingReportData>>('/reports/billing', {
    params: {
      ...rangeParams(filters),
      ...(filters.method ? { method: filters.method } : {}),
      ...(filters.invoiceStatus ? { invoiceStatus: filters.invoiceStatus } : {}),
    },
  });
  return data.data;
};

export const getInpatientReport = async (
  filters: ReportFilters = {}
): Promise<InpatientReportData> => {
  const { data } = await api.get<ApiResponse<InpatientReportData>>('/reports/inpatient', {
    params: rangeParams(filters),
  });
  return data.data;
};

/**
 * Downloads a report as CSV using the same filters as the on-screen view.
 * The server builds the file, so the export always matches what the
 * user's role and filters permit.
 */
export const downloadReportCsv = async (
  report: 'appointments' | 'patients' | 'clinical' | 'pharmacy' | 'laboratory' | 'billing' | 'inpatient',
  filters: Record<string, string | undefined> = {}
): Promise<void> => {
  const params: Record<string, string> = { format: 'csv' };
  for (const [key, value] of Object.entries(filters)) {
    if (value) params[key] = value;
  }

  const response = await api.get(`/reports/${report}`, { params, responseType: 'blob' });

  const blob = new Blob([response.data as BlobPart], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${report}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
