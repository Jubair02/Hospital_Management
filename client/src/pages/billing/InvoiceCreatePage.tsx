import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPatients } from '../../services/patientService';
import {
  createInvoice,
  getBillableSources,
  formatMoney,
} from '../../services/billingService';
import { getErrorMessage } from '../../services/api';
import type { BillableItem, InvoiceItemInput, Patient } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';

interface ManualItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

export default function InvoiceCreatePage() {
  const navigate = useNavigate();

  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');

  const [billables, setBillables] = useState<BillableItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [discount, setDiscount] = useState('');
  const [tax, setTax] = useState('');

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Patient search (active patients).
  useEffect(() => {
    const t = setTimeout(() => {
      getPatients({ search: patientSearch.trim() || undefined, limit: 20 })
        .then((data) => setPatients(data.patients))
        .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load patients.')));
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch]);

  // Billable sources for the chosen patient.
  useEffect(() => {
    setSelected(new Set());
    if (!patientId) {
      setBillables([]);
      return;
    }
    getBillableSources(patientId)
      .then(setBillables)
      .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load billable records.')));
  }, [patientId]);

  const toggleBillable = (referenceId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(referenceId)) next.delete(referenceId);
      else next.add(referenceId);
      return next;
    });
  };

  const estimatedTotal = useMemo(() => {
    let cents = 0;
    for (const b of billables) {
      if (selected.has(b.referenceId)) cents += Math.round(b.unitPrice * 100);
    }
    for (const item of manualItems) {
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);
      if (Number.isInteger(qty) && qty > 0 && Number.isFinite(price) && price >= 0) {
        cents += Math.round(price * 100) * qty;
      }
    }
    cents -= Math.round((Number(discount) || 0) * 100);
    cents += Math.round((Number(tax) || 0) * 100);
    return Math.max(cents, 0) / 100;
  }, [billables, selected, manualItems, discount, tax]);

  const handleSubmit = async () => {
    setError('');
    if (!patientId) {
      setError('Select a patient.');
      return;
    }

    const items: InvoiceItemInput[] = [];

    for (const b of billables) {
      if (selected.has(b.referenceId)) {
        items.push({
          itemType: b.itemType,
          referenceId: b.referenceId,
          description: b.description,
          quantity: 1,
          unitPrice: b.unitPrice,
        });
      }
    }

    for (const [index, item] of manualItems.entries()) {
      const isEmpty = !item.description.trim() && !item.quantity && !item.unitPrice;
      if (isEmpty) continue;
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);
      if (!item.description.trim() || !Number.isInteger(qty) || qty < 1 || !Number.isFinite(price) || price < 0) {
        setError(`Service item ${index + 1} needs a description, whole-number quantity, and non-negative price.`);
        return;
      }
      items.push({
        itemType: 'service',
        description: item.description.trim(),
        quantity: qty,
        unitPrice: price,
      });
    }

    if (items.length === 0) {
      setError('Add at least one billable record or service item.');
      return;
    }

    setSaving(true);
    try {
      const invoice = await createInvoice({
        patientId,
        items,
        discount: Number(discount) || 0,
        tax: Number(tax) || 0,
      });
      navigate(`/billing/invoices/${invoice._id}`, {
        state: { flash: `Invoice ${invoice.invoiceId} created as a draft.` },
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create the invoice.'));
      setSaving(false);
    }
  };

  const typeLabel: Record<BillableItem['itemType'], string> = {
    consultation: 'Consultation',
    lab_order: 'Laboratory',
    pharmacy: 'Pharmacy',
    service: 'Service',
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">New invoice</h1>
        <p className="mt-1 text-sm text-slate-500">
          Totals are calculated by the server — this page only proposes items.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card title="1 · Patient">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Find patient"
            placeholder="Search by name, ID, or phone"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
          />
          <Select
            label="Patient"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            options={patients.map((p) => ({
              value: p._id,
              label: `${p.firstName} ${p.lastName} (${p.patientId})`,
            }))}
            placeholder={patients.length ? 'Select a patient' : 'No matching patients'}
          />
        </div>
      </Card>

      <Card
        title="2 · From existing records"
        subtitle="Consultations, lab orders, and pharmacy dispensings"
      >
        {!patientId ? (
          <p className="text-sm text-slate-400">Choose a patient first.</p>
        ) : billables.length === 0 ? (
          <p className="text-sm text-slate-400">No billable records for this patient.</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {billables.map((b) => (
              <li key={b.referenceId}>
                <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(b.referenceId)}
                      onChange={() => toggleBillable(b.referenceId)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                    />
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {typeLabel[b.itemType]}
                    </span>
                    <span className="text-slate-800">{b.description}</span>
                  </span>
                  <span className="font-medium text-slate-700">{formatMoney(b.unitPrice)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="3 · Additional services">
        <div className="space-y-3">
          {manualItems.map((item, index) => (
            <div key={index} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem_8rem_auto]">
              <Input
                aria-label={`Service ${index + 1} description`}
                placeholder="Description"
                value={item.description}
                onChange={(e) =>
                  setManualItems((list) =>
                    list.map((x, i) => (i === index ? { ...x, description: e.target.value } : x))
                  )
                }
              />
              <Input
                aria-label={`Service ${index + 1} quantity`}
                type="number"
                min={1}
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) =>
                  setManualItems((list) =>
                    list.map((x, i) => (i === index ? { ...x, quantity: e.target.value } : x))
                  )
                }
              />
              <Input
                aria-label={`Service ${index + 1} unit price`}
                type="number"
                min={0}
                step="0.01"
                placeholder="Unit price"
                value={item.unitPrice}
                onChange={(e) =>
                  setManualItems((list) =>
                    list.map((x, i) => (i === index ? { ...x, unitPrice: e.target.value } : x))
                  )
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setManualItems((list) => list.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setManualItems((list) => [...list, { description: '', quantity: '1', unitPrice: '' }])
            }
          >
            + Add service item
          </Button>
        </div>
      </Card>

      <Card title="4 · Adjustments">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Discount (amount)"
            type="number"
            min={0}
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
          <Input
            label="Tax (amount)"
            type="number"
            min={0}
            step="0.01"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
          />
          <div className="flex items-end">
            <p className="text-sm text-slate-600">
              Estimated total:{' '}
              <span className="text-lg font-semibold text-slate-900">{formatMoney(estimatedTotal)}</span>
            </p>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate('/billing/invoices')} disabled={saving}>
          Cancel
        </Button>
        <Button loading={saving} onClick={handleSubmit}>
          {saving ? 'Creating…' : 'Create draft invoice'}
        </Button>
      </div>
    </div>
  );
}
