import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getInvoices } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { formatMoney } from '../../utils/money';
import { formatDate } from '../../utils/date';
import type { Pagination as PaginationInfo, PortalInvoice } from '../../types';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Table, { type Column } from '../../components/ui/Table';
import { StatusBadge } from './portalShared';

export default function PortalBillingPage() {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInvoices({ page, limit: 10 });
      setInvoices(data.invoices);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load your invoices.'));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<PortalInvoice>[] = [
    {
      key: 'invoiceId',
      header: 'Invoice',
      render: (i) => (
        <Link
          to={`/patient/billing/${i._id}`}
          className="font-medium text-brand-700 hover:text-brand-800"
        >
          {i.invoiceId}
        </Link>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (i) => <span className="whitespace-nowrap">{formatDate(i.createdAt)}</span>,
    },
    {
      key: 'totalAmount',
      header: 'Total',
      render: (i) => <span className="font-semibold tabular-nums">{formatMoney(i.totalAmount)}</span>,
    },
    {
      key: 'amountPaid',
      header: 'Paid',
      render: (i) => <span className="tabular-nums text-emerald-700">{formatMoney(i.amountPaid)}</span>,
    },
    {
      key: 'dueAmount',
      header: 'Due',
      render: (i) => (
        <span className={`tabular-nums ${i.dueAmount > 0 ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
          {formatMoney(i.dueAmount)}
        </span>
      ),
    },
    { key: 'paymentStatus', header: 'Payment', render: (i) => <StatusBadge status={i.paymentStatus} /> },
    { key: 'invoiceStatus', header: 'Status', render: (i) => <StatusBadge status={i.invoiceStatus} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title="Billing"
        subtitle="Your invoices and what has been paid. Payments are made at the reception desk."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Table
        columns={columns}
        rows={invoices}
        loading={loading}
        emptyState={
          <EmptyState title="No invoices" description="Issued invoices will appear here." />
        }
        footer={
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            disabled={loading}
          />
        }
      />
    </div>
  );
}
