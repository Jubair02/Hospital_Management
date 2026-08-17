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
import PageHeader from '../../components/ui/PageHeader';
import BackLink from '../../components/ui/BackLink';
import Icon from '../../components/ui/icons';
import { InvoiceItemTypeBadge } from '../../components/billing/BillingBadges';

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
  /**
   * Held apart from the search results: typing again re-runs the search, and a
   * chosen patient who falls out of the new page would leave the dropdown on
   * its placeholder while the id underneath stayed selected.
   */
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [billables, setBillables] = useState<BillableItem[]>([]);
  const [loadingBillables, setLoadingBillables] = useState(false);
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
    setLoadingBillables(true);
    getBillableSources(patientId)
      .then(setBillables)
      .catch((err: unknown) => setError(getErrorMessage(err, 'Unable to load billable records.')))
      .finally(() => setLoadingBillables(false));
  }, [patientId]);

  const toggleBillable = (referenceId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(referenceId)) next.delete(referenceId);
      else next.add(referenceId);
      return next;
    });
  };

  /**
   * The figures shown in the summary panel. Only the server's totals are
   * authoritative — these exist so the desk can see what it is about to charge
   * before it commits, and are computed in whole cents for the same reason the
   * server is: repeated float addition drifts.
   */
  const totals = useMemo(() => {
    let cents = 0;
    let lines = 0;

    for (const b of billables) {
      if (selected.has(b.referenceId)) {
        cents += Math.round(b.unitPrice * 100);
        lines += 1;
      }
    }
    for (const item of manualItems) {
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);
      if (Number.isInteger(qty) && qty > 0 && Number.isFinite(price) && price >= 0) {
        cents += Math.round(price * 100) * qty;
        lines += 1;
      }
    }

    const discountCents = Math.round((Number(discount) || 0) * 100);
    const taxCents = Math.round((Number(tax) || 0) * 100);

    return {
      lines,
      subtotal: cents / 100,
      discount: discountCents / 100,
      tax: taxCents / 100,
      total: Math.max(cents - discountCents + taxCents, 0) / 100,
    };
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

  // The chosen patient stays selectable even after a later search drops them.
  const patientOptions = (() => {
    const label = (p: Patient) => `${p.firstName} ${p.lastName} (${p.patientId})`;
    const options = patients.map((p) => ({ value: p._id, label: label(p) }));

    if (selectedPatient && !patients.some((p) => p._id === selectedPatient._id)) {
      options.unshift({ value: selectedPatient._id, label: label(selectedPatient) });
    }
    return options;
  })();

  /** The first thing still missing, phrased as the next thing to do. */
  const nextStep = !patientId
    ? 'Choose the patient being invoiced.'
    : totals.lines === 0
      ? 'Select a billable record, or add a service line.'
      : null;

  const allSelected = billables.length > 0 && selected.size === billables.length;

  return (
    // Steps on the left, what is about to be charged on the right. The summary
    // sticks, so the total and the button that commits it stay in view instead
    // of sitting below four cards of form.
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-3">
        <BackLink to="/billing/invoices" label="Invoices" />

        <PageHeader
          eyebrow="Billing"
          title="New invoice"
          subtitle="The invoice is created as a draft; nothing is charged until it is issued. Totals are recalculated by the server on save."
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <Card title="1 · Patient" icon="patients" actions={patientId && <StepDone />}>
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
                onChange={(e) => {
                  setPatientId(e.target.value);
                  setSelectedPatient(patients.find((p) => p._id === e.target.value) ?? null);
                }}
                options={patientOptions}
                placeholder={patientOptions.length ? 'Select a patient' : 'No matching patients'}
              />
            </div>
          </Card>

          <Card
            title="2 · From patient records"
            subtitle={
              selected.size > 0
                ? `${selected.size} of ${billables.length} selected`
                : 'Recent consultations, lab orders, and dispensings'
            }
            icon="clipboard"
            actions={
              billables.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected(allSelected ? new Set() : new Set(billables.map((b) => b.referenceId)))
                  }
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </Button>
              )
            }
          >
            {!patientId ? (
              <p className="text-sm text-slate-500">Choose a patient first.</p>
            ) : loadingBillables ? (
              <ul className="space-y-2" aria-label="Loading billable records">
                {[0, 1, 2].map((row) => (
                  <li key={row} className="h-10 w-full rounded-xl skeleton" />
                ))}
              </ul>
            ) : billables.length === 0 ? (
              <p className="text-sm text-slate-500">
                No billable records for this patient. Add a service line below instead.
              </p>
            ) : (
              <ul className="scroll-slim -mx-2 max-h-72 space-y-0.5 overflow-y-auto px-2">
                {billables.map((b) => {
                  const checked = selected.has(b.referenceId);
                  return (
                    <li key={b.referenceId}>
                      <label
                        className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-2.5 py-2.5 text-sm transition-colors duration-150 ${
                          checked ? 'bg-brand-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBillable(b.referenceId)}
                          className="h-4 w-4 shrink-0 accent-brand-600"
                        />
                        <InvoiceItemTypeBadge type={b.itemType} />
                        <span className="min-w-0 flex-1 text-slate-800">{b.description}</span>
                        <span className="ml-auto font-semibold tabular-nums text-slate-900">
                          {formatMoney(b.unitPrice)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card
            title="3 · Additional services"
            subtitle="Anything charged at the desk that has no record behind it"
            icon="cash"
          >
            <div className="space-y-4">
              {manualItems.length === 0 && (
                <p className="text-sm text-slate-500">No service lines added.</p>
              )}

              {manualItems.map((item, index) => {
                const qty = Number(item.quantity);
                const price = Number(item.unitPrice);
                const lineTotal =
                  Number.isInteger(qty) && qty > 0 && Number.isFinite(price) && price >= 0
                    ? (Math.round(price * 100) * qty) / 100
                    : null;

                return (
                  <div
                    key={index}
                    className="rounded-xl border border-line bg-slate-50/50 p-3 sm:border-0 sm:bg-transparent sm:p-0"
                  >
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_8rem_auto] sm:items-start">
                      <Input
                        aria-label={`Service ${index + 1} description`}
                        placeholder="Description"
                        value={item.description}
                        className="col-span-2 sm:col-span-1"
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
                        aria-label={`Remove service item ${index + 1}`}
                        className="col-span-2 sm:col-span-1 sm:min-h-10 sm:px-2.5"
                        onClick={() => setManualItems((list) => list.filter((_, i) => i !== index))}
                      >
                        <Icon name="x" className="h-4 w-4" strokeWidth="2.2" />
                        <span className="sm:sr-only">Remove</span>
                      </Button>
                    </div>

                    {lineTotal !== null && qty > 1 && (
                      <p className="mt-1.5 text-xs tabular-nums text-slate-500">
                        {qty} × {formatMoney(price)} = {formatMoney(lineTotal)}
                      </p>
                    )}
                  </div>
                );
              })}

              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setManualItems((list) => [...list, { description: '', quantity: '1', unitPrice: '' }])
                }
              >
                <Icon name="plus" className="h-4 w-4" />
                Add service line
              </Button>
            </div>
          </Card>

          <Card title="4 · Adjustments" icon="reports">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Discount"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                hint="An amount off the subtotal, not a percentage"
              />
              <Input
                label="Tax"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                hint="An amount added to the subtotal"
              />
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24">
          <Card title="Invoice summary" icon="check">
            <dl className="space-y-3">
              <SummaryRow
                label="Patient"
                value={
                  selectedPatient &&
                  `${selectedPatient.firstName} ${selectedPatient.lastName} · ${selectedPatient.patientId}`
                }
              />
              <SummaryRow
                label="Lines"
                value={totals.lines > 0 && `${totals.lines} item${totals.lines === 1 ? '' : 's'}`}
              />
              <SummaryRow label="Subtotal" value={formatMoney(totals.subtotal)} numeric />
              {totals.discount > 0 && (
                <SummaryRow label="Discount" value={`−${formatMoney(totals.discount)}`} numeric />
              )}
              {totals.tax > 0 && (
                <SummaryRow label="Tax" value={`+${formatMoney(totals.tax)}`} numeric />
              )}
            </dl>

            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-4">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Estimated total
              </span>
              <span className="text-[1.375rem] font-semibold leading-none tabular-nums text-slate-900">
                {formatMoney(totals.total)}
              </span>
            </div>

            {nextStep && (
              <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-line">
                {nextStep}
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row-reverse lg:flex-col-reverse">
              <Button
                className="w-full"
                loading={saving}
                disabled={Boolean(nextStep)}
                onClick={handleSubmit}
              >
                {saving ? 'Creating…' : 'Create draft invoice'}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => navigate('/billing/invoices')}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Quiet tick beside a step's title once it has what it needs. */
function StepDone() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700">
      <Icon name="check" className="h-3.5 w-3.5" strokeWidth="2.5" />
      Done
    </span>
  );
}

function SummaryRow({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value?: string | null | false;
  numeric?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-3 last:border-0 last:pb-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</dt>
      <dd
        className={`min-w-0 text-right text-sm ${numeric ? 'tabular-nums' : ''} ${
          value ? 'font-medium text-slate-900' : 'text-slate-400'
        }`}
      >
        {value || 'Not chosen'}
      </dd>
    </div>
  );
}
