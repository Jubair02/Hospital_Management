import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import {
  dischargePatient,
  getAdmissionById,
  getBeds,
  getWards,
  transferPatient,
} from '../../services/inpatientService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Admission, BedTransfer, HospitalBed, Ward } from '../../types';
import Button from '../../components/ui/Button';
import BackLink from '../../components/ui/BackLink';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import { AdmissionStatusBadge } from '../../components/inpatient/InpatientBadges';

/** One reading in the strip under the patient's name. */
function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

/** A short fact: label left, value right. Wrong shape for prose — see `Field`. */
function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right">
        {value ? (
          <span className="text-slate-800">{value}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </dd>
    </div>
  );
}

/** A fact that is a sentence — a reason for admission, a note. */
function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1.5 text-pretty text-sm leading-relaxed text-slate-800">
        {value || <span className="text-slate-400">Not recorded</span>}
      </dd>
    </div>
  );
}

export default function AdmissionDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { role } = useAuth();
  const canOperate = role === 'admin' || role === 'receptionist';
  const isAdmin = role === 'admin';

  const [admission, setAdmission] = useState<Admission | null>(null);
  const [transfers, setTransfers] = useState<BedTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>(
    () => (location.state as { flash?: string } | null)?.flash ?? ''
  );

  const [transferOpen, setTransferOpen] = useState(false);
  const [wards, setWards] = useState<Ward[]>([]);
  const [transferForm, setTransferForm] = useState({ toWardId: '', toBedId: '', reason: '' });
  const [targetBeds, setTargetBeds] = useState<HospitalBed[]>([]);
  const [confirm, setConfirm] = useState<'discharge' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAdmissionById(id);
      setAdmission(data.admission);
      setTransfers(data.transfers);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this admission.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!transferOpen) return;
    getWards({ status: 'active', limit: 100 })
      .then((data) => setWards(data.wards.filter((w) => w.status === 'active')))
      .catch(() => {});
  }, [transferOpen]);

  useEffect(() => {
    setTransferForm((f) => ({ ...f, toBedId: '' }));
    if (!transferForm.toWardId) {
      setTargetBeds([]);
      return;
    }
    getBeds({ wardId: transferForm.toWardId, status: 'available', limit: 100 })
      .then((data) => setTargetBeds(data.beds))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferForm.toWardId]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleTransfer = async () => {
    if (!admission) return;
    if (!transferForm.toWardId || !transferForm.toBedId) {
      setError('Select the target ward and bed.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await transferPatient({
        admissionId: admission._id,
        toWardId: transferForm.toWardId,
        toBedId: transferForm.toBedId,
        reason: transferForm.reason.trim() || undefined,
      });
      setTransferOpen(false);
      setTransferForm({ toWardId: '', toBedId: '', reason: '' });
      flash('Patient transferred.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to transfer the patient.'));
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async (outcome: 'discharged' | 'cancelled') => {
    if (!admission) return;
    setBusy(true);
    setError('');
    try {
      await dischargePatient({
        admissionId: admission._id,
        outcome: outcome === 'cancelled' ? 'cancelled' : undefined,
      });
      flash(outcome === 'cancelled' ? 'Admission cancelled.' : 'Patient discharged.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <FullPageSpinner label="Loading admission" />;

  if (!admission) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error || 'Admission not found.'}</Alert>
        <Link to="/inpatient/admissions">
          <Button variant="secondary">Back to admissions</Button>
        </Link>
      </div>
    );
  }

  const active = admission.status === 'admitted' || admission.status === 'transferred';

  const patientName = admission.patientId
    ? `${admission.patientId.firstName} ${admission.patientId.lastName}`
    : undefined;
  const admissionTypeLabel =
    admission.admissionType.charAt(0).toUpperCase() + admission.admissionType.slice(1);

  return (
    <div className="space-y-6">
      <BackLink to="/inpatient/admissions" label="Admissions" />

      {/* One surface carrying who, where, and since when. The admission id
          used to be the heading; it is a filing code, and the person in the
          bed is the subject. */}
      <section className="surface-card relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-white"
        />

        <div className="relative p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-xl font-semibold tracking-[-0.014em] text-slate-900 sm:text-2xl">
              {patientName ?? admission.admissionId}
            </h1>
            <AdmissionStatusBadge status={admission.status} />
          </div>

          <p className="mt-1.5 text-sm text-slate-500">
            {admission.patientId && (
              <>
                <Link
                  className="font-medium text-brand-800 transition-colors hover:text-brand-900 hover:underline"
                  to={`/patients/${admission.patientId._id}`}
                >
                  {admission.patientId.patientId}
                </Link>
                {' \u00b7 '}
              </>
            )}
            Reference{' '}
            <span className="font-semibold tabular-nums text-slate-700">
              {admission.admissionId}
            </span>
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4 sm:grid-cols-4">
            <Vital label="Ward" value={admission.wardId?.name ?? 'Not assigned'} />
            <Vital label="Bed" value={admission.bedId?.bedNumber ?? 'Not assigned'} />
            <Vital label="Admitted" value={formatDate(admission.admissionDate)} />
            <Vital
              label={admission.dischargeDate ? 'Discharged' : 'Expected discharge'}
              value={
                admission.dischargeDate
                  ? formatDate(admission.dischargeDate)
                  : admission.expectedDischargeDate
                    ? formatDate(admission.expectedDischargeDate)
                    : 'Not set'
              }
            />
          </dl>
        </div>

        {/* Only the actions — the way back sits above the heading. */}
        {((canOperate && active) || (isAdmin && active)) && (
          <div className="relative flex flex-col gap-2 border-t border-line bg-slate-50/70 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {isAdmin && active && (
              <Button
                variant="dangerGhost"
                className="w-full sm:mr-auto sm:w-auto"
                onClick={() => setConfirm('cancel')}
              >
                Cancel admission
              </Button>
            )}
            {canOperate && active && (
              <>
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => setTransferOpen(true)}
                >
                  Transfer
                </Button>
                <Button className="w-full sm:w-auto" onClick={() => setConfirm('discharge')}>
                  Discharge
                </Button>
              </>
            )}
          </div>
        )}
      </section>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {!active && (
        <Alert tone="info">
          This admission is {admission.status} and read-only. The record is kept permanently.
        </Alert>
      )}

      {/* Prose on the left where it has room to be a sentence; the fixed
          facts on the right. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <Card title="Admission" icon="clipboard">
          <dl className="space-y-5">
            <Field label="Reason for admission" value={admission.reason} />
            <Field label="Notes" value={admission.notes} />
          </dl>
        </Card>

        <Card title="Care team" icon="doctors">
          <dl className="space-y-3">
            <Row label="Type" value={admissionTypeLabel} />
            <Row
              label="Doctor"
              value={
                admission.doctorId
                  ? `Dr. ${admission.doctorId.firstName} ${admission.doctorId.lastName}`
                  : undefined
              }
            />
            <Row label="Ward" value={admission.wardId?.name} />
            <Row label="Bed" value={admission.bedId?.bedNumber} />
            <Row
              label="Admitted by"
              value={
                admission.admittedBy
                  ? `${admission.admittedBy.firstName} ${admission.admittedBy.lastName}`
                  : undefined
              }
            />
          </dl>
        </Card>
      </div>

      <Card title="Transfer history">
        {transfers.length === 0 ? (
          <p className="text-sm text-slate-400">No transfers.</p>
        ) : (
          <ul className="space-y-2">
            {transfers.map((t) => (
              <li key={t._id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-800">
                  {t.transferId} · {formatDate(t.transferredAt)}
                </p>
                <p className="text-slate-600">
                  {t.fromWardId?.name} / {t.fromBedId?.bedNumber} →{' '}
                  <span className="font-medium">
                    {t.toWardId?.name} / {t.toBedId?.bedNumber}
                  </span>
                  {t.transferredBy && (
                    <span className="text-slate-500">
                      {' '}
                      by {t.transferredBy.firstName} {t.transferredBy.lastName}
                    </span>
                  )}
                </p>
                {t.reason && <p className="text-slate-500">“{t.reason}”</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Transfer modal */}
      <Modal
        open={transferOpen}
        onClose={busy ? undefined : () => setTransferOpen(false)}
        title="Transfer patient"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTransferOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={handleTransfer}>
              Transfer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Current: {admission.wardId?.name} / {admission.bedId?.bedNumber}
          </p>
          <Select
            label="Target ward"
            value={transferForm.toWardId}
            onChange={(e) => setTransferForm((f) => ({ ...f, toWardId: e.target.value }))}
            options={wards.map((w) => ({
              value: w._id,
              label: `${w.name} (${w.bedSummary?.available ?? 0} free)`,
            }))}
            placeholder="Select a ward"
          />
          <Select
            label="Target bed"
            value={transferForm.toBedId}
            onChange={(e) => setTransferForm((f) => ({ ...f, toBedId: e.target.value }))}
            options={targetBeds.map((b) => ({
              value: b._id,
              label: `${b.bedNumber}${b.bedType ? ` (${b.bedType})` : ''}`,
            }))}
            placeholder={
              !transferForm.toWardId
                ? 'Choose a ward first'
                : targetBeds.length
                  ? 'Select an available bed'
                  : 'No available beds in this ward'
            }
            disabled={!transferForm.toWardId}
          />
          <Textarea
            label="Reason"
            value={transferForm.reason}
            onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))}
            rows={2}
            hint="Optional"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm === 'discharge' ? 'Discharge patient' : 'Cancel admission'}
        confirmLabel={confirm === 'discharge' ? 'Discharge' : 'Cancel admission'}
        tone={confirm === 'discharge' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={async () => {
          const action = confirm;
          setConfirm(null);
          if (action) await handleEnd(action === 'discharge' ? 'discharged' : 'cancelled');
        }}
        onCancel={() => setConfirm(null)}
      >
        {confirm === 'discharge' ? (
          <p>The patient will be discharged and the bed released. The record is kept permanently.</p>
        ) : (
          <p>The admission will be cancelled (e.g. created in error) and the bed released.</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
