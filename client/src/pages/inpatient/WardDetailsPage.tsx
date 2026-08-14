import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import {
  createBed,
  getWardById,
  updateBedStatus,
} from '../../services/inpatientService';
import { getErrorMessage } from '../../services/api';
import type { HospitalBed, Ward } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Table, { type Column } from '../../components/ui/Table';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import { BedStatusBadge } from '../../components/inpatient/InpatientBadges';

export default function WardDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const manage = role === 'admin';
  const canOperate = role === 'admin' || role === 'receptionist';

  const [ward, setWard] = useState<Ward | null>(null);
  const [beds, setBeds] = useState<HospitalBed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [bedModalOpen, setBedModalOpen] = useState(false);
  const [bedNumber, setBedNumber] = useState('');
  const [bedType, setBedType] = useState('');
  const [bedError, setBedError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getWardById(id);
      setWard(data.ward);
      setBeds(data.beds);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this ward.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleAddBed = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ward) return;
    if (!bedNumber.trim()) {
      setBedError('Bed number is required.');
      return;
    }
    setSaving(true);
    try {
      await createBed({
        wardId: ward._id,
        bedNumber: bedNumber.trim(),
        bedType: bedType.trim() || undefined,
      });
      setBedModalOpen(false);
      setBedNumber('');
      setBedType('');
      flash('Bed added.');
      load();
    } catch (err) {
      setBedError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const setStatus = async (bed: HospitalBed, status: string) => {
    try {
      await updateBedStatus(bed._id, status);
      flash(`Bed ${bed.bedNumber} marked ${status}.`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update the bed.'));
    }
  };

  if (loading) return <FullPageSpinner label="Loading ward" />;

  if (!ward) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error || 'Ward not found.'}</Alert>
        <Link to="/inpatient/wards">
          <Button variant="secondary">Back to wards</Button>
        </Link>
      </div>
    );
  }

  const available = beds.filter((b) => b.status === 'available').length;
  const occupied = beds.filter((b) => b.status === 'occupied').length;

  const columns: Column<HospitalBed>[] = [
    {
      key: 'bedNumber',
      header: 'Bed',
      render: (b) => (
        <div>
          <p className="font-medium text-slate-800">{b.bedNumber}</p>
          <p className="text-slate-500">{b.bedId}</p>
        </div>
      ),
    },
    { key: 'bedType', header: 'Type', render: (b) => b.bedType || '—' },
    { key: 'status', header: 'Status', render: (b) => <BedStatusBadge status={b.status} /> },
    {
      key: 'patient',
      header: 'Patient',
      render: (b) =>
        b.currentPatientId ? (
          <Link
            to={`/patients/${b.currentPatientId._id}`}
            className="text-brand-800 hover:underline"
          >
            {b.currentPatientId.firstName} {b.currentPatientId.lastName} (
            {b.currentPatientId.patientId})
          </Link>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (b) =>
        canOperate && b.status !== 'occupied' ? (
          <div className="flex justify-end gap-2">
            {b.status !== 'available' && (
              <Button variant="secondary" size="sm" onClick={() => setStatus(b, 'available')}>
                Mark available
              </Button>
            )}
            {b.status === 'available' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setStatus(b, 'reserved')}>
                  Reserve
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStatus(b, 'maintenance')}>
                  Maintenance
                </Button>
              </>
            )}
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{ward.name}</h1>
            {ward.status === 'active' ? (
              <Badge tone="green">Active</Badge>
            ) : (
              <Badge tone="red">Inactive</Badge>
            )}
            <Badge tone="brand">{ward.type.toUpperCase()}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {ward.wardId}
            {typeof ward.department === 'object' && ward.department && (
              <> · {ward.department.name}</>
            )}
            {ward.floor && <> · Floor {ward.floor}</>}
            {' · '}
            <span className="font-medium text-emerald-700">{available} free</span> /{' '}
            {occupied} occupied / {beds.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/inpatient/wards">
            <Button variant="ghost">Back to wards</Button>
          </Link>
          {manage && <Button onClick={() => setBedModalOpen(true)}>Add bed</Button>}
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card title="Beds">
        <Table
          columns={columns}
          rows={beds}
          emptyState={
            <p className="text-center text-sm text-slate-500">
              No beds in this ward yet{manage ? ' — add the first one.' : '.'}
            </p>
          }
        />
      </Card>

      <Modal
        open={bedModalOpen}
        onClose={saving ? undefined : () => setBedModalOpen(false)}
        title={`Add bed to ${ward.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBedModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="bed-form" loading={saving}>
              Add bed
            </Button>
          </>
        }
      >
        <form id="bed-form" onSubmit={handleAddBed} noValidate className="space-y-4">
          {bedError && <Alert tone="error">{bedError}</Alert>}
          <Input
            label="Bed number"
            value={bedNumber}
            onChange={(e) => setBedNumber(e.target.value)}
            placeholder="A-101"
            autoFocus
          />
          <Select
            label="Bed type"
            value={bedType}
            onChange={(e) => setBedType(e.target.value)}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'electric', label: 'Electric' },
              { value: 'icu', label: 'ICU' },
              { value: 'pediatric', label: 'Pediatric' },
            ]}
            placeholder="Unspecified"
          />
        </form>
      </Modal>
    </div>
  );
}
