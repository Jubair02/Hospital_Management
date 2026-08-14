import { useCallback, useEffect, useState } from 'react';
import {
  getDepartments,
  updateDepartmentStatus,
} from '../../services/departmentService';
import { getErrorMessage } from '../../services/api';
import type { Department } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DepartmentFormModal from '../../components/departments/DepartmentFormModal';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDepartments(await getDepartments());
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load departments.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleSaved = (saved: Department, wasEdit: boolean) => {
    setFormOpen(false);
    setEditing(null);
    flash(wasEdit ? `${saved.name} updated.` : `${saved.name} created.`);
    load();
  };

  const handleToggle = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    try {
      const updated = await updateDepartmentStatus(
        confirmTarget._id,
        confirmTarget.status === 'active' ? 'inactive' : 'active'
      );
      setDepartments((list) => list.map((d) => (d._id === updated._id ? updated : d)));
      flash(`${updated.name} ${updated.status === 'active' ? 'activated' : 'deactivated'}.`);
      setConfirmTarget(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update the department.'));
      setConfirmTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Department>[] = [
    {
      key: 'departmentId',
      header: 'ID',
      render: (d) => <span className="font-medium text-brand-800">{d.departmentId}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (d) => (
        <div>
          <p className="font-medium text-slate-800">{d.name}</p>
          {d.description && <p className="text-slate-500">{d.description}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) =>
        d.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (d) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(d);
              setFormOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant={d.status === 'active' ? 'danger' : 'secondary'}
            size="sm"
            onClick={() => setConfirmTarget(d)}
          >
            {d.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Departments</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hospital departments used for doctor assignment and booking.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Add department
        </Button>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <Table
          columns={columns}
          rows={departments}
          loading={loading}
          emptyState={
            <EmptyState
              title="No departments yet"
              description="Add departments like Cardiology or Pediatrics so doctors can be assigned to them."
              action={
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  Add department
                </Button>
              }
            />
          }
        />
      </Card>

      <DepartmentFormModal
        open={formOpen}
        department={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={confirmTarget?.status === 'active' ? 'Deactivate department' : 'Activate department'}
        confirmLabel={confirmTarget?.status === 'active' ? 'Deactivate' : 'Activate'}
        tone={confirmTarget?.status === 'active' ? 'danger' : 'primary'}
        busy={busy}
        onConfirm={handleToggle}
        onCancel={() => setConfirmTarget(null)}
      >
        {confirmTarget?.status === 'active' ? (
          <p>
            {confirmTarget?.name} will be hidden from booking. Departments with active doctors or
            open appointments cannot be deactivated. Nothing is deleted.
          </p>
        ) : (
          <p>{confirmTarget?.name} will become available again.</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
