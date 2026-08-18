import { useState } from 'react';
import { recordObservation } from '../../services/nursingService';
import { getErrorMessage } from '../../services/api';
import {
  VitalSignsFields,
  emptyVitals,
  validateVitals,
  vitalsToPayload,
  type VitalSignsFormState,
} from '../consultations/VitalSignsFields';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';

interface RecordObservationModalProps {
  open: boolean;
  patientId: string;
  patientName?: string;
  onClose: () => void;
  onRecorded: () => void;
}

/**
 * A set of measurements, taken now.
 *
 * The same fields a doctor sees in a consultation, deliberately: one set of
 * inputs and one set of rules means a reading is a reading whoever took it.
 * Nothing is mandatory on its own — a nurse who takes a temperature and moves
 * on has still taken an observation — but an entirely blank one is not a
 * record of anything, which the server also refuses.
 */
export default function RecordObservationModal({
  open,
  patientId,
  patientName,
  onClose,
  onRecorded,
}: RecordObservationModalProps) {
  const [vitals, setVitals] = useState<VitalSignsFormState>(emptyVitals);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setVitals(emptyVitals);
    setNotes('');
    setError('');
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const submit = async () => {
    const problem = validateVitals(vitals);
    if (problem) {
      setError(problem);
      return;
    }

    const vitalSigns = vitalsToPayload(vitals);
    if (Object.keys(vitalSigns).length === 0 && !notes.trim()) {
      setError('Record at least one measurement, or a note saying what you observed.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await recordObservation({ patientId, vitalSigns, notes: notes.trim() || undefined });
      reset();
      onRecorded();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to record this observation.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Record observations"
      description={patientName ? `Measurements for ${patientName}, taken now.` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            {saving ? 'Recording…' : 'Record'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <VitalSignsFields value={vitals} onChange={setVitals} />

        <Textarea
          label="Notes"
          hint="Anything the numbers do not say — how the patient looks, what they report."
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </Modal>
  );
}
