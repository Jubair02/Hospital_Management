import api from './api';
import type {
  AdministrationsListData,
  AdministrationStatus,
  ApiResponse,
  MedicationAdministration,
  NoteCategory,
  NursingNote,
  NursingNotesListData,
  NursingShift,
  Observation,
  ObservationsListData,
  VitalSigns,
} from '../types';

/**
 * The bedside record. Every endpoint here is append-only: a correction is a
 * new entry, because the sequence is the clinical value — three temperatures
 * over six hours say something a single latest figure cannot.
 */

// --- Observations ---

export interface RecordObservationPayload {
  patientId: string;
  vitalSigns?: VitalSigns;
  notes?: string;
  /** Omitted for "now", which is the usual case. */
  recordedAt?: string;
}

export const recordObservation = async (
  payload: RecordObservationPayload
): Promise<Observation> => {
  const { data } = await api.post<ApiResponse<{ observation: Observation }>>(
    '/observations',
    payload
  );
  return data.data.observation;
};

export const getObservations = async (
  params: { patientId?: string; admissionId?: string; page?: number; limit?: number } = {}
): Promise<ObservationsListData> => {
  const { data } = await api.get<ApiResponse<ObservationsListData>>('/observations', { params });
  return data.data;
};

// --- Medication administration ---

export interface RecordAdministrationPayload {
  patientId: string;
  medicineName: string;
  dosage: string;
  route?: string;
  status?: AdministrationStatus;
  notes?: string;
  consultationId?: string;
}

export const recordAdministration = async (
  payload: RecordAdministrationPayload
): Promise<MedicationAdministration> => {
  const { data } = await api.post<ApiResponse<{ administration: MedicationAdministration }>>(
    '/nursing/administrations',
    payload
  );
  return data.data.administration;
};

export const getAdministrations = async (
  params: { patientId?: string; admissionId?: string; page?: number; limit?: number } = {}
): Promise<AdministrationsListData> => {
  const { data } = await api.get<ApiResponse<AdministrationsListData>>(
    '/nursing/administrations',
    { params }
  );
  return data.data;
};

// --- Nursing notes ---

export interface AddNursingNotePayload {
  patientId: string;
  body: string;
  category?: NoteCategory;
  shift?: NursingShift;
}

export const addNursingNote = async (payload: AddNursingNotePayload): Promise<NursingNote> => {
  const { data } = await api.post<ApiResponse<{ note: NursingNote }>>('/nursing/notes', payload);
  return data.data.note;
};

export const getNursingNotes = async (
  params: {
    patientId?: string;
    admissionId?: string;
    category?: NoteCategory;
    page?: number;
    limit?: number;
  } = {}
): Promise<NursingNotesListData> => {
  const { data } = await api.get<ApiResponse<NursingNotesListData>>('/nursing/notes', { params });
  return data.data;
};
