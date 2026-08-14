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
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import { AdmissionStatusBadge } from '../../components/inpatient/InpatientBadges';

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">
        {value ? (
          <span className="text-slate-800">{value}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{admission.admissionId}</h1>
            <AdmissionStatusBadge status={admission.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Admitted {formatDate(admission.admissionDate)}
            {admission.patientId && (
              <>
                {' · '}
                <Link
                  className="text-brand-800 hover:underline"
                  to={`/patients/${admission.patientId._id}`}
                >
                  {admission.patientId.firstName} {admission.patientId.lastName} (
                  {admission.patientId.patientId})
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/inpatient/admissions">
            <Button variant="ghost">Back to list</Button>
          </Link>
          {canOperate && active && (
            <>
              <Button variant="secondary" onClick={() => setTransferOpen(true)}>
                Transfer
              </Button>
              <Button onClick={() => setConfirm('discharge')}>Discharge</Button>
            </>
          )}
          {isAdmin && active && (
            <Button variant="danger" onClick={() => setConfirm('cancel')}>
              Cancel admission
            </Button>
          )}
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {!active && (
        <Alert tone="info">
          This admission is {admission.status} and read-only. The record is kept permanently.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Admission">
          <dl className="space-y-3">
            <Row label="Reason" value={admission.reason} />
            <Row label="Type" value={admission.admissionType} />
            <Row label="Admitted" value={formatDate(admission.admissionDate)} />
            <Row
              label="Expected discharge"
              value={admission.expectedDischargeDate ? formatDate(admission.expectedDischargeDate) : undefined}
            />
            <Row
              label="Discharged"
              value={admission.dischargeDate ? formatDate(admission.dischargeDate) : undefined}
            />
            <Row
              label="Admitted by"
              value={
                admission.admittedBy
                  ? `${admission.admittedBy.firstName} ${admission.admittedBy.lastName}`
                  : undefined
              }
            />
            <Row label="Notes" value={admission.notes} />
          </dl>
        </Card>

        <Card title="Location & care">
          <dl className="space-y-3">
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
