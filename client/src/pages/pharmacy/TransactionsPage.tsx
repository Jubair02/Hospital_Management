import { useCallback, useEffect, useState } from 'react';
import { getTransactions } from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Pagination as PaginationInfo, StockTransaction } from '../../types';
import Card from '../../components/ui/Card';
import Badge, { type BadgeTone } from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';
import PageHeader from '../../components/ui/PageHeader';

const TYPE_TONES: Record<StockTransaction['type'], { label: string; tone: BadgeTone }> = {
  stock_in: { label: 'Stock in', tone: 'green' },
  dispense: { label: 'Dispense', tone: 'blue' },
  adjustment: { label: 'Adjustment', tone: 'amber' },
  expiry: { label: 'Expiry', tone: 'red' },
  return: { label: 'Return', tone: 'slate' },
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getTransactions({ page, limit: 15, type: type || undefined });
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load transactions.'));
    } finally {
      setLoading(false);
    }
  }, [page, type]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<StockTransaction>[] = [
    {
      key: 'transactionId',
      header: 'ID',
      render: (t) => <span className="font-medium text-brand-800">{t.transactionId}</span>,
    },
    { key: 'date', header: 'Date', render: (t) => formatDate(t.createdAt) },
    {
      key: 'type',
      header: 'Type',
      render: (t) => {
        const { label, tone } = TYPE_TONES[t.type];
        return <Badge tone={tone}>{label}</Badge>;
      },
    },
    {
      key: 'medicine',
      header: 'Medicine',
      render: (t) => t.medicineId?.name ?? '—',
    },
    {
      key: 'batch',
      header: 'Batch',
      render: (t) => t.batchId?.batchNumber ?? '—',
    },
    {
      key: 'quantityChange',
      header: 'Change',
      render: (t) => (
        <span className={t.quantityChange < 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-700'}>
          {t.quantityChange > 0 ? `+${t.quantityChange}` : t.quantityChange}
        </span>
      ),
    },
    { key: 'balanceAfter', header: 'Balance' },
    {
      key: 'performedBy',
      header: 'By',
      render: (t) =>
        t.performedBy ? `${t.performedBy.firstName} ${t.performedBy.lastName}` : '—',
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (t) => t.reference || t.notes || <span className="text-slate-400">—</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock transactions"
        subtitle="The immutable ledger of every inventory movement."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="max-w-xs">
          <Select
            aria-label="Filter by type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            options={Object.entries(TYPE_TONES).map(([value, { label }]) => ({ value, label }))}
            placeholder="All types"
          />
        </div>
      </Card>

      <Table
        columns={columns}
        rows={transactions}
        loading={loading}
        emptyState={<p className="text-center text-sm text-slate-500">No transactions yet.</p>}
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
