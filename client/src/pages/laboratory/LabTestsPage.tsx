import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import useAuth from '../../hooks/useAuth';
import {
  createLabTest,
  getLabCategories,
  getLabTests,
  updateLabTest,
  updateLabTestStatus,
} from '../../services/laboratoryService';
import { getErrorMessage } from '../../services/api';
import { canManageLabCatalog } from '../../utils/permissions';
import {
  LAB_RESULT_TYPES,
  SAMPLE_TYPES,
  type LabCategory,
  type LabResultType,
  type LabTest,
  type Pagination as PaginationInfo,
  type SampleType,
} from '../../types';
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

interface FormState {
  name: string;
  category: string;
  sampleType: SampleType | '';
  price: string;
  resultType: LabResultType;
  unit: string;
  referenceRange: string;
  turnaroundTime: string;
  description: string;
  preparationInstructions: string;
}

const emptyForm: FormState = {
  name: '',
  category: '',
  sampleType: '',
  price: '',
  resultType: 'numeric',
  unit: '',
  referenceRange: '',
  turnaroundTime: '',
  description: '',
  preparationInstructions: '',
};

export default function LabTestsPage() {
  const { role } = useAuth();
  const manage = canManageLabCatalog(role);

  const [tests, setTests] = useState<LabTest[]>([]);
  const [categories, setCategories] = useState<LabCategory[]>([]);
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
  const [sampleFilter, setSampleFilter] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LabTest | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLabCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getLabTests({
        page,
        limit: 10,
        search: search || undefined,
        category: categoryFilter || undefined,
        sampleType: sampleFilter || undefined,
      });
      setTests(data.tests);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load lab tests.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, sampleFilter]);

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

  const openForm = (test: LabTest | null) => {
    setEditing(test);
    setForm(
      test
        ? {
            name: test.name,
            category:
              typeof test.category === 'object' && test.category ? test.category._id : '',
            sampleType: test.sampleType,
            price: String(test.price),
            resultType: test.resultType,
            unit: test.unit ?? '',
            referenceRange: test.referenceRange ?? '',
            turnaroundTime: test.turnaroundTime ?? '',
            description: test.description ?? '',
            preparationInstructions: test.preparationInstructions ?? '',
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
    const price = Number(form.price);
    if (!form.name.trim() || !form.category || !form.sampleType) {
      setFormError('Name, category, and sample type are required.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormError('Price must be a non-negative number.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      sampleType: form.sampleType,
      price,
      resultType: form.resultType,
      unit: form.unit.trim() || undefined,
      referenceRange: form.referenceRange.trim() || undefined,
      turnaroundTime: form.turnaroundTime.trim() || undefined,
      description: form.description.trim() || undefined,
      preparationInstructions: form.preparationInstructions.trim() || undefined,
    };

    setSaving(true);
    try {
      const saved = editing
        ? await updateLabTest(editing._id, payload)
        : await createLabTest(payload);
      setFormOpen(false);
      flash(editing ? `${saved.name} updated.` : `${saved.name} added to the catalog.`);
      load();
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const handleToggle = async (t: LabTest) => {
    try {
      await updateLabTestStatus(t._id, t.status === 'active' ? 'inactive' : 'active');
      flash(`${t.name} ${t.status === 'active' ? 'deactivated' : 'activated'}.`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update the test.'));
    }
  };

  const columns: Column<LabTest>[] = [
    {
      key: 'testId',
      header: 'ID',
      render: (t) => <span className="font-medium text-brand-800">{t.testId}</span>,
    },
    {
      key: 'name',
      header: 'Test',
      render: (t) => (
        <div>
          <p className="font-medium text-slate-800">{t.name}</p>
          <p className="text-slate-500">
            {typeof t.category === 'object' && t.category ? t.category.name : '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'sampleType',
      header: 'Sample',
      render: (t) => <span className="capitalize">{t.sampleType}</span>,
    },
    {
      key: 'resultType',
      header: 'Result type',
      render: (t) => t.resultType.replace('_', '/'),
    },
    { key: 'price', header: 'Price', render: (t) => t.price.toFixed(2) },
    {
      key: 'turnaroundTime',
      header: 'Turnaround',
      render: (t) => t.turnaroundTime || <span className="text-slate-400">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) =>
        t.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>,
    },
    ...(manage
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            className: 'text-right',
            render: (t: LabTest) => (
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => openForm(t)}>
                  Edit
                </Button>
                <Button
                  variant={t.status === 'active' ? 'danger' : 'secondary'}
                  size="sm"
                  onClick={() => handleToggle(t)}
                >
                  {t.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            ),
          } satisfies Column<LabTest>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Lab tests</h1>
          <p className="mt-1 text-sm text-slate-500">The laboratory test catalog.</p>
        </div>
        {manage && <Button onClick={() => openForm(null)}>Add test</Button>}
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input
            placeholder="Search by name or ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search lab tests"
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
            aria-label="Filter by sample type"
            value={sampleFilter}
            onChange={(e) => {
              setSampleFilter(e.target.value);
              setPage(1);
            }}
            options={SAMPLE_TYPES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
            placeholder="All sample types"
          />
        </div>

        <Table
          columns={columns}
          rows={tests}
          loading={loading}
          emptyState={
            <EmptyState
              title="No lab tests found"
              description={manage ? 'Add the first test to the catalog.' : 'The catalog is empty.'}
              action={
                manage && (
                  <Button size="sm" onClick={() => openForm(null)}>
                    Add test
                  </Button>
                )
              }
            />
          }
        />

        <div className="mt-4">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            disabled={loading}
          />
        </div>
      </Card>

      <Modal
        open={formOpen}
        onClose={saving ? undefined : () => setFormOpen(false)}
        title={editing ? 'Edit lab test' : 'Add lab test'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="lab-test-form" loading={saving}>
              {editing ? 'Save changes' : 'Create test'}
            </Button>
          </>
        }
      >
        <form id="lab-test-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Name" value={form.name} onChange={setField('name')} autoFocus />
            <Select
              label="Category"
              value={form.category}
              onChange={setField('category')}
              options={categories
                .filter((c) => c.status === 'active')
                .map((c) => ({ value: c._id, label: c.name }))}
              placeholder="Select a category"
            />
            <Select
              label="Sample type"
              value={form.sampleType}
              onChange={setField('sampleType')}
              options={SAMPLE_TYPES.map((s) => ({
                value: s,
                label: s.charAt(0).toUpperCase() + s.slice(1),
              }))}
              placeholder="Select a sample type"
            />
            <Select
              label="Result type"
              value={form.resultType}
              onChange={setField('resultType')}
              options={LAB_RESULT_TYPES.map((r) => ({ value: r, label: r.replace('_', ' / ') }))}
            />
            <Input
              label="Price"
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={setField('price')}
            />
            <Input
              label="Turnaround time"
              value={form.turnaroundTime}
              onChange={setField('turnaroundTime')}
              placeholder="24 hours"
            />
            <Input label="Unit" value={form.unit} onChange={setField('unit')} placeholder="mg/dL" />
            <Input
              label="Reference range"
              value={form.referenceRange}
              onChange={setField('referenceRange')}
              placeholder="4.0–11.0"
            />
          </div>

          <Textarea
            label="Description"
            value={form.description}
            onChange={setField('description')}
            rows={2}
            hint="Optional"
          />
          <Textarea
            label="Preparation instructions"
            value={form.preparationInstructions}
            onChange={setField('preparationInstructions')}
            rows={2}
            hint="Optional — e.g. fasting requirements"
          />
        </form>
      </Modal>
    </div>
  );
}
