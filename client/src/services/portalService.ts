import api from './api';
import type {
  ApiResponse,
  Pagination,
  Patient,
  PortalAdmission,
  PortalAppointment,
  PortalBookingPayload,
  PortalBookingSlot,
  PortalDashboard,
  PortalDepartment,
  PortalDispensing,
  PortalDoctor,
  PortalFulfillment,
  PortalInvoice,
  PortalInvoiceDetail,
  PortalLabOrder,
  PortalLabResult,
  PortalMedicalRecord,
  PortalPayment,
  PortalPrescriptionRecord,
  PortalProfilePayload,
} from '../types';

/** Typed wrappers for /api/patient — the patient self-service portal. */

export const getDashboard = async (): Promise<PortalDashboard> => {
  const { data } = await api.get<ApiResponse<PortalDashboard>>('/patient/dashboard');
  return data.data;
};

export const getProfile = async (): Promise<Patient> => {
  const { data } = await api.get<ApiResponse<{ patient: Patient }>>('/patient/profile');
  return data.data.patient;
};

export const updateProfile = async (payload: PortalProfilePayload): Promise<Patient> => {
  const { data } = await api.patch<ApiResponse<{ patient: Patient }>>('/patient/profile', payload);
  return data.data.patient;
};

// --- Appointments ---

export interface PortalAppointmentsData {
  appointments: PortalAppointment[];
  pagination: Pagination;
}

export const getAppointments = async (
  params: { status?: string; page?: number; limit?: number } = {}
): Promise<PortalAppointmentsData> => {
  const { data } = await api.get<ApiResponse<PortalAppointmentsData>>('/patient/appointments', {
    params,
  });
  return data.data;
};

export const getAppointment = async (id: string): Promise<PortalAppointment> => {
  const { data } = await api.get<ApiResponse<{ appointment: PortalAppointment }>>(
    `/patient/appointments/${id}`
  );
  return data.data.appointment;
};

export const bookAppointment = async (
  payload: PortalBookingPayload
): Promise<PortalAppointment> => {
  const { data } = await api.post<ApiResponse<{ appointment: PortalAppointment }>>(
    '/patient/appointments',
    payload
  );
  return data.data.appointment;
};

export const cancelAppointment = async (id: string): Promise<PortalAppointment> => {
  const { data } = await api.patch<ApiResponse<{ appointment: PortalAppointment }>>(
    `/patient/appointments/${id}/cancel`
  );
  return data.data.appointment;
};

// --- Booking support ---

export const getBookingDepartments = async (): Promise<PortalDepartment[]> => {
  const { data } = await api.get<ApiResponse<{ departments: PortalDepartment[] }>>(
    '/patient/booking/departments'
  );
  return data.data.departments;
};

export const getBookingDoctors = async (departmentId: string): Promise<PortalDoctor[]> => {
  const { data } = await api.get<ApiResponse<{ doctors: PortalDoctor[] }>>(
    '/patient/booking/doctors',
    { params: { departmentId } }
  );
  return data.data.doctors;
};

export const getBookingSlots = async (
  doctorId: string,
  date: string
): Promise<PortalBookingSlot[]> => {
  const { data } = await api.get<ApiResponse<{ slots: PortalBookingSlot[] }>>(
    '/patient/booking/slots',
    { params: { doctorId, date } }
  );
  return data.data.slots;
};

// --- Records ---

export interface PortalMedicalRecordsData {
  consultations: PortalMedicalRecord[];
  medicalHistory: string[];
  allergies: string[];
  pagination: Pagination;
}

export const getMedicalRecords = async (
  params: { page?: number; limit?: number } = {}
): Promise<PortalMedicalRecordsData> => {
  const { data } = await api.get<ApiResponse<PortalMedicalRecordsData>>(
    '/patient/medical-records',
    { params }
  );
  return data.data;
};

export const getMedicalRecord = async (id: string): Promise<PortalMedicalRecord> => {
  const { data } = await api.get<ApiResponse<{ consultation: PortalMedicalRecord }>>(
    `/patient/medical-records/${id}`
  );
  return data.data.consultation;
};

export interface PortalPrescriptionsData {
  records: PortalPrescriptionRecord[];
  pagination: Pagination;
}

export const getPrescriptions = async (
  params: { page?: number; limit?: number } = {}
): Promise<PortalPrescriptionsData> => {
  const { data } = await api.get<ApiResponse<PortalPrescriptionsData>>('/patient/prescriptions', {
    params,
  });
  return data.data;
};

export interface PortalLaboratoryData {
  orders: PortalLabOrder[];
  results: PortalLabResult[];
  pagination: Pagination;
}

export const getLaboratory = async (
  params: { page?: number; limit?: number } = {}
): Promise<PortalLaboratoryData> => {
  const { data } = await api.get<ApiResponse<PortalLaboratoryData>>('/patient/laboratory', {
    params,
  });
  return data.data;
};

export interface PortalMedicationsData {
  fulfillments: PortalFulfillment[];
  dispensings: PortalDispensing[];
  pagination: Pagination;
}

export const getMedications = async (
  params: { page?: number; limit?: number } = {}
): Promise<PortalMedicationsData> => {
  const { data } = await api.get<ApiResponse<PortalMedicationsData>>('/patient/medications', {
    params,
  });
  return data.data;
};

// --- Billing & admission ---

export interface PortalInvoicesData {
  invoices: PortalInvoice[];
  pagination: Pagination;
}

export const getInvoices = async (
  params: { page?: number; limit?: number } = {}
): Promise<PortalInvoicesData> => {
  const { data } = await api.get<ApiResponse<PortalInvoicesData>>('/patient/billing', { params });
  return data.data;
};

export interface PortalInvoiceData {
  invoice: PortalInvoiceDetail;
  payments: PortalPayment[];
}

export const getInvoice = async (id: string): Promise<PortalInvoiceData> => {
  const { data } = await api.get<ApiResponse<PortalInvoiceData>>(`/patient/billing/${id}`);
  return data.data;
};

export interface PortalAdmissionsData {
  current: PortalAdmission | null;
  history: PortalAdmission[];
}

export const getAdmissions = async (): Promise<PortalAdmissionsData> => {
  const { data } = await api.get<ApiResponse<PortalAdmissionsData>>('/patient/admission');
  return data.data;
};
