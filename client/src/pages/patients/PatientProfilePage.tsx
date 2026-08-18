import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getPatientById, updatePatientStatus } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import {
  canChangePatientStatus,
  canEditPatient,
  canViewClinical,
  canViewLabOrders,
  canViewNursingRecord,
  canWriteNursingRecord,
  patientsListPath,
} from '../../utils/permissions';
import { calculateAge, formatDate } from '../../utils/date';
import type { Patient, PatientCreator } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Icon from '../../components/ui/icons';
import PatientStatusBadge from '../../components/patients/PatientStatusBadge';
import MedicalHistoryCard from '../../components/patients/MedicalHistoryCard';
import PortalAccountCard from '../../components/patients/PortalAccountCard';
import EmergencyContactCard from '../../components/patients/EmergencyContactCard';
import PatientAppointmentsCard from '../../components/appointments/PatientAppointmentsCard';
import ConsultationHistoryCard from '../../components/consultations/ConsultationHistoryCard';
import NursingRecordCard from '../../components/nursing/NursingRecordCard';
import PatientLabHistoryCard from '../../components/laboratory/PatientLabHistoryCard';
import PatientBillingHistoryCard from '../../components/billing/PatientBillingHistoryCard';
import PatientAdmissionsCard from '../../components/inpatient/PatientAdmissionsCard';

const isCreator = (value: Patient['createdBy']): value is PatientCreator =>
  typeof value === 'object' && value !== null && 'firstName' in value;

const sentenceCase = (value?: string): string | undefined =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : undefined;

/** A short fact: label left, value right. Wrong shape for prose — see `Field`. */
function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right">
        {value ? (
          <span className="text-slate-800">{value}</span>
        ) : (
          <span className="text-slate-400">Not recorded</span>
        )}
      </dd>
    </div>
  );
}

/** A fact that runs to more than a few words — an address, for instance. */
function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-pretty text-sm leading-relaxed text-slate-800">
        {value || <span className="text-slate-400">Not recorded</span>}
      </dd>
    </div>
  );
}

