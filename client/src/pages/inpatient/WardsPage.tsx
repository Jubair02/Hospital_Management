import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import {
  createWard,
  getWards,
  updateWard,
  updateWardStatus,
} from '../../services/inpatientService';
import { getDepartments } from '../../services/departmentService';
import { getErrorMessage } from '../../services/api';
import { WARD_TYPES, type Department, type Ward, type Pagination as PaginationInfo } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import PageHeader from '../../components/ui/PageHeader';
import BackLink from '../../components/ui/BackLink';
import { canViewInpatientDashboard } from '../../utils/permissions';

interface FormState {
  name: string;
  type: string;
  department: string;
  floor: string;
  description: string;
}

const emptyForm: FormState = { name: '', type: '', department: '', floor: '', description: '' };

export default function WardsPage() {
  const { role } = useAuth();
  const manage = role === 'admin';

  const [wards, setWards] = useState<Ward[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Ward | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (manage) {
      getDepartments()
        .then(setDepartments)
        .catch(() => {});
    }
  }, [manage]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getWards({
        page,
        limit: 10,
        search: search || undefined,
        type: typeFilter || undefined,
      });
      setWards(data.wards);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load wards.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const openForm = (ward: Ward | null) => {
    setEditing(ward);
    setForm(
      ward
        ? {
            name: ward.name,
            type: ward.type,
            department:
              typeof ward.department === 'object' && ward.department ? ward.department._id : '',
            floor: ward.floor ?? '',
            description: ward.description ?? '',
          }
        : emptyForm
    );
    setFormError('');
    setSaving(false);
    setFormOpen(true);
  };

  const setField =
    (name: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [name]: e.target.value }));
    };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name.trim() || !form.type) {
      setFormError('Ward name and type are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        department: form.department || undefined,
        floor: form.floor.trim() || undefined,
        description: form.description.trim() || undefined,
      };
      const saved = editing ? await updateWard(editing._id, payload) : await createWard(payload);
      setFormOpen(false);
      flash(editing ? `${saved.name} updated.` : `${saved.name} created.`);
      load();
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const handleToggle = async (w: Ward) => {
    try {
      await updateWardStatus(w._id, w.status === 'active' ? 'inactive' : 'active');
      flash(`${w.name} ${w.status === 'active' ? 'deactivated' : 'activated'}.`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update the ward.'));
    }
  };

  const columns: Column<Ward>[] = [
    {
      key: 'wardId',
      header: 'Ward',
      render: (w) => (
        <div>
          <Link
            to={`/inpatient/wards/${w._id}`}
            className="font-medium text-brand-800 hover:underline"
          >
            {w.name}
          </Link>
          <p className="text-slate-500">{w.wardId}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (w) => <span className="uppercase">{w.type}</span> },
    {
      key: 'department',
      header: 'Department',
      render: (w) =>
        typeof w.department === 'object' && w.department ? w.department.name : '—',
    },
    { key: 'floor', header: 'Floor', render: (w) => w.floor || '—' },
    {
      key: 'beds',
      header: 'Beds',
      render: (w) => {
        const s = w.bedSummary ?? { total: 0 };
        return (
          <span>
            <span className="font-semibold text-emerald-700">{s.available ?? 0}</span>
            <span className="text-slate-400"> free / {s.total ?? 0}</span>
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (w) =>
        w.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (w) => (
        <div className="flex justify-end gap-2">
          <Link to={`/inpatient/wards/${w._id}`}>
            <Button variant="ghost" size="sm">
              Open
            </Button>
          </Link>
          {manage && (
            <>
              <Button variant="secondary" size="sm" onClick={() => openForm(w)}>
                Edit
              </Button>
              <Button
                variant={w.status === 'active' ? 'danger' : 'secondary'}
                size="sm"
                onClick={() => handleToggle(w)}
              >
                {w.status === 'active' ? 'Deactivate' : 'Activate'}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  // Read from the live inputs so the control appears on the keystroke
  // rather than after the search debounce.
  const hasFilters = Boolean(searchInput || typeFilter);

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setTypeFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {canViewInpatientDashboard(role) && (
          <BackLink to="/inpatient" label="Inpatient" />
        )}

        <PageHeader
          title="Wards"
          subtitle="Hospital wards and bed availability."
          actions={
            <>
              {manage && <Button onClick={() => openForm(null)}>Add ward</Button>}
            </>
          }
        />
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card padded={false}>
        <div className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              placeholder="Search ward name or ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search wards"
            />
            <Select
              aria-label="Filter by type"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              options={WARD_TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))}
              placeholder="All types"
            />
          </div>
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
            <span aria-live="polite">
              {loading
                ? 'Searching\u2026'
                : `${pagination.total.toLocaleString()} ${
                    pagination.total === 1 ? 'ward matches' : 'wards match'
                  }`}
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="font-semibold text-brand-700 transition-colors duration-200 hover:text-brand-800"
            >
              Clear filters
            </button>
          </div>
        )}
      </Card>

      <Table
        columns={columns}
        rows={wards}
        loading={loading}
        emptyState={
          <EmptyState
            title="No wards found"
            description={manage ? 'Add the first ward to get started.' : 'No wards configured yet.'}
            action={manage && <Button size="sm" onClick={() => openForm(null)}>Add ward</Button>}
          />
        }
        footer={
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            disabled={loading}
          />
        }
      />

      <Modal
        open={formOpen}
        onClose={saving ? undefined : () => setFormOpen(false)}
        title={editing ? 'Edit ward' : 'Add ward'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="ward-form" loading={saving}>
              {editing ? 'Save changes' : 'Create ward'}
            </Button>
          </>
        }
      >
        <form id="ward-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Name" value={form.name} onChange={setField('name')} autoFocus />
            <Select
              label="Type"
              value={form.type}
              onChange={setField('type')}
              options={WARD_TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))}
              placeholder="Select a type"
            />
            <Select
              label="Department"
              value={form.department}
              onChange={setField('department')}
              options={departments.map((d) => ({ value: d._id, label: d.name }))}
              placeholder="None"
            />
            <Input label="Floor" value={form.floor} onChange={setField('floor')} />
          </div>
          <Textarea
            label="Description"
            value={form.description}
            onChange={setField('description')}
            rows={2}
            hint="Optional"
          />
        </form>
      </Modal>
    </div>
  );
}
