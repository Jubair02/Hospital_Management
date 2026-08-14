import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
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
import { formatMoney } from '../../utils/money';
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
import PageHeader from '../../components/ui/PageHeader';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import Icon from '../../components/ui/icons';

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

/** Stored values are lowercase enums; these are what a person should read. */
const SAMPLE_LABELS: Record<SampleType, string> = {
  blood: 'Blood',
  urine: 'Urine',
  stool: 'Stool',
  saliva: 'Saliva',
  swab: 'Swab',
  other: 'Other',
};

const RESULT_LABELS: Record<LabResultType, string> = {
  numeric: 'Numeric',
  text: 'Text',
  positive_negative: 'Positive / negative',
};

const categoryName = (test: LabTest): string =>
  typeof test.category === 'object' && test.category ? test.category.name : 'Uncategorised';

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

  // Only active categories may be assigned; inactive ones are retired and stay
  // readable on the tests already filed under them.
  const activeCategories = categories.filter((c) => c.status === 'active');

  // Read from the inputs rather than the debounced value, so the control
  // appears on the keystroke instead of 350ms later.
  const filtered = Boolean(searchInput || categoryFilter || sampleFilter);

  const clearFilters = () => {
    setSearchInput('');
    setCategoryFilter('');
    setSampleFilter('');
    setPage(1);
  };

  /**
   * Unit and reference range only describe a numeric result. They stay visible
   * for any other result type that already carries one, so editing an existing
   * test can never hide a value the form would go on to save.
   */
  const showRangeFields =
    form.resultType === 'numeric' || Boolean(form.unit || form.referenceRange);

  const emptyBody = filtered ? (
    <EmptyState
      title="No tests match these filters"
      description="Try a different sample type or category, or clear the filters to see the whole catalog."
      action={
        <Button size="sm" variant="secondary" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      title="No lab tests yet"
      description={
        manage
          ? 'Add the first test to the catalog. Every test needs a category, so start there if the dropdown is empty.'
          : 'The catalog is empty. An administrator adds tests here.'
      }
      action={
        manage && (
          <Button size="sm" onClick={() => openForm(null)}>
            Add test
          </Button>
        )
      }
    />
  );

  const columns: Column<LabTest>[] = [
    {
      key: 'testId',
      // Hidden on narrow desktops: the name identifies a test to a person, the
      // id only matters once they are cross-referencing another screen.
      className: 'hidden lg:table-cell',
      header: 'ID',
      render: (t) => (
        <span className="text-[0.8125rem] font-medium tabular-nums text-brand-800">{t.testId}</span>
      ),
    },
    {
      key: 'name',
      header: 'Test',
      render: (t) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{t.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{categoryName(t)}</p>
        </div>
      ),
    },
    {
      key: 'sampleType',
      header: 'Sample',
      render: (t) => <span className="text-slate-600">{SAMPLE_LABELS[t.sampleType]}</span>,
    },
    {
      key: 'resultType',
      className: 'hidden lg:table-cell',
      header: 'Result',
      render: (t) => <span className="text-slate-600">{RESULT_LABELS[t.resultType]}</span>,
    },
    {
      key: 'price',
      header: 'Price',
      className: 'text-right',
      render: (t) => (
        <span className="font-medium tabular-nums text-slate-900">{formatMoney(t.price)}</span>
      ),
    },
    {
      key: 'turnaroundTime',
      className: 'hidden xl:table-cell',
      header: 'Turnaround',
      render: (t) => t.turnaroundTime || <span className="text-slate-400">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <StatusBadge status={t.status} />,
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
      <PageHeader
        eyebrow="Laboratory"
        title="Test catalog"
        subtitle="Every test the lab offers, with the sample it needs, how the result is reported, and what it costs."
        actions={
          manage && (
            <>
              <Link to="/laboratory/categories">
                <Button variant="secondary">Categories</Button>
              </Link>
              <Button onClick={() => openForm(null)}>Add test</Button>
            </>
          )
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            placeholder="Search by name or ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search lab tests"
            className="sm:col-span-2"
            trailing={
              searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                  className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Icon name="x" className="h-4 w-4" />
                </button>
              )
            }
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
            options={SAMPLE_TYPES.map((s) => ({ value: s, label: SAMPLE_LABELS[s] }))}
            placeholder="All sample types"
          />
        </div>

        {/* The result count answers "did my filter do anything?" — the pager
            below cannot, because it hides itself on a single page of results. */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3.5">
          <p aria-live="polite" className="text-xs text-slate-500">
            {loading ? (
              'Loading…'
            ) : (
              <>
                <span className="font-semibold tabular-nums text-slate-700">
                  {pagination.total.toLocaleString()}
                </span>{' '}
                {pagination.total === 1 ? 'test' : 'tests'}
                {filtered ? ' match these filters' : ' in the catalog'}
              </>
            )}
          </p>

          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
            >
              <Icon name="x" className="h-3.5 w-3.5" strokeWidth="2.2" />
              Clear filters
            </button>
          )}
        </div>
      </Card>

      {/* Two renderings of one list. A catalog row carries eight facts, and
          eight columns on a phone is a horizontal scrollbar hiding most of
          them — so below `md` each test becomes a card that stacks instead.
          `hidden` removes the other from the accessibility tree, so a screen
          reader is never read the same list twice. */}
      <div className="md:hidden">
        <TestCardList
          tests={tests}
          loading={loading}
          manage={manage}
          onEdit={openForm}
          onToggle={handleToggle}
          emptyState={emptyBody}
        />
      </div>

      {/* This page has its own richer card view above, so the table's built-in
          one is switched off rather than rendered into a hidden container. */}
      <div className="hidden md:block">
        <Table
          columns={columns}
          rows={tests}
          loading={loading}
          emptyState={emptyBody}
          cardsOnMobile={false}
        />
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={setPage}
        disabled={loading}
      />

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
        <form id="lab-test-form" onSubmit={handleSubmit} noValidate className="space-y-6">
          {formError && <Alert tone="error">{formError}</Alert>}

          {/* A test cannot be filed without a category, so an empty list is a
              dead end rather than a validation error. Say so, and say where to
              go, instead of leaving an empty dropdown to be puzzled over. */}
          {activeCategories.length === 0 && (
            <Alert tone="warning">
              There are no active test categories, and a test needs one.{' '}
              <Link to="/laboratory/categories" className="font-semibold underline">
                Add a category
              </Link>{' '}
              first.
            </Alert>
          )}

          <FormSection title="Identity">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Name"
                value={form.name}
                onChange={setField('name')}
                placeholder="Complete blood count"
                autoFocus
              />
              <Select
                label="Category"
                value={form.category}
                onChange={setField('category')}
                options={activeCategories.map((c) => ({ value: c._id, label: c.name }))}
                placeholder="Select a category"
                disabled={activeCategories.length === 0}
              />
              <Select
                label="Sample type"
                value={form.sampleType}
                onChange={setField('sampleType')}
                options={SAMPLE_TYPES.map((s) => ({ value: s, label: SAMPLE_LABELS[s] }))}
                placeholder="Select a sample type"
              />
            </div>
          </FormSection>

          <FormSection title="How the result is reported">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Result type"
                value={form.resultType}
                onChange={setField('resultType')}
                options={LAB_RESULT_TYPES.map((r) => ({ value: r, label: RESULT_LABELS[r] }))}
              />
              {showRangeFields && (
                <>
                  <Input
                    label="Unit"
                    value={form.unit}
                    onChange={setField('unit')}
                    placeholder="mg/dL"
                    hint="Optional"
                  />
                  <Input
                    label="Reference range"
                    value={form.referenceRange}
                    onChange={setField('referenceRange')}
                    placeholder="4.0–11.0"
                    hint="Optional — the normal range for this test"
                  />
                </>
              )}
            </div>
          </FormSection>

          <FormSection title="Service">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Price"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={form.price}
                onChange={setField('price')}
                placeholder="0.00"
              />
              <Input
                label="Turnaround time"
                value={form.turnaroundTime}
                onChange={setField('turnaroundTime')}
                placeholder="24 hours"
                hint="Optional"
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
          </FormSection>
        </form>
      </Modal>
    </div>
  );
}

