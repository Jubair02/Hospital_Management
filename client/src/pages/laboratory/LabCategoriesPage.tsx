import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createLabCategory,
  getLabCategories,
  updateLabCategory,
  updateLabCategoryStatus,
} from '../../services/laboratoryService';
import { getErrorMessage } from '../../services/api';
import type { LabCategory } from '../../types';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Table, { type Column } from '../../components/ui/Table';
import Textarea from '../../components/ui/Textarea';

/**
 * Lab category management — the groups every test in the catalog belongs to.
 *
 * A test cannot be created without one, so with no categories the test form is
 * unusable. Deactivating a category is the way to retire it: the test form only
 * offers active ones, while tests already filed under it keep their history.
 */
export default function LabCategoriesPage() {
  const [categories, setCategories] = useState<LabCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LabCategory | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCategories(await getLabCategories());
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load lab categories.'));
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

  const openForm = (category: LabCategory | null) => {
    setEditing(category);
    setName(category?.name ?? '');
    setDescription(category?.description ?? '');
    setFormError('');
    setSaving(false);
    setFormOpen(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();

    // Mirrors the server bounds so a long name fails at the field rather than
    // after a round trip.
    if (!trimmed) {
      setFormError('Category name is required.');
      return;
    }
    if (trimmed.length > 100) {
      setFormError('Category name must be 100 characters or fewer.');
      return;
    }
    if (description.trim().length > 500) {
      setFormError('Description must be 500 characters or fewer.');
      return;
    }

    setSaving(true);
    try {
      const payload = { name: trimmed, description: description.trim() || undefined };
      const saved = editing
        ? await updateLabCategory(editing._id, payload)
        : await createLabCategory(payload);
      setFormOpen(false);
      flash(editing ? `${saved.name} updated.` : `${saved.name} created.`);
      load();
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const handleToggle = async (category: LabCategory) => {
    try {
      await updateLabCategoryStatus(
        category._id,
        category.status === 'active' ? 'inactive' : 'active'
      );
      flash(
        `${category.name} ${category.status === 'active' ? 'deactivated' : 'activated'}.`
      );
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update the category.'));
    }
  };

  const columns: Column<LabCategory>[] = [
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
        c.status === 'active' ? (
          <Badge tone="green">Active</Badge>
        ) : (
          <Badge tone="slate">Inactive</Badge>
        ),
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
      <PageHeader
        eyebrow="Laboratory"
        title="Test categories"
        subtitle="The groups every lab test is filed under. A test needs one, so add these before building the catalog."
        actions={
          <>
            <Link to="/laboratory/tests">
              <Button variant="secondary">Back to tests</Button>
            </Link>
            <Button onClick={() => openForm(null)}>Add category</Button>
          </>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Table
        columns={columns}
        rows={categories}
        loading={loading}
        emptyState={
          <EmptyState
            title="No categories yet"
            description="Add the groups your lab reports under — Hematology, Microbiology, Clinical chemistry — then the test catalog can be built."
            action={
              <Button size="sm" onClick={() => openForm(null)}>
                Add category
              </Button>
            }
          />
        }
      />

      <Modal
        open={formOpen}
        onClose={saving ? undefined : () => setFormOpen(false)}
        title={editing ? 'Edit category' : 'Add category'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="lab-category-form" loading={saving}>
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </>
        }
      >
        <form id="lab-category-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hematology"
            autoFocus
          />
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
