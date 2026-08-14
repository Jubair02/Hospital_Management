import { useEffect, useState, type FormEvent } from 'react';
import { createDepartment, updateDepartment } from '../../services/departmentService';
import { getErrorMessage } from '../../services/api';
import type { Department } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

interface DepartmentFormModalProps {
  open: boolean;
  department?: Department | null;
  onClose: () => void;
  onSaved: (department: Department, wasEdit: boolean) => void;
}

/** Create/edit dialog for departments (admin only). */
export default function DepartmentFormModal({
  open,
  department = null,
  onClose,
  onSaved,
}: DepartmentFormModalProps) {
  const isEdit = Boolean(department);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(department?.name ?? '');
    setDescription(department?.description ?? '');
    setNameError('');
    setSubmitError('');
    setSaving(false);
  }, [open, department]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');

    if (!name.trim()) {
      setNameError('Department name is required.');
      return;
    }
    setNameError('');

    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description.trim() };
      const saved = isEdit
        ? await updateDepartment(department!._id, payload)
        : await createDepartment(payload);
      onSaved(saved, isEdit);
    } catch (err) {
      setSubmitError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={isEdit ? 'Edit department' : 'Add department'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="department-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Create department'}
          </Button>
        </>
      }
    >
      <form id="department-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {submitError && <Alert tone="error">{submitError}</Alert>}
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
          placeholder="Cardiology"
          autoFocus
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          hint="Optional"
        />
      </form>
    </Modal>
  );
}
