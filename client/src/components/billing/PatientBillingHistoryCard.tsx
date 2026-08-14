import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getInvoices, formatMoney } from '../../services/billingService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Invoice, Pagination as PaginationInfo } from '../../types';
import Card from '../ui/Card';
import Alert from '../ui/Alert';
import Table, { type Column } from '../ui/Table';
import Pagination from '../ui/Pagination';
import { InvoicePaymentBadge, InvoiceStatusBadge } from './BillingBadges';

/** Billing history section on the patient profile. */
export default function PatientBillingHistoryCard({ patientMongoId }: { patientMongoId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getInvoices({ patientId: patientMongoId, page, limit: 5 });
      setInvoices(data.invoices);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load billing history.'));
    } finally {
      setLoading(false);
    }
  }, [patientMongoId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceId',
      header: 'Invoice',
      render: (i) => (
        <Link to={`/billing/invoices/${i._id}`} className="font-medium text-brand-800 hover:underline">
          {i.invoiceId}
        </Link>
      ),
    },
    { key: 'date', header: 'Date', render: (i) => formatDate(i.createdAt) },
    { key: 'total', header: 'Total', render: (i) => formatMoney(i.totalAmount) },
    { key: 'paid', header: 'Paid', render: (i) => formatMoney(i.amountPaid) },
    {
      key: 'due',
      header: 'Due',
      render: (i) => (
        <span className={i.dueAmount > 0 ? 'font-semibold text-rose-600' : undefined}>
          {formatMoney(i.dueAmount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => (
        <span className="flex gap-1.5">
          <InvoiceStatusBadge status={i.invoiceStatus} />
          <InvoicePaymentBadge status={i.paymentStatus} />
        </span>
      ),
    },
  ];

  return (
    <Card title="Billing history" subtitle="Invoices for this patient">
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <Table
        columns={columns}
        rows={invoices}
        loading={loading}
        emptyState={<p className="text-center text-sm text-slate-500">No invoices yet.</p>}
      />
      <div className="mt-3">
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={setPage}
          disabled={loading}
        />
      </div>
    </Card>
  );
}
