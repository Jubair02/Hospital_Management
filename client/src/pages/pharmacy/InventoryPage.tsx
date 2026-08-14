import { useCallback, useEffect, useState } from 'react';
import {
  getInventory,
  getMedicines,
  type InventoryQuery,
} from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { InventoryBatch, Medicine, Pagination as PaginationInfo } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import StockInModal from '../../components/pharmacy/StockInModal';
import AdjustStockModal from '../../components/pharmacy/AdjustStockModal';
import PageHeader from '../../components/ui/PageHeader';

const VIEW_OPTIONS = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'expiring_soon', label: 'Expiring soon (30 days)' },
  { value: 'expired', label: 'Expired' },
  { value: 'depleted', label: 'Depleted' },
];

const medicineName = (b: InventoryBatch): string =>
  typeof b.medicineId === 'object' && b.medicineId
    ? `${b.medicineId.name}${b.medicineId.strength ? ` ${b.medicineId.strength}` : ''}`
    : '—';

export default function InventoryPage() {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [view, setView] = useState('');
  const [medicineFilter, setMedicineFilter] = useState('');
  const [page, setPage] = useState(1);

  const [stockInOpen, setStockInOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryBatch | null>(null);

  useEffect(() => {
    getMedicines({ limit: 100 })
      .then((data) => setMedicines(data.medicines))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: InventoryQuery = {
        page,
        limit: 10,
        medicineId: medicineFilter || undefined,
        view: (view || undefined) as InventoryQuery['view'],
      };
      const data = await getInventory(params);
      setBatches(data.batches);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load inventory.'));
    } finally {
      setLoading(false);
    }
  }, [page, view, medicineFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const columns: Column<InventoryBatch>[] = [
    {
      key: 'batchId',
      header: 'Batch',
      render: (b) => (
        <div>
          <p className="font-medium text-brand-800">{b.batchId}</p>
          <p className="text-slate-500">{b.batchNumber}</p>
        </div>
      ),
    },
    { key: 'medicine', header: 'Medicine', render: medicineName },
    {
      key: 'quantity',
      header: 'Quantity',
      render: (b) => (
        <span className={`font-semibold ${b.quantity === 0 ? 'text-slate-400' : 'text-slate-800'}`}>
          {b.quantity}
          <span className="ml-1 font-normal text-slate-400">/ {b.initialQuantity}</span>
        </span>
      ),
    },
    { key: 'unitCost', header: 'Unit cost', render: (b) => b.unitCost.toFixed(2) },
    { key: 'sellingPrice', header: 'Price', render: (b) => b.sellingPrice.toFixed(2) },
    {
      key: 'expiryDate',
      header: 'Expiry',
      render: (b) => {
        const expired = new Date(b.expiryDate).getTime() <= Date.now();
        const soon =
          !expired &&
          new Date(b.expiryDate).getTime() <= Date.now() + 30 * 86_400_000;
        return (
          <div className="flex items-center gap-2">
            <span>{formatDate(b.expiryDate)}</span>
            {expired && b.quantity > 0 && <Badge tone="red">Expired</Badge>}
            {soon && <Badge tone="amber">Soon</Badge>}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (b) => (
        <Button variant="secondary" size="sm" onClick={() => setAdjusting(b)}>
          Adjust
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle="Stock batches — earliest expiry is dispensed first (FEFO)."
        actions={
          <Button onClick={() => setStockInOpen(true)}>Receive stock</Button>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select
            aria-label="Filter by medicine"
            value={medicineFilter}
            onChange={(e) => {
              setMedicineFilter(e.target.value);
              setPage(1);
            }}
            options={medicines.map((m) => ({
              value: m._id,
              label: `${m.name}${m.strength ? ` ${m.strength}` : ''}`,
            }))}
            placeholder="All medicines"
          />
          <Select
            aria-label="Filter by stock status"
            value={view}
            onChange={(e) => {
              setView(e.target.value);
              setPage(1);
            }}
            options={VIEW_OPTIONS}
            placeholder="All batches"
          />
        </div>
      </Card>

      <Table
        columns={columns}
        rows={batches}
        loading={loading}
        emptyState={
          <EmptyState
            title="No batches found"
            description="Receive stock to create the first inventory batch."
            action={
              <Button size="sm" onClick={() => setStockInOpen(true)}>
                Receive stock
              </Button>
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

      <StockInModal
        open={stockInOpen}
        medicines={medicines}
        onClose={() => setStockInOpen(false)}
        onSaved={(batch) => {
          setStockInOpen(false);
          flash(`Batch ${batch.batchNumber} received.`);
          load();
        }}
      />

      <AdjustStockModal
        open={Boolean(adjusting)}
        batch={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={(batch) => {
          setAdjusting(null);
          flash(`Batch ${batch.batchNumber} adjusted to ${batch.quantity} units.`);
          load();
        }}
      />
    </div>
  );
}
