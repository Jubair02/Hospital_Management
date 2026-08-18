import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  dispenseMedicines,
  getMedicines,
  getPharmacyPrescriptionById,
} from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type {
  DispenseItemPayload,
  DispensingRecord,
  Medicine,
  PharmacyPrescription,
  PrescriptionFulfillment,
} from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import BackLink from '../../components/ui/BackLink';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';

interface LineState {
  medicineId: string;
  quantity: string;
  prescribedQuantity: string;
  selected: boolean;
}

/** One prescription line with its fulfillment state and dispense inputs. */
export default function PharmacyPrescriptionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [consultation, setConsultation] = useState<PharmacyPrescription | null>(null);
  const [fulfillments, setFulfillments] = useState<PrescriptionFulfillment[]>([]);
  const [dispensings, setDispensings] = useState<DispensingRecord[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [lines, setLines] = useState<Record<number, LineState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dispensing, setDispensing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [data, meds] = await Promise.all([
        getPharmacyPrescriptionById(id),
        getMedicines({ limit: 100, status: 'active' }),
      ]);
      setConsultation(data.consultation);
      setFulfillments(data.fulfillments);
      setDispensings(data.dispensings);
      setMedicines(meds.medicines);
      setLines({});
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this prescription.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const fulfillmentFor = (index: number): PrescriptionFulfillment | undefined =>
    fulfillments.find((f) => f.prescriptionIndex === index);

  const lineState = (index: number): LineState =>
    lines[index] ?? { medicineId: '', quantity: '', prescribedQuantity: '', selected: false };

  const setLine = (index: number, patch: Partial<LineState>) =>
    setLines((prev) => ({ ...prev, [index]: { ...lineState(index), ...patch } }));

  const handleDispense = async () => {
    if (!consultation) return;
    setError('');
    setNotice('');

    const items: DispenseItemPayload[] = [];
    for (const [indexStr, line] of Object.entries(lines)) {
      if (!line.selected) continue;
      const index = Number(indexStr);
      const fulfillment = fulfillmentFor(index);
      const quantity = Number(line.quantity);
      const medicineId = fulfillment?.medicineId ?? line.medicineId;

      if (!medicineId) {
        setError(`Select the stock medicine for line ${index + 1}.`);
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setError(`Enter a positive quantity for line ${index + 1}.`);
        return;
      }

      const item: DispenseItemPayload = { prescriptionIndex: index, medicineId, quantity };
      if (!fulfillment) {
        const prescribed = Number(line.prescribedQuantity);
        if (!Number.isInteger(prescribed) || prescribed <= 0) {
          setError(`Set the total prescribed quantity for line ${index + 1} (first dispensing).`);
          return;
        }
        item.prescribedQuantity = prescribed;
      }
      items.push(item);
    }

    if (items.length === 0) {
      setError('Select at least one line to dispense.');
      return;
    }

    setDispensing(true);
    try {
      const record = await dispenseMedicines({ consultationId: consultation._id, items });
      setNotice(`Dispensed as ${record.dispensingId}.`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to dispense.'));
    } finally {
      setDispensing(false);
    }
  };

  /** How many lines the pharmacist has ticked — drives the pinned bar. */
  const selectedCount = Object.values(lines).filter((line) => line.selected).length;

  /** Progress through the prescription, for the rail. */
  const dispensedCount = fulfillments.filter((f) => f.status === 'dispensed').length;

  if (loading) return <FullPageSpinner label="Loading prescription" />;

  if (!consultation) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error || 'Prescription not found.'}</Alert>
        <Link to="/pharmacy/prescriptions">
          <Button variant="secondary">Back to prescriptions</Button>
        </Link>
      </div>
    );
  }

  const medicineOptions = medicines.map((m) => ({
    value: m._id,
    label: `${m.name}${m.strength ? ` ${m.strength}` : ''} — stock: ${m.totalStock ?? 0}`,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-2">
      <div className="space-y-3">
        <BackLink to="/pharmacy/prescriptions" label="Prescriptions" />

        <PageHeader
          eyebrow="Prescription"
          title={consultation.consultationId}
          subtitle={`Prescribed ${formatDate(consultation.consultationDate)}`}
        />
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {/* Lines on the left, who and what happened on the right. The page used
          to be one long column, so the patient's name and the dispensing
          history sat a scroll apart from the lines they describe. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionHeading
            title="Prescribed medicines"
            hint="Read-only from the doctor. Batches are chosen automatically, earliest expiry first."
          />

          {consultation.prescriptions.map((rx, index) => {
          const fulfillment = fulfillmentFor(index);
          const line = lineState(index);
          const done = fulfillment?.status === 'dispensed';

          return (
            <Card key={index}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-800">
                      {index + 1}. {rx.medicineName}
                    </p>
                    {done ? (
                      <Badge tone="green">Dispensed</Badge>
                    ) : fulfillment ? (
                      <Badge tone="amber">
                        {fulfillment.dispensedQuantity}/{fulfillment.prescribedQuantity} dispensed
                      </Badge>
                    ) : (
                      <Badge tone="slate">Pending</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {[rx.dosage, rx.frequency, rx.duration, rx.route].filter(Boolean).join(' · ')}
                  </p>
                  {rx.instructions && (
                    <p className="mt-0.5 text-sm text-slate-500">“{rx.instructions}”</p>
                  )}
                </div>

                {!done && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={line.selected}
                      onChange={(e) => setLine(index, { selected: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                    />
                    Dispense this line
                  </label>
                )}
              </div>

              {!done && line.selected && (
                <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
                  {fulfillment ? (
                    <p className="text-sm text-slate-600 sm:col-span-1">
                      Remaining to dispense:{' '}
                      <span className="font-semibold">{fulfillment.remaining}</span>
                    </p>
                  ) : (
                    <>
                      <Select
                        label="Stock medicine"
                        value={line.medicineId}
                        onChange={(e) => setLine(index, { medicineId: e.target.value })}
                        options={medicineOptions}
                        placeholder="Match to catalog"
                      />
                      <Input
                        label="Total prescribed quantity"
                        type="number"
                        min={1}
                        value={line.prescribedQuantity}
                        onChange={(e) => setLine(index, { prescribedQuantity: e.target.value })}
                        hint="Units for the full course"
                      />
                    </>
                  )}
                  <Input
                    label="Quantity to dispense now"
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => setLine(index, { quantity: e.target.value })}
                  />
                </div>
              )}
            </Card>
          );
        })}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card title="Prescription" icon="clipboard">
            <dl className="space-y-3 text-sm">
              {consultation.patientId && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">
                    Patient
                  </dt>
                  <dd className="mt-0.5 font-medium text-slate-900">
                    {consultation.patientId.firstName} {consultation.patientId.lastName}
                  </dd>
                  <dd className="tabular-nums text-xs text-slate-500">
                    {consultation.patientId.patientId}
                  </dd>
                </div>
              )}
              {consultation.doctorId && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">
                    Prescribed by
                  </dt>
                  <dd className="mt-0.5 text-slate-700">
                    Dr. {consultation.doctorId.firstName} {consultation.doctorId.lastName}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">
                  Lines
                </dt>
                <dd className="mt-0.5 tabular-nums text-slate-700">
                  {dispensedCount} of {consultation.prescriptions.length} fully dispensed
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Dispensing history" subtitle="Events for this prescription">
        {dispensings.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing dispensed yet.</p>
        ) : (
          <ul className="space-y-3">
            {dispensings.map((d) => (
              <li key={d._id} className="text-sm">
                <p className="font-medium text-slate-800">
                  {d.dispensingId} · {formatDate(d.createdAt)}
                  {d.dispensedBy && (
                    <span className="font-normal text-slate-500">
                      {' '}
                      by {d.dispensedBy.firstName} {d.dispensedBy.lastName}
                    </span>
                  )}
                </p>
                <ul className="mt-1 space-y-0.5 text-slate-600">
                  {d.items.map((item, i) => (
                    <li key={i}>
                      {item.medicineName} × {item.quantity}{' '}
                      <span className="text-slate-400">
                        ({item.batches.map((b) => `${b.batchNumber}: ${b.quantity}`).join(', ')})
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            </ul>
          )}
          </Card>
        </aside>
      </div>

      {/* Pinned: the lines are taller than the viewport, so the way to act on
          them cannot live only at the bottom of the list. */}
      {selectedCount > 0 && (
        <div className="sticky bottom-0 -mx-1 px-1 pb-1 pt-2">
          <div className="surface-card flex flex-col gap-3 p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm font-medium text-slate-700">
              {selectedCount} {selectedCount === 1 ? 'line' : 'lines'} selected to dispense
            </p>
            <Button
              className="w-full sm:w-auto"
              loading={dispensing}
              onClick={handleDispense}
            >
              {dispensing ? 'Dispensing…' : 'Dispense selected'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
