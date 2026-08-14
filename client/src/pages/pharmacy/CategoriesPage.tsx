import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createCategory,
  getCategories,
  updateCategory,
  updateCategoryStatus,
} from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import type { MedicineCategory } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<MedicineCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MedicineCategory | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCategories(await getCategories());
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load categories.'));
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

  const openForm = (category: MedicineCategory | null) => {
    setEditing(category);
    setName(category?.name ?? '');
    setDescription(category?.description ?? '');
    setFormError('');
    setSaving(false);
    setFormOpen(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Category name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description.trim() || undefined };
      const saved = editing
        ? await updateCategory(editing._id, payload)
        : await createCategory(payload);
      setFormOpen(false);
      flash(editing ? `${saved.name} updated.` : `${saved.name} created.`);
      load();
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const handleToggle = async (c: MedicineCategory) => {
    try {
      await updateCategoryStatus(c._id, c.status === 'active' ? 'inactive' : 'active');
      flash(`${c.name} ${c.status === 'active' ? 'deactivated' : 'activated'}.`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update the category.'));
    }
  };

  const columns: Column<MedicineCategory>[] = [
    {
      key: 'categoryId',
      header: 'ID',
      render: (c) => <span className="font-medium text-brand-800">{c.categoryId}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (c) => (
        <div>
          <p className="font-medium text-slate-800">{c.name}</p>
          {c.description && <p className="text-slate-500">{c.description}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) =>
        c.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (c) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => openForm(c)}>
            Edit
          </Button>
          <Button
            variant={c.status === 'active' ? 'danger' : 'secondary'}
            size="sm"
            onClick={() => handleToggle(c)}
          >
            {c.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Medicine categories</h1>
          <p className="mt-1 text-sm text-slate-500">Groups used to organize the catalog.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/pharmacy/medicines">
            <Button variant="ghost">Back to medicines</Button>
          </Link>
          <Button onClick={() => openForm(null)}>Add category</Button>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <Table
          columns={columns}
          rows={categories}
          loading={loading}
          emptyState={
            <EmptyState
              title="No categories yet"
              description="Add categories like Analgesics or Antibiotics."
              action={
                <Button size="sm" onClick={() => openForm(null)}>
                  Add category
                </Button>
              }
            />
          }
        />
      </Card>

      <Modal
        open={formOpen}
        onClose={saving ? undefined : () => setFormOpen(false)}
        title={editing ? 'Edit category' : 'Add category'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="category-form" loading={saving}>
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </>
        }
      >
        <form id="category-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            hint="Optional"
          />
        </form>
      </Modal>
    </div>
  );
}
