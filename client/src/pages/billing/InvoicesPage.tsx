import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getInvoices, formatMoney } from '../../services/billingService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Invoice, Pagination as PaginationInfo } from '../../types';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import Icon from '../../components/ui/icons';
import { InvoicePaymentBadge, InvoiceStatusBadge } from '../../components/billing/BillingBadges';
import PageHeader from '../../components/ui/PageHeader';
import BackLink from '../../components/ui/BackLink';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getInvoices({
        page,
        limit: 10,
        search: search || undefined,
        invoiceStatus: invoiceStatus || undefined,
        paymentStatus: paymentStatus || undefined,
      });
      setInvoices(data.invoices);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load invoices.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, invoiceStatus, paymentStatus]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filtered = Boolean(search || invoiceStatus || paymentStatus);

  const clearFilters = () => {
    setSearchInput('');
    setInvoiceStatus('');
    setPaymentStatus('');
    setPage(1);
  };

  /**
   * Six columns, not nine. The date belongs under the invoice number it
   * identifies, the amount already paid belongs under the total it came out
   * of, and the two statuses are read together — splitting them into separate
   * columns bought a horizontal scrollbar and nothing else.
   */
  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceId',
      header: 'Invoice',
      render: (i) => (
        <div className="min-w-0">
          <Link
            to={`/billing/invoices/${i._id}`}
            className="font-semibold tabular-nums text-brand-800 transition-colors hover:text-brand-900 hover:underline"
          >
            {i.invoiceId}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">{formatDate(i.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (i) =>
        i.patientId ? (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">
              {i.patientId.firstName} {i.patientId.lastName}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-500">{i.patientId.patientId}</p>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right',
      render: (i) => (
        <div>
          <p className="font-semibold tabular-nums text-slate-900">{formatMoney(i.totalAmount)}</p>
          {i.amountPaid > 0 && (
            <p className="mt-0.5 text-xs tabular-nums text-accent-700">
              {formatMoney(i.amountPaid)} paid
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      className: 'text-right',
      render: (i) => (
        <span
          className={`tabular-nums ${
            i.dueAmount > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'
          }`}
        >
          {formatMoney(i.dueAmount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <InvoiceStatusBadge status={i.invoiceStatus} />
          <InvoicePaymentBadge status={i.paymentStatus} />
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (i) => (
        <Link to={`/billing/invoices/${i._id}`}>
          <Button variant="ghost" size="sm">
            Open
            <Icon name="chevronRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <BackLink to="/billing" label="Billing" />

        <PageHeader
          eyebrow="Billing"
          title="Invoices"
          subtitle="Every patient invoice, newest first."
          actions={
            <Link to="/billing/invoices/new">
              <Button>
                <Icon name="plus" className="h-4 w-4" />
                New invoice
              </Button>
            </Link>
          }
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search invoice ID or patient…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search invoices"
            className="lg:col-span-2"
          />
          <Select
            aria-label="Filter by invoice status"
            value={invoiceStatus}
            onChange={(e) => {
              setInvoiceStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'issued', label: 'Issued' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
            placeholder="All invoice statuses"
          />
          <Select
            aria-label="Filter by payment status"
            value={paymentStatus}
            onChange={(e) => {
              setPaymentStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'unpaid', label: 'Unpaid' },
              { value: 'partially_paid', label: 'Partially paid' },
              { value: 'paid', label: 'Paid' },
              { value: 'refunded', label: 'Refunded' },
            ]}
            placeholder="All payment statuses"
          />
        </div>

        {/* Only present once something is actually filtered — an always-visible
            "clear" row is a permanent reminder of a control nobody used. */}
        {filtered && (
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5">
            <p className="text-xs text-slate-500">
              {loading
                ? 'Searching…'
                : `${pagination.total.toLocaleString()} matching invoice${
                    pagination.total === 1 ? '' : 's'
                  }`}
            </p>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      <Table
        columns={columns}
        rows={invoices}
        loading={loading}
        emptyState={
          <EmptyState
            title={filtered ? 'No invoices match these filters' : 'No invoices yet'}
            description={
              filtered
                ? 'Widen the search, or clear the filters to see every invoice.'
                : 'Bill a consultation, a lab order, or a dispensing to create the first one.'
            }
            action={
              filtered ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Link to="/billing/invoices/new">
                  <Button size="sm">New invoice</Button>
                </Link>
              )
            }
          />
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
