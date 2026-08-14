import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import {
  getInvoiceById,
  recordPayment,
  recordRefund,
  setInvoiceStatus,
  formatMoney,
} from '../../services/billingService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import {
  PAYMENT_METHODS,
  type BillingPayment,
  type Invoice,
  type PaymentMethod,
} from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import Table, { type Column } from '../../components/ui/Table';
import {
  InvoicePaymentBadge,
  InvoiceStatusBadge,
  PaymentRecordBadge,
  methodLabel,
} from '../../components/billing/BillingBadges';
import type { InvoiceItem } from '../../types';

export default function InvoiceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const canOperate = role === 'admin' || role === 'receptionist';

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>(
    () => (location.state as { flash?: string } | null)?.flash ?? ''
  );

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', reference: '', notes: '' });
  const [refunding, setRefunding] = useState<BillingPayment | null>(null);
  const [refundForm, setRefundForm] = useState({ amount: '', notes: '' });
  const [confirm, setConfirm] = useState<'issue' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getInvoiceById(id);
      setInvoice(data.invoice);
      setPayments(data.payments);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this invoice.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      flash(success);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePay = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!invoice) return;
    const amount = Number(payForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive payment amount.');
      return;
    }
    setPayOpen(false);
    await act(
      () =>
        recordPayment({
          invoiceId: invoice._id,
          amount,
          method: payForm.method as PaymentMethod,
          transactionReference: payForm.reference.trim() || undefined,
          notes: payForm.notes.trim() || undefined,
        }),
      'Payment recorded.'
    );
    setPayForm({ amount: '', method: 'cash', reference: '', notes: '' });
  };

  if (loading) return <FullPageSpinner label="Loading invoice" />;

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error || 'Invoice not found.'}</Alert>
        <Link to="/billing/invoices">
          <Button variant="secondary">Back to invoices</Button>
        </Link>
      </div>
    );
  }

  const itemColumns: Column<InvoiceItem & { id?: string }>[] = [
    { key: 'description', header: 'Description' },
    {
      key: 'itemType',
      header: 'Type',
      render: (i) => <span className="capitalize">{i.itemType.replace('_', ' ')}</span>,
    },
    { key: 'quantity', header: 'Qty' },
    { key: 'unitPrice', header: 'Unit price', render: (i) => formatMoney(i.unitPrice) },
    {
      key: 'totalPrice',
      header: 'Total',
      render: (i) => <span className="font-semibold">{formatMoney(i.totalPrice)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{invoice.invoiceId}</h1>
            <InvoiceStatusBadge status={invoice.invoiceStatus} />
            <InvoicePaymentBadge status={invoice.paymentStatus} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(invoice.createdAt)}
            {invoice.patientId && (
              <>
                {' · '}
                <Link className="text-brand-800 hover:underline" to={`/patients/${invoice.patientId._id}`}>
                  {invoice.patientId.firstName} {invoice.patientId.lastName} (
                  {invoice.patientId.patientId})
                </Link>
              </>
            )}
            {invoice.createdBy && (
              <>
                {' · '}by {invoice.createdBy.firstName} {invoice.createdBy.lastName}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/billing/invoices">
            <Button variant="ghost">Back to list</Button>
          </Link>
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
          {canOperate && invoice.invoiceStatus === 'draft' && (
            <Button onClick={() => setConfirm('issue')}>Issue invoice</Button>
          )}
          {canOperate && invoice.invoiceStatus === 'issued' && invoice.dueAmount > 0 && (
            <Button onClick={() => setPayOpen(true)}>Record payment</Button>
          )}
          {isAdmin && invoice.invoiceStatus !== 'cancelled' && invoice.amountPaid === 0 && (
            <Button variant="danger" onClick={() => setConfirm('cancel')}>
              Cancel invoice
            </Button>
          )}
        </div>
      </div>

      {notice && <Alert tone="success" className="print:hidden">{notice}</Alert>}
      {error && <Alert tone="error" className="print:hidden">{error}</Alert>}
      {invoice.invoiceStatus === 'issued' && (
        <Alert tone="info" className="print:hidden">
          Issued invoices are read-only — only payments and refunds can be applied.
        </Alert>
      )}

      <Card title="Items">
        <Table columns={itemColumns} rows={invoice.items.map((i, idx) => ({ ...i, id: String(idx) }))} />
        <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Subtotal</dt>
            <dd className="text-slate-800">{formatMoney(invoice.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Discount</dt>
            <dd className="text-slate-800">−{formatMoney(invoice.discount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Tax</dt>
            <dd className="text-slate-800">+{formatMoney(invoice.tax)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base">
            <dt className="font-semibold text-slate-800">Total</dt>
            <dd className="font-semibold text-slate-900">{formatMoney(invoice.totalAmount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Paid</dt>
            <dd className="text-emerald-700">{formatMoney(invoice.amountPaid)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Due</dt>
            <dd className={invoice.dueAmount > 0 ? 'font-semibold text-rose-600' : 'text-slate-800'}>
              {formatMoney(invoice.dueAmount)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Payment history" className="print:hidden">
        {payments.length === 0 ? (
          <p className="text-sm text-slate-400">No payments recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li
                key={p._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-800">
                    {p.paymentId} · {p.type === 'refund' ? '−' : ''}
                    {formatMoney(p.amount)} · {methodLabel(p.method)}
                  </p>
                  <p className="text-slate-500">
                    {formatDate(p.paidAt)}
                    {p.receivedBy && (
                      <>
                        {' · '}by {p.receivedBy.firstName} {p.receivedBy.lastName}
                      </>
                    )}
                    {p.transactionReference && <> · Ref: {p.transactionReference}</>}
                    {p.notes && <> · {p.notes}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PaymentRecordBadge status={p.status} type={p.type} />
                  {isAdmin && p.type === 'payment' && p.status === 'completed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRefunding(p);
                        setRefundForm({ amount: '', notes: '' });
                      }}
                    >
                      Refund
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Record payment modal */}
      <Modal
        open={payOpen}
        onClose={busy ? undefined : () => setPayOpen(false)}
        title={`Record payment — due ${formatMoney(invoice.dueAmount)}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="payment-form" loading={busy}>
              Record payment
            </Button>
          </>
        }
      >
        <form id="payment-form" onSubmit={handlePay} noValidate className="space-y-4">
          <Input
            label="Amount"
            type="number"
            min={0.01}
            step="0.01"
            max={invoice.dueAmount}
            value={payForm.amount}
            onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
            hint={`Outstanding: ${formatMoney(invoice.dueAmount)}`}
            autoFocus
          />
          <Select
            label="Method"
            value={payForm.method}
            onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: methodLabel(m) }))}
          />
          <Input
            label="Transaction reference"
            value={payForm.reference}
            onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
            hint="Optional — never store card numbers or credentials"
          />
          <Input
            label="Notes"
            value={payForm.notes}
            onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
            hint="Optional"
          />
        </form>
      </Modal>

      {/* Refund modal (admin) */}
      <Modal
        open={Boolean(refunding)}
        onClose={busy ? undefined : () => setRefunding(null)}
        title={`Refund ${refunding?.paymentId ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefunding(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (!refunding) return;
                const amount = Number(refundForm.amount);
                if (!Number.isFinite(amount) || amount <= 0) {
                  setError('Enter a positive refund amount.');
                  return;
                }
                const target = refunding;
                setRefunding(null);
                await act(
                  () =>
                    recordRefund({
                      paymentId: target._id,
                      amount,
                      notes: refundForm.notes.trim() || undefined,
                    }),
                  'Refund recorded.'
                );
              }}
            >
              Record refund
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Refund amount"
            type="number"
            min={0.01}
            step="0.01"
            max={refunding?.amount}
            value={refundForm.amount}
            onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))}
            hint={`Paid: ${formatMoney(refunding?.amount ?? 0)}`}
            autoFocus
          />
          <Input
            label="Notes"
            value={refundForm.notes}
            onChange={(e) => setRefundForm((f) => ({ ...f, notes: e.target.value }))}
            hint="Optional"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm === 'issue' ? 'Issue invoice' : 'Cancel invoice'}
        confirmLabel={confirm === 'issue' ? 'Issue' : 'Cancel invoice'}
        tone={confirm === 'issue' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={async () => {
          const action = confirm;
          setConfirm(null);
          if (action === 'issue') {
            await act(() => setInvoiceStatus(invoice._id, 'issued'), 'Invoice issued.');
          } else if (action === 'cancel') {
            await act(() => setInvoiceStatus(invoice._id, 'cancelled'), 'Invoice cancelled.');
          }
        }}
        onCancel={() => setConfirm(null)}
      >
        {confirm === 'issue' ? (
          <p>Issuing locks the invoice — items can no longer be edited, and payments can be recorded.</p>
        ) : (
          <p>The invoice will be cancelled but kept as a historical record. It cannot receive payments.</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
