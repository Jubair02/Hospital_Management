import { useEffect, useId, useState } from 'react';
import { recordAdministration } from '../../services/nursingService';
import { getMedicines } from '../../services/pharmacyService';
import { getPatientConsultations } from '../../services/consultationService';
import { getErrorMessage } from '../../services/api';
import { ADMINISTRATION_STATUSES, type AdministrationStatus } from '../../types';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';

interface RecordAdministrationModalProps {
  open: boolean;
  patientId: string;
  patientName?: string;
  onClose: () => void;
  onRecorded: () => void;
}

const STATUS_HINT: Record<AdministrationStatus, string> = {
  given: 'The patient took the dose.',
  held: 'The dose was due and deliberately not given — a clinical decision.',
  refused: 'The patient declined it.',
};

const STATUS_LABEL: Record<AdministrationStatus, string> = {
  given: 'Given',
  held: 'Held',
  refused: 'Refused',
};

/**
 * A dose, as actually given.
 *
 * The medicine and amount are typed rather than derived from the prescription,
 * because the chart has to record what reached the patient — which is not
 * always what was written. Prescriptions appear as shortcuts to fill the
 * fields, not as the source of truth.
 */
export default function RecordAdministrationModal({
  open,
  patientId,
  patientName,
  onClose,
  onRecorded,
}: RecordAdministrationModalProps) {
  /**
   * The catalogue, offered as suggestions on the medicine field.
   *
   * A drug name typed from memory onto a legal record is the failure this
   * guards against, and it is why nurses were given read access to the
   * catalogue. A `datalist` suggests without constraining: what was actually
   * given still has to be recordable, including something not in the
   * catalogue, so the field stays free text.
   */
  const [catalogue, setCatalogue] = useState<string[]>([]);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    getMedicines({ limit: 200, status: 'active' })
      .then((data) => {
        if (cancelled) return;
        setCatalogue(
          data.medicines.map((medicine) =>
            medicine.strength ? `${medicine.name} ${medicine.strength}` : medicine.name
          )
        );
      })
      // A missing catalogue costs the field its suggestions, nothing more.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [open]);

  /**
   * What this patient has actually been prescribed.
   *
   * Fetched here rather than passed in: every page that shows the nursing
   * record would otherwise have to know about prescriptions to fill the prop,
   * and none of them did — the shortcuts were dead. Loaded only when the
   * dialog opens, so the pages carrying the record pay nothing for it.
   */
  const [suggestions, setSuggestions] = useState<
    { medicineName: string; dosage: string; route?: string }[]
  >([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    getPatientConsultations(patientId, { limit: 5 })
      .then((data) => {
        if (cancelled) return;

        // Newest first, de-duplicated: the same drug prescribed across three
        // visits is one shortcut, not three identical chips.
        const seen = new Set<string>();
        const lines: { medicineName: string; dosage: string; route?: string }[] = [];

        for (const consultation of data.consultations) {
          for (const line of consultation.prescriptions ?? []) {
            const key = `${line.medicineName}|${line.dosage}`;
            if (seen.has(key)) continue;
            seen.add(key);
            lines.push({
              medicineName: line.medicineName,
              dosage: line.dosage,
              route: line.route,
            });
          }
        }

        setSuggestions(lines.slice(0, 8));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [open, patientId]);

  const [medicineName, setMedicineName] = useState('');
  const [dosage, setDosage] = useState('');
  const [route, setRoute] = useState('');
  const [status, setStatus] = useState<AdministrationStatus>('given');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setMedicineName('');
    setDosage('');
    setRoute('');
    setStatus('given');
    setNotes('');
    setError('');
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const needsReason = status === 'refused' || status === 'held';

  const submit = async () => {
    if (!medicineName.trim() || !dosage.trim()) {
      setError('Name the medicine and the dose given.');
      return;
    }
    // Mirrors the server rule: a dose not given is only half a record without
    // the reason, and the reason is what the next shift needs.
    if (needsReason && !notes.trim()) {
      setError(`Say why the dose was ${status}.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      await recordAdministration({
        patientId,
        medicineName: medicineName.trim(),
        dosage: dosage.trim(),
        route: route.trim() || undefined,
        status,
        notes: notes.trim() || undefined,
      });
      reset();
      onRecorded();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to record this administration.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Record a dose"
      description={patientName ? `Medication given to ${patientName}.` : undefined}
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

        {suggestions.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Prescribed for this patient
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((item, index) => (
                <button
                  key={`${item.medicineName}-${index}`}
                  type="button"
                  onClick={() => {
                    setMedicineName(item.medicineName);
                    setDosage(item.dosage);
                    setRoute(item.route ?? '');
                  }}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
                >
                  {item.medicineName} · {item.dosage}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Medicine"
            required
            list={catalogue.length > 0 ? listId : undefined}
            hint={catalogue.length > 0 ? 'Start typing to match the catalogue' : undefined}
            value={medicineName}
            onChange={(event) => setMedicineName(event.target.value)}
          />
          {catalogue.length > 0 && (
            <datalist id={listId}>
              {catalogue.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          )}
          <Input
            label="Dose"
            required
            placeholder="500 mg"
            value={dosage}
            onChange={(event) => setDosage(event.target.value)}
          />
          <Input
            label="Route"
            placeholder="Oral"
            value={route}
            onChange={(event) => setRoute(event.target.value)}
          />
          <Select
            label="Outcome"
            value={status}
            hint={STATUS_HINT[status]}
            onChange={(event) => setStatus(event.target.value as AdministrationStatus)}
            options={ADMINISTRATION_STATUSES.map((value) => ({
              value,
              label: STATUS_LABEL[value],
            }))}
          />
        </div>

        <Textarea
          label={needsReason ? 'Reason' : 'Notes'}
          required={needsReason}
          hint={
            needsReason
              ? 'Required — the next person on shift needs to know why.'
              : 'Optional.'
          }
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </Modal>
  );
}