/** Retired, not broken: inactive takes the neutral tone, never red. */
function StatusBadge({ status }: { status: LabTest['status'] }) {
  return status === 'active' ? (
    <Badge tone="green">Active</Badge>
  ) : (
    <Badge tone="slate">Inactive</Badge>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The phone rendering of the catalog. Each test is one card: what it is at the
 * top, the facts that vary between tests in the middle, and the two actions at
 * the foot where a thumb reaches them.
 */
function TestCardList({
  tests,
  loading,
  manage,
  onEdit,
  onToggle,
  emptyState,
}: {
  tests: LabTest[];
  loading: boolean;
  manage: boolean;
  onEdit: (test: LabTest) => void;
  onToggle: (test: LabTest) => void;
  emptyState: ReactNode;
}) {
  if (loading) {
    return (
      <ul className="space-y-3" aria-label="Loading tests">
        {[0, 1, 2, 3].map((row) => (
          <li key={row} className="surface-card space-y-3 p-4">
            <div className="h-4 w-2/3 rounded-md skeleton" />
            <div className="h-3 w-1/3 rounded-md skeleton" />
            <div className="h-8 w-full rounded-lg skeleton" />
          </li>
        ))}
      </ul>
    );
  }

  if (tests.length === 0) {
    return <div className="surface-card px-4 py-6">{emptyState}</div>;
  }

  return (
    <ul className="space-y-3">
      {tests.map((test) => (
        <li key={test._id} className="surface-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-semibold leading-snug text-slate-900">
                {test.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                <span className="tabular-nums text-brand-800">{test.testId}</span>
                <span className="text-slate-300"> · </span>
                {categoryName(test)}
              </p>
            </div>
            <StatusBadge status={test.status} />
          </div>

          <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3.5 text-sm">
            <Fact label="Sample" value={SAMPLE_LABELS[test.sampleType]} />
            <Fact label="Result" value={RESULT_LABELS[test.resultType]} />
            <Fact label="Price" value={formatMoney(test.price)} emphasis />
            <Fact label="Turnaround" value={test.turnaroundTime || '—'} />
          </dl>

          {manage && (
            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => onEdit(test)}
              >
                Edit
              </Button>
              <Button
                variant={test.status === 'active' ? 'danger' : 'secondary'}
                size="sm"
                className="flex-1"
                onClick={() => onToggle(test)}
              >
                {test.status === 'active' ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Fact({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate ${
          emphasis ? 'font-semibold tabular-nums text-slate-900' : 'text-slate-700'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
