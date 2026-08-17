import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useSettings from '../../hooks/useSettings';
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
  canOperateBilling,
  canReverseBilling,
  canViewBillingDesk,
} from '../../utils/permissions';
import {
  PAYMENT_METHODS,
  type BillingPayment,
  type Invoice,
  type PaymentMethod,
} from '../../types';
import Button from '../../components/ui/Button';
import BackLink from '../../components/ui/BackLink';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import {
  InvoiceItemTypeBadge,
  InvoicePaymentBadge,
  InvoiceStatusBadge,
  PaymentRecordBadge,
  methodLabel,
} from '../../components/billing/BillingBadges';

/** One figure in the strip under the invoice heading. */
function Figure({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'paid' | 'due';
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-[0.9375rem] font-semibold tabular-nums ${
          tone === 'due' ? 'text-rose-600' : tone === 'paid' ? 'text-accent-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** A line in the totals block at the foot of the items table. */
function TotalRow({
  label,
  value,
  tone = 'default',
  emphasis = false,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'paid' | 'due';
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-6 ${
        emphasis ? 'border-t border-line pt-2.5 text-base' : 'text-sm'
      }`}
    >
      <dt className={emphasis ? 'font-semibold text-slate-800' : 'text-slate-500'}>{label}</dt>
      <dd
        className={`tabular-nums ${
          tone === 'due'
            ? 'font-semibold text-rose-600'
            : tone === 'paid'
              ? 'text-accent-700'
              : emphasis
                ? 'font-semibold text-slate-900'
                : 'text-slate-800'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function InvoiceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { role } = useAuth();
  const { hospitalName } = useSettings();
  const canReverse = canReverseBilling(role);
  const canOperate = canOperateBilling(role);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>(
    () => (location.state as { flash?: string } | null)?.flash ?? ''
  );

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', reference: '', notes: '' });
  const [payError, setPayError] = useState('');
  const [refunding, setRefunding] = useState<BillingPayment | null>(null);
  const [refundForm, setRefundForm] = useState({ amount: '', notes: '' });
  const [refundError, setRefundError] = useState('');
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
    // Validated into the dialog rather than onto the page behind it — a page
    // alert under an open modal is a message nobody reads.
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayError('Enter a payment amount greater than zero.');
      return;
    }
    if (amount > invoice.dueAmount) {
      setPayError(`That is more than the ${formatMoney(invoice.dueAmount)} outstanding.`);
      return;
    }
    setPayError('');
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

  const handleRefund = async () => {
    if (!refunding) return;
    const amount = Number(refundForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRefundError('Enter a refund amount greater than zero.');
      return;
    }
    if (amount > refunding.amount) {
      setRefundError(`That is more than the ${formatMoney(refunding.amount)} taken.`);
      return;
    }
    const target = refunding;
    setRefundError('');
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
  };

  if (loading) return <FullPageSpinner label="Loading invoice" />;

  if (!invoice) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <Alert tone="error">{error || 'This invoice could not be found.'}</Alert>
        <Link to={canViewBillingDesk(role) ? '/billing/invoices' : '/'}>
          <Button variant="secondary">
            {canViewBillingDesk(role) ? 'Back to invoices' : 'Back to dashboard'}
          </Button>
        </Link>
      </div>
    );
  }

  const patientName = invoice.patientId
    ? `${invoice.patientId.firstName} ${invoice.patientId.lastName}`
    : null;

  // Doctors and nurses can read an invoice but have no billing desk to go back
  // to, so they are sent to the patient the invoice belongs to instead.
  const back = canViewBillingDesk(role)
    ? { to: '/billing/invoices', label: 'Invoices' }
    : invoice.patientId
      ? { to: `/patients/${invoice.patientId._id}`, label: patientName ?? 'Patient' }
      : null;

  const showIssue = canOperate && invoice.invoiceStatus === 'draft';
  const showPay = canOperate && invoice.invoiceStatus === 'issued' && invoice.dueAmount > 0;
  const showCancel = canReverse && invoice.invoiceStatus !== 'cancelled' && invoice.amountPaid === 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {back && (
        <div className="print:hidden">
          <BackLink to={back.to} label={back.label} />
        </div>
      )}

      {/* Letterhead — on paper only. A printed invoice with no hospital name on
          it is not a document anyone can file. */}
      <div className="hidden print:block">
        <p className="text-lg font-semibold text-slate-900">{hospitalName}</p>
        <p className="mt-0.5 text-xs text-slate-500">Invoice {invoice.invoiceId}</p>
      </div>

      {/* One surface carrying who owes what. The invoice number used to be the
          heading; it is a filing code, and the patient is the subject. */}
      <section className="surface-card relative overflow-hidden print:border-0 print:shadow-none">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-white print:hidden"
        />

        <div className="relative p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-xl font-semibold tracking-[-0.014em] text-slate-900 sm:text-2xl">
              {patientName ?? invoice.invoiceId}
            </h1>
            <InvoiceStatusBadge status={invoice.invoiceStatus} />
            <InvoicePaymentBadge status={invoice.paymentStatus} />
          </div>

          <p className="mt-1.5 text-sm text-slate-500">
            {invoice.patientId && (
              <>
                <Link
                  className="font-medium text-brand-800 transition-colors hover:text-brand-900 hover:underline"
                  to={`/patients/${invoice.patientId._id}`}
                >
                  {invoice.patientId.patientId}
                </Link>
                {' · '}
              </>
            )}
            Invoice{' '}
            <span className="font-semibold tabular-nums text-slate-700">{invoice.invoiceId}</span>
            {' · '}
            {formatDate(invoice.createdAt)}
            {invoice.createdBy && (
              <>
                {' · '}by {invoice.createdBy.firstName} {invoice.createdBy.lastName}
              </>
            )}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4 sm:grid-cols-4">
            <Figure label="Total" value={formatMoney(invoice.totalAmount)} />
            <Figure label="Paid" value={formatMoney(invoice.amountPaid)} tone="paid" />
            <Figure
              label="Due"
              value={formatMoney(invoice.dueAmount)}
              tone={invoice.dueAmount > 0 ? 'due' : 'default'}
            />
            <Figure
              label="Items"
              value={`${invoice.items.length} line${invoice.items.length === 1 ? '' : 's'}`}
            />
          </dl>
        </div>

        {/* Only the actions — the way back sits above the heading. */}
        <div className="relative flex flex-col gap-2 border-t border-line bg-slate-50/70 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end print:hidden">
          {showCancel && (
            <Button
              variant="dangerGhost"
              className="w-full sm:mr-auto sm:w-auto"
              onClick={() => setConfirm('cancel')}
            >
              Cancel invoice
            </Button>
          )}
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => window.print()}>
            Print
          </Button>
          {showIssue && (
            <Button className="w-full sm:w-auto" onClick={() => setConfirm('issue')}>
              Issue invoice
            </Button>
          )}
          {showPay && (
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setPayError('');
                setPayForm((f) => ({ ...f, amount: '' }));
                setPayOpen(true);
              }}
            >
              Record payment
            </Button>
          )}
        </div>
      </section>

      {notice && (
        <Alert tone="success" className="print:hidden">
          {notice}
        </Alert>
      )}
      {error && (
        <Alert tone="error" className="print:hidden">
          {error}
        </Alert>
      )}
      {invoice.invoiceStatus === 'draft' && canOperate && (
        <Alert tone="info" className="print:hidden">
          This is a draft. Issue it to lock the items and start accepting payments.
        </Alert>
      )}
      {invoice.invoiceStatus === 'issued' && (
        <Alert tone="info" className="print:hidden">
          Issued invoices are read-only — only payments and refunds can be applied.
        </Alert>
      )}
      {invoice.invoiceStatus === 'cancelled' && (
        <Alert tone="warning" className="print:hidden">
          This invoice was cancelled. It is kept as a historical record and cannot take payments.
        </Alert>
      )}

      {/* The invoice document itself: lines, then what they add up to. Written
          as one table with its totals attached rather than a table nested in a
          card with a separate summary list beside it. */}
      <Card title="Items" icon="clipboard" padded={false} className="print:shadow-none">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50/80 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-slate-500">
                <th scope="col" className="px-5 py-3 text-left">
                  Description
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  Qty
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  Unit price
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoice.items.map((item, index) => (
                <tr key={`${item.referenceId ?? item.description}-${index}`}>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-800">{item.description}</p>
                    <p className="mt-1.5">
                      <InvoiceItemTypeBadge type={item.itemType} />
                    </p>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-slate-600">
                    {item.quantity}
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-slate-600">
                    {formatMoney(item.unitPrice)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                    {formatMoney(item.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-line bg-slate-50/60 px-5 py-4">
          <dl className="ml-auto w-full max-w-xs space-y-2">
            <TotalRow label="Subtotal" value={formatMoney(invoice.subtotal)} />
            {invoice.discount > 0 && (
              <TotalRow label="Discount" value={`−${formatMoney(invoice.discount)}`} />
            )}
            {invoice.tax > 0 && <TotalRow label="Tax" value={`+${formatMoney(invoice.tax)}`} />}
            <TotalRow label="Total" value={formatMoney(invoice.totalAmount)} emphasis />
            <TotalRow label="Paid" value={formatMoney(invoice.amountPaid)} tone="paid" />
            <TotalRow
              label="Due"
              value={formatMoney(invoice.dueAmount)}
              tone={invoice.dueAmount > 0 ? 'due' : 'default'}
            />
          </dl>
        </div>
      </Card>

      <Card
        title="Payments"
        subtitle={
          payments.length > 0
            ? `${payments.length} record${payments.length === 1 ? '' : 's'} against this invoice`
            : undefined
        }
        icon="cash"
        className="print:shadow-none"
      >
        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">
            No payments recorded yet.
            {showPay && ' Use “Record payment” above to take the first one.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li
                key={p._id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <span
                      className={`text-[0.9375rem] font-semibold tabular-nums ${
                        p.type === 'refund' ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {p.type === 'refund' ? '−' : ''}
                      {formatMoney(p.amount)}
                    </span>
                    <PaymentRecordBadge status={p.status} type={p.type} />
                    <span className="text-xs text-slate-500">{methodLabel(p.method)}</span>
                  </div>

                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    <span className="tabular-nums">{p.paymentId}</span>
                    {' · '}
                    {formatDate(p.paidAt)}
                    {p.receivedBy && (
                      <>
                        {' · '}by {p.receivedBy.firstName} {p.receivedBy.lastName}
                      </>
                    )}
                    {p.transactionReference && <> {'·'} Ref {p.transactionReference}</>}
                  </p>
                  {p.notes && (
                    <p className="mt-1 text-pretty text-xs leading-relaxed text-slate-600">
                      “{p.notes}”
                    </p>
                  )}
                </div>

                {canReverse && p.type === 'payment' && p.status === 'completed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="print:hidden"
                    onClick={() => {
                      setRefunding(p);
                      setRefundForm({ amount: '', notes: '' });
                      setRefundError('');
                    }}
                  >
                    Refund
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Record payment */}
      <Modal
        open={payOpen}
        onClose={busy ? undefined : () => setPayOpen(false)}
        title="Record payment"
        description={`${formatMoney(invoice.dueAmount)} outstanding on ${invoice.invoiceId}.`}
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
          {payError && <Alert tone="error">{payError}</Alert>}
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

      {/* Refund (admin) */}
      <Modal
        open={Boolean(refunding)}
        onClose={busy ? undefined : () => setRefunding(null)}
        title="Record refund"
        description={
          refunding
            ? `${formatMoney(refunding.amount)} was taken on ${refunding.paymentId}.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefunding(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={handleRefund}>
              Record refund
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {refundError && <Alert tone="error">{refundError}</Alert>}
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
            hint="Optional — why the money is going back"
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
