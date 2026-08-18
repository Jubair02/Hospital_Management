import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCategories,
  getMedicines,
  updateMedicineStatus,
  type MedicinesQuery,
} from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import type { Medicine, MedicineCategory, Pagination as PaginationInfo } from '../../types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';
import MedicineFormModal from '../../components/pharmacy/MedicineFormModal';
import PageHeader from '../../components/ui/PageHeader';

export default function MedicinesPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [categories, setCategories] = useState<MedicineCategory[]>([]);
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
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load categories.')));
  }, []);

  const hasFilters = Boolean(search || categoryFilter || statusFilter || lowOnly);

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategoryFilter('');
    setStatusFilter('');
    setLowOnly(false);
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: MedicinesQuery = {
        page,
        limit: 10,
        search: search || undefined,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        ...(lowOnly ? { stock: 'low' as const } : {}),
      };
      const data = await getMedicines(params);
      setMedicines(data.medicines);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load medicines.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, statusFilter, lowOnly]);

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

  const handleToggleStatus = async (m: Medicine) => {
    setTogglingId(m._id);
    try {
      await updateMedicineStatus(m._id, m.status === 'active' ? 'inactive' : 'active');
      flash(`${m.name} ${m.status === 'active' ? 'deactivated' : 'activated'}.`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update the medicine.'));
    } finally {
      setTogglingId(null);
    }
  };

  const columns: Column<Medicine>[] = [
    {
      key: 'medicineId',
      header: 'ID',
      render: (m) => <span className="font-medium text-brand-800">{m.medicineId}</span>,
    },
    {
      key: 'name',
      header: 'Medicine',
      render: (m) => (
        <div>
          <p className="font-medium text-slate-800">
            {m.name} {m.strength && <span className="text-slate-500">{m.strength}</span>}
          </p>
          <p className="text-slate-500">
            {[m.genericName, m.brandName].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (m) =>
        typeof m.category === 'object' && m.category ? m.category.name : '—',
    },
    { key: 'dosageForm', header: 'Form', render: (m) => <span className="capitalize">{m.dosageForm}</span> },
    {
      key: 'stock',
      header: 'Stock',
      render: (m) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">{m.totalStock ?? 0}</span>
          {m.lowStock && <Badge tone="red">Low</Badge>}
        </div>
      ),
    },
    {
      key: 'prescriptionRequired',
      header: 'Rx',
      render: (m) =>
        m.prescriptionRequired ? <Badge tone="brand">Rx</Badge> : <Badge tone="slate">OTC</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) =>
        m.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (m) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(m);
              setFormOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant={m.status === 'active' ? 'danger' : 'secondary'}
            size="sm"
            loading={togglingId === m._id}
            onClick={() => handleToggleStatus(m)}
          >
            {m.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medicines"
        subtitle="Pharmacy catalog and stock levels."
        actions={
          <div className="flex gap-2">
            <Link to="/pharmacy/categories">
              <Button variant="secondary">Categories</Button>
            </Link>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add medicine
            </Button>
          </div>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <FilterBar
        total={pagination.total}
        noun="medicine"
        active={hasFilters}
        loading={loading}
        onClear={clearFilters}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Search name, generic, brand, ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search medicines"
            className="sm:col-span-2"
          />
          <Select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            options={categories.map((c) => ({ value: c._id, label: c.name }))}
            placeholder="All categories"
          />
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            placeholder="All statuses"
          />
          {/* A toggle rather than a bare checkbox: at this size it has to sit
              on the control line beside the selects, not float against it. */}
          <button
            type="button"
            aria-pressed={lowOnly}
            onClick={() => {
              setLowOnly(!lowOnly);
              setPage(1);
            }}
            className={`flex min-h-[2.625rem] items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors duration-200 ${
              lowOnly
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-line bg-white text-slate-600 hover:border-line-strong hover:text-slate-900'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${lowOnly ? 'bg-amber-500' : 'bg-slate-300'}`}
            />
            Low stock only
          </button>
        </div>
      </FilterBar>

      <Table
        columns={columns}
        rows={medicines}
        loading={loading}
        emptyState={
          <EmptyState
            title="No medicines found"
            description="Try changing your search or filter, or add the first medicine."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Add medicine
              </Button>
            }
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

      <MedicineFormModal
        open={formOpen}
        medicine={editing}
        categories={categories}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(saved, wasEdit) => {
          setFormOpen(false);
          setEditing(null);
          flash(wasEdit ? `${saved.name} updated.` : `${saved.name} added to the catalog.`);
          load();
        }}
      />
    </div>
  );
}
