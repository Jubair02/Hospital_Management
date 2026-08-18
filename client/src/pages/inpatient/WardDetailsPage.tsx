import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { canSetBedStatus } from '../../utils/permissions';
import {
  createBed,
  getWardById,
  updateBedStatus,
} from '../../services/inpatientService';
import { getErrorMessage } from '../../services/api';
import type { HospitalBed, Ward } from '../../types';
import Button from '../../components/ui/Button';
import BackLink from '../../components/ui/BackLink';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import { BedStatusBadge } from '../../components/inpatient/InpatientBadges';
import StackedBar from '../../components/charts/StackedBar';

export default function WardDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const manage = role === 'admin';
  /**
   * Whether a bed is free, reserved, or out of service is observed on the
   * ward, and nurses are the staff standing there when it changes — so this is
   * wider than the admissions operations above it, matching the server.
   */
  const canOperate = canSetBedStatus(role);

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
      <BackLink to="/inpatient/wards" label="Wards" />

      {/* The ward's state, not a sentence describing it. Bed counts were a
          run-on line under the title; they are the reason anyone opens this
          page, so they get the same treatment as on the inpatient board. */}
      <section className="surface-card relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-white"
        />

        <div className="relative grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-xl font-semibold tracking-[-0.014em] text-slate-900 sm:text-2xl">
                {ward.name}
              </h1>
              {ward.status === 'active' ? (
                <Badge tone="green">Active</Badge>
              ) : (
                <Badge tone="slate">Inactive</Badge>
              )}
              <Badge tone="brand">{ward.type.toUpperCase()}</Badge>
            </div>

            <p className="mt-1.5 text-sm text-slate-500">
              <span className="font-semibold tabular-nums text-slate-700">{ward.wardId}</span>
              {typeof ward.department === 'object' && ward.department && (
                <> · {ward.department.name}</>
              )}
              {ward.floor && <> · Floor {ward.floor}</>}
            </p>

            {ward.description && (
              <p className="mt-3 max-w-prose text-pretty text-sm leading-relaxed text-slate-600">
                {ward.description}
              </p>
            )}
          </div>

          <div className="lg:border-l lg:border-line lg:pl-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Bed state
              </h2>
              <p className="text-lg font-semibold leading-none tabular-nums text-slate-900">
                {beds.length === 0
                  ? '—'
                  : `${Math.round((occupied / beds.length) * 100)}%`}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {beds.length.toLocaleString()} bed{beds.length === 1 ? '' : 's'} in this ward
            </p>

            <div className="mt-4">
              <StackedBar
                segments={[
                  { label: 'Occupied', count: occupied, tone: 'brand' },
                  { label: 'Available', count: available, tone: 'teal' },
                  { label: 'Other', count: Math.max(0, beds.length - occupied - available), tone: 'slate' },
                ]}
                ariaLabel="Beds in this ward by status"
                emptyMessage="No beds added yet."
              />
            </div>
          </div>
        </div>

        {manage && (
          <div className="relative flex border-t border-line bg-slate-50/70 p-4 sm:justify-end">
            <Button className="w-full sm:w-auto" onClick={() => setBedModalOpen(true)}>
              Add bed
            </Button>
          </div>
        )}
      </section>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Table
        columns={columns}
        rows={beds}
        emptyState={
          <EmptyState
            title="No beds in this ward"
            description={
              manage
                ? 'Add the first bed and it becomes available for admissions.'
                : 'Nothing to show until beds are added.'
            }
            action={
              manage && (
                <Button size="sm" onClick={() => setBedModalOpen(true)}>
                  Add bed
                </Button>
              )
            }
          />
        }
      />

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