/** One reading in the strip under the patient's name. */
function Vital({ label, value, tone = 'default' }: {
  label: string;
  value: string;
  tone?: 'default' | 'alert';
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-sm font-semibold ${
          tone === 'alert' ? 'text-rose-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

type TabKey =
  | 'overview'
  | 'appointments'
  | 'consultations'
  | 'nursing'
  | 'laboratory'
  | 'admissions'
  | 'billing';

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
  const [tab, setTab] = useState<TabKey>('overview');

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

  const fullName = `${patient.firstName} ${patient.lastName}`;
  const initials = `${patient.firstName[0] ?? ''}${patient.lastName[0] ?? ''}`.toUpperCase();
  const age = patient.age ?? calculateAge(patient.dateOfBirth);
  const allergies = patient.allergies ?? [];

  /**
   * Each history section was a full-width card with its own table and pager,
   * and they stacked. On an administrator's view that made a page thousands of
   * pixels tall where the patient's blood group and the billing ledger were
   * equally far apart. They are peers — different views of one person — so
   * they belong behind tabs, with identity and the facts that matter at a
   * glance staying put above them.
   *
   * Role rules are unchanged: a tab only exists for someone already allowed to
   * see what is inside it.
   */
  const tabs: { key: TabKey; label: string; visible: boolean }[] = [
    { key: 'overview', label: 'Overview', visible: true },
    { key: 'appointments', label: 'Appointments', visible: true },
    { key: 'consultations', label: 'Consultations', visible: canViewClinical(role) },
    { key: 'nursing', label: 'Nursing', visible: canViewNursingRecord(role) },
    { key: 'laboratory', label: 'Laboratory', visible: canViewLabOrders(role) },
    { key: 'admissions', label: 'Admissions', visible: canViewClinical(role) },
    { key: 'billing', label: 'Billing', visible: role === 'admin' || role === 'receptionist' },
  ];
  const visibleTabs = tabs.filter((t) => t.visible);

  // A tab the current role cannot see must never be the one on screen.
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : 'overview';

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {/* Navigation, kept out of the action row — that row changes the
            record, and going back does not. */}
        <Link
          to={patientsListPath(role)}
          className="-ml-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-slate-900"
        >
          <Icon name="chevronLeft" className="h-4 w-4" strokeWidth="2.2" />
          Patients
        </Link>

        <section className="surface-card relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-white"
          />

          <div className="relative p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <span
                aria-hidden="true"
                className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-600 text-lg font-semibold tracking-[0.02em] text-white shadow-md ring-1 ring-inset ring-brand-700/20"
              >
                {initials}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h1 className="text-xl font-semibold tracking-[-0.014em] text-slate-900 sm:text-2xl">
                    {fullName}
                  </h1>
                  <PatientStatusBadge status={patient.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-semibold tabular-nums text-brand-800">
                    {patient.patientId}
                  </span>
                  {' · '}Registered {formatDate(patient.createdAt)}
                </p>
              </div>
            </div>

            {/* The handful of readings someone opening a patient record needs
                before anything else. Allergies sit here rather than three
                sections down, because that is the one a clinician must not
                have to go looking for. */}
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4 sm:grid-cols-4">
              <Vital label="Age" value={`${age} years`} />
              <Vital label="Sex" value={sentenceCase(patient.gender) ?? 'Not recorded'} />
              <Vital
                label="Blood group"
                value={
                  patient.bloodGroup && patient.bloodGroup !== 'unknown'
                    ? patient.bloodGroup
                    : 'Unknown'
                }
              />
              <Vital
                label="Allergies"
                value={allergies.length > 0 ? allergies.join(', ') : 'None recorded'}
                tone={allergies.length > 0 ? 'alert' : 'default'}
              />
            </dl>
          </div>

          {(canEditPatient(role) || canChangePatientStatus(role)) && (
            <div className="relative flex flex-col gap-2 border-t border-line bg-slate-50/70 p-4 sm:flex-row sm:justify-end">
              {canEditPatient(role) && (
                <Link to={`/patients/${patient._id}/edit`}>
                  <Button variant="secondary" className="w-full sm:w-auto">
                    Edit details
                  </Button>
                </Link>
              )}
              {canChangePatientStatus(role) && (
                <Button
                  variant={patient.status === 'active' ? 'dangerGhost' : 'primary'}
                  className="w-full sm:w-auto"
                  onClick={() => setConfirmOpen(true)}
                >
                  {patient.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {/* Wrapping rather than scrolling: six short labels fit two rows on the
          narrowest screen, and a horizontal scroller would hide whichever tab
          fell off the edge. */}
      <div className="border-b border-line">
        <div className="-mb-px flex flex-wrap gap-1" role="group" aria-label="Patient record sections">
          {visibleTabs.map((item) => {
            const selected = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setTab(item.key)}
                className={`min-h-11 border-b-2 px-3 text-sm font-medium transition-colors duration-150 sm:px-4
                  ${
                    selected
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-500 hover:border-line-strong hover:text-slate-800'
                  }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Three columns of short cards on a wide screen rather than two, so
              the set ends level instead of leaving one column hanging. */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Personal" icon="users">
              <dl className="space-y-3">
                <Row label="Date of birth" value={formatDate(patient.dateOfBirth)} />
                <Row label="Age" value={`${age} years`} />
                <Row label="Gender" value={sentenceCase(patient.gender)} />
                <Row label="National ID" value={patient.nationalId} />
                <Row label="Marital status" value={sentenceCase(patient.maritalStatus)} />
                <Row label="Occupation" value={patient.occupation} />
              </dl>
            </Card>

            <Card title="Contact" icon="patients">
              <dl className="space-y-4">
                <Row label="Phone" value={patient.phone} />
                <Row label="Email" value={patient.email} />
                {/* An address is prose, so it gets the full width of the card
                    rather than being right-aligned against its own label. */}
                <Field label="Address" value={patient.address} />
              </dl>
            </Card>

            <EmergencyContactCard patient={patient} />

            <Card title="Registration" icon="clipboard">
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
        </div>
      )}

      {activeTab === 'appointments' && <PatientAppointmentsCard patientMongoId={patient._id} />}

      {/* Clinical timeline — receptionists have no clinical access */}
      {activeTab === 'consultations' && canViewClinical(role) && (
        <ConsultationHistoryCard patientMongoId={patient._id} />
      )}

      {/* The bedside record: observations, doses, and notes */}
      {activeTab === 'nursing' && canViewNursingRecord(role) && (
        <NursingRecordCard
          patientId={patient._id}
          patientName={`${patient.firstName} ${patient.lastName}`}
          canWrite={canWriteNursingRecord(role)}
        />
      )}

      {/* Laboratory history — same clinical visibility rules */}
      {activeTab === 'laboratory' && canViewLabOrders(role) && (
        <PatientLabHistoryCard patientMongoId={patient._id} />
      )}

      {/* Admission history — clinical roles */}
      {activeTab === 'admissions' && canViewClinical(role) && (
        <PatientAdmissionsCard patientMongoId={patient._id} />
      )}

      {/* Billing history — billing staff */}
      {activeTab === 'billing' && (role === 'admin' || role === 'receptionist') && (
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
            {fullName} ({patient.patientId}) will be marked inactive. The record is kept and can
            be reactivated at any time.
          </p>
        ) : (
          <p>
            {fullName} ({patient.patientId}) will be marked active again.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
