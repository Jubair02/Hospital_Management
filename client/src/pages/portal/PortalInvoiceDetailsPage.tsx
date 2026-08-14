import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getInvoice, type PortalInvoiceData } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { formatMoney } from '../../utils/money';
import { formatDate } from '../../utils/date';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import PageHeader from '../../components/ui/PageHeader';
import Table, { type Column } from '../../components/ui/Table';
import { StatusBadge, humanize } from './portalShared';

type ItemRow = PortalInvoiceData['invoice']['items'][number] & { id: string };

export default function PortalInvoiceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PortalInvoiceData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getInvoice(id)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, 'Unable to load this invoice.')));
  }, [id]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <FullPageSpinner label="Loading invoice" />;

  const { invoice, payments } = data;

  const itemColumns: Column<ItemRow>[] = [
    {
      key: 'description',
      header: 'Item',
      render: (i) => (
        <div>
          <p className="font-medium text-slate-800">{i.description}</p>
          <p className="text-slate-500">{humanize(i.itemType)}</p>
        </div>
      ),
    },
    { key: 'quantity', header: 'Qty', render: (i) => <span className="tabular-nums">{i.quantity}</span> },
    {
      key: 'unitPrice',
      header: 'Unit price',
      render: (i) => <span className="tabular-nums">{formatMoney(i.unitPrice)}</span>,
    },
    {
      key: 'totalPrice',
      header: 'Total',
      render: (i) => <span className="font-semibold tabular-nums">{formatMoney(i.totalPrice)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title={invoice.invoiceId}
        subtitle={`Issued ${formatDate(invoice.createdAt)}`}
        meta={
          <>
            <StatusBadge status={invoice.invoiceStatus} />
            <StatusBadge status={invoice.paymentStatus} />
          </>
        }
        actions={
          <Link to="/patient/billing">
            <Button variant="secondary">All invoices</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Items" className="xl:col-span-2">
          <Table
            columns={itemColumns}
            rows={invoice.items.map((item, index) => ({ ...item, id: `${invoice._id}:${index}` }))}
          />
        </Card>

        <div className="space-y-6">
          <Card title="Summary">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="tabular-nums text-slate-800">{formatMoney(invoice.subtotal)}</dd>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Discount</dt>
                  <dd className="tabular-nums text-slate-800">−{formatMoney(invoice.discount)}</dd>
                </div>
              )}
              {invoice.tax > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tax</dt>
                  <dd className="tabular-nums text-slate-800">+{formatMoney(invoice.tax)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <dt className="font-medium text-slate-700">Total</dt>
                <dd className="font-semibold tabular-nums text-slate-900">
                  {formatMoney(invoice.totalAmount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Paid</dt>
                <dd className="tabular-nums text-emerald-700">{formatMoney(invoice.amountPaid)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Due</dt>
                <dd
                  className={`tabular-nums ${
                    invoice.dueAmount > 0 ? 'font-semibold text-rose-700' : 'text-slate-500'
                  }`}
                >
                  {formatMoney(invoice.dueAmount)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Payments">
            {payments.length === 0 ? (
              <EmptyState title="No payments yet" description="Pay at the reception desk." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {payments.map((payment) => (
                  <li key={payment._id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {payment.paymentId}
                        {payment.type === 'refund' && ' · refund'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDate(payment.paidAt)} · {humanize(payment.method)}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        payment.type === 'refund' ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {payment.type === 'refund' ? '−' : ''}
                      {formatMoney(payment.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
