import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getPatientById, updatePatientStatus } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import {
  canChangePatientStatus,
  canEditPatient,
  patientsListPath,
} from '../../utils/permissions';
import { calculateAge, formatDate } from '../../utils/date';
import type { Patient, PatientCreator } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import PatientStatusBadge from '../../components/patients/PatientStatusBadge';
import MedicalHistoryCard from '../../components/patients/MedicalHistoryCard';
import PortalAccountCard from '../../components/patients/PortalAccountCard';
import EmergencyContactCard from '../../components/patients/EmergencyContactCard';
import PatientAppointmentsCard from '../../components/appointments/PatientAppointmentsCard';
import ConsultationHistoryCard from '../../components/consultations/ConsultationHistoryCard';
import PatientLabHistoryCard from '../../components/laboratory/PatientLabHistoryCard';
import PatientBillingHistoryCard from '../../components/billing/PatientBillingHistoryCard';
import PatientAdmissionsCard from '../../components/inpatient/PatientAdmissionsCard';
import { canViewClinical, canViewLabOrders } from '../../utils/permissions';

const isCreator = (value: Patient['createdBy']): value is PatientCreator =>
  typeof value === 'object' && value !== null && 'firstName' in value;

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">
        {value ? (
          <span className="text-slate-800">{value}</span>
        ) : (
          <span className="text-slate-400">Not recorded</span>
        )}
      </dd>
    </div>
  );
}

export default function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { role } = useAuth();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>(
    () => (location.state as { flash?: string } | null)?.flash ?? ''
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      setPatient(await getPatientById(id));
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this patient.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async () => {
    if (!patient) return;
    const nextStatus = patient.status === 'active' ? 'inactive' : 'active';

    setStatusBusy(true);
    try {
      const updated = await updatePatientStatus(patient._id, nextStatus);
      setPatient(updated);
      setNotice(
        `${updated.firstName} ${updated.lastName} ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`
      );
      setConfirmOpen(false);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update the patient status.'));
      setConfirmOpen(false);
    } finally {
      setStatusBusy(false);
    }
  };

  if (loading) return <FullPageSpinner label="Loading patient" />;

  if (!patient) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error || 'Patient not found.'}</Alert>
        <Link to={patientsListPath(role)}>
          <Button variant="secondary">Back to patients</Button>
        </Link>
      </div>
    );
  }

  const registeredBy = isCreator(patient.createdBy)
    ? `${patient.createdBy.firstName} ${patient.createdBy.lastName}`
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              {patient.firstName} {patient.lastName}
            </h1>
            <PatientStatusBadge status={patient.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-medium text-brand-800">{patient.patientId}</span>
            {' · '}Registered {formatDate(patient.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={patientsListPath(role)}>
            <Button variant="ghost">Back to list</Button>
          </Link>
          {canEditPatient(role) && (
            <Link to={`/patients/${patient._id}/edit`}>
              <Button variant="secondary">Edit</Button>
            </Link>
          )}
          {canChangePatientStatus(role) && (
            <Button
              variant={patient.status === 'active' ? 'danger' : 'primary'}
              onClick={() => setConfirmOpen(true)}
            >
              {patient.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
          )}
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Personal information">
          <dl className="space-y-3">
            <Row label="Date of birth" value={formatDate(patient.dateOfBirth)} />
            <Row
              label="Age"
              value={`${patient.age ?? calculateAge(patient.dateOfBirth)} years`}
            />
            <Row label="Gender" value={patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)} />
            <Row
              label="Blood group"
              value={patient.bloodGroup === 'unknown' ? undefined : patient.bloodGroup}
            />
            <Row label="National ID" value={patient.nationalId} />
            <Row
              label="Marital status"
              value={
                patient.maritalStatus
                  ? patient.maritalStatus.charAt(0).toUpperCase() + patient.maritalStatus.slice(1)
                  : undefined
              }
            />
            <Row label="Occupation" value={patient.occupation} />
          </dl>
        </Card>

        <Card title="Contact information">
          <dl className="space-y-3">
            <Row label="Phone" value={patient.phone} />
            <Row label="Email" value={patient.email} />
            <Row label="Address" value={patient.address} />
          </dl>
        </Card>

        <EmergencyContactCard patient={patient} />

        <Card title="Registration">
          <dl className="space-y-3">
            <Row label="Patient ID" value={patient.patientId} />
            <Row label="Registered on" value={formatDate(patient.createdAt)} />
            <Row label="Registered by" value={registeredBy} />
            <Row label="Last updated" value={formatDate(patient.updatedAt)} />
          </dl>
        </Card>

        {/* Portal access — same roles that may edit the patient */}
        {canEditPatient(role) && (
          <PortalAccountCard patient={patient} onIssued={setPatient} />
        )}
      </div>

      <MedicalHistoryCard patient={patient} />

      <PatientAppointmentsCard patientMongoId={patient._id} />

      {/* Clinical timeline — receptionists have no clinical access */}
      {canViewClinical(role) && <ConsultationHistoryCard patientMongoId={patient._id} />}

      {/* Laboratory history — same clinical visibility rules */}
      {canViewLabOrders(role) && <PatientLabHistoryCard patientMongoId={patient._id} />}

      {/* Admission history — clinical roles */}
      {canViewClinical(role) && <PatientAdmissionsCard patientMongoId={patient._id} />}

      {/* Billing history — billing staff */}
      {(role === 'admin' || role === 'receptionist') && (
        <PatientBillingHistoryCard patientMongoId={patient._id} />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={patient.status === 'active' ? 'Deactivate patient' : 'Activate patient'}
        confirmLabel={patient.status === 'active' ? 'Deactivate' : 'Activate'}
        tone={patient.status === 'active' ? 'danger' : 'primary'}
        busy={statusBusy}
        onConfirm={handleStatusChange}
        onCancel={() => setConfirmOpen(false)}
      >
        {patient.status === 'active' ? (
          <p>
            {patient.firstName} {patient.lastName} ({patient.patientId}) will be marked inactive.
            The record is kept and can be reactivated at any time.
          </p>
        ) : (
          <p>
            {patient.firstName} {patient.lastName} ({patient.patientId}) will be marked active
            again.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
