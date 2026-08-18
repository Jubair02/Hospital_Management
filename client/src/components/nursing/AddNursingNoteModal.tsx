import { useState } from 'react';
import { addNursingNote } from '../../services/nursingService';
import { getErrorMessage } from '../../services/api';
import { NOTE_CATEGORIES, NURSING_SHIFTS, type NoteCategory, type NursingShift } from '../../types';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';

interface AddNursingNoteModalProps {
  open: boolean;
  patientId: string;
  patientName?: string;
  onClose: () => void;
  onAdded: () => void;
}

const CATEGORY_LABEL: Record<NoteCategory, string> = {
  progress: 'Progress note',
  handover: 'Handover',
};

const CATEGORY_HINT: Record<NoteCategory, string> = {
  progress: 'What happened during your shift.',
  handover: 'What the next shift needs to know — read on its own, first.',
};

const SHIFT_LABEL: Record<NursingShift, string> = {
  day: 'Day',
  evening: 'Evening',
  night: 'Night',
};

/** A written entry on a patient's stay. */
export default function AddNursingNoteModal({
  open,
  patientId,
  patientName,
  onClose,
  onAdded,
}: AddNursingNoteModalProps) {
  const [category, setCategory] = useState<NoteCategory>('progress');
  const [shift, setShift] = useState<NursingShift | ''>('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setCategory('progress');
    setShift('');
    setBody('');
    setError('');
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (!body.trim()) {
      setError('A note needs something in it.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await addNursingNote({
        patientId,
        body: body.trim(),
        category,
        shift: shift || undefined,
      });
      reset();
      onAdded();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to add this note.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a note"
      description={patientName ? `On ${patientName}'s stay.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            {saving ? 'Saving…' : 'Add note'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Kind"
            value={category}
            hint={CATEGORY_HINT[category]}
            onChange={(event) => setCategory(event.target.value as NoteCategory)}
            options={NOTE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABEL[value] }))}
          />
          <Select
            label="Shift"
            value={shift}
            placeholder="Not stated"
            onChange={(event) => setShift(event.target.value as NursingShift | '')}
            options={NURSING_SHIFTS.map((value) => ({ value, label: SHIFT_LABEL[value] }))}
          />
        </div>

        <Textarea
          label="Note"
          required
          rows={6}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
    </Modal>
  );
}
