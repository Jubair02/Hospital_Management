import { useCallback, useEffect, useState } from 'react';
import { getMedications } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type {
  Pagination as PaginationInfo,
  PortalDispensing,
  PortalFulfillment,
} from '../../types';
import Alert from '../../components/ui/Alert';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Table, { type Column } from '../../components/ui/Table';
import { StatusBadge } from './portalShared';

export default function PortalMedicationsPage() {
  const [fulfillments, setFulfillments] = useState<PortalFulfillment[] | null>(null);
  const [dispensings, setDispensings] = useState<PortalDispensing[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getMedications({ page, limit: 10 });
      setFulfillments(data.fulfillments);
      setDispensings(data.dispensings);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load your medications.'));
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (fulfillments === null) return <FullPageSpinner label="Loading medications" />;

  const fulfillmentColumns: Column<PortalFulfillment>[] = [
    {
      key: 'medicineName',
      header: 'Medicine',
      render: (f) => <span className="font-medium text-slate-800">{f.medicineName}</span>,
    },
    {
      key: 'prescribedQuantity',
      header: 'Prescribed',
      render: (f) => <span className="tabular-nums">{f.prescribedQuantity}</span>,
    },
    {
      key: 'dispensedQuantity',
      header: 'Dispensed',
      render: (f) => <span className="tabular-nums">{f.dispensedQuantity}</span>,
    },
    {
      key: 'remaining',
      header: 'Remaining',
      render: (f) => <span className="tabular-nums">{f.remaining}</span>,
    },
    { key: 'status', header: 'Status', render: (f) => <StatusBadge status={f.status} /> },
    {
      key: 'updatedAt',
      header: 'Last update',
      render: (f) => (
        <span className="whitespace-nowrap text-slate-500">{formatDate(f.updatedAt)}</span>
      ),
    },
  ];

  const dispensingColumns: Column<PortalDispensing>[] = [
    {
      key: 'dispensingId',
      header: 'Reference',
      render: (d) => <span className="font-medium text-slate-800">{d.dispensingId}</span>,
    },
    {
      key: 'items',
      header: 'Medicines',
      render: (d) => (
        <span className="text-slate-600">
          {d.items.map((item) => `${item.medicineName} ×${item.quantity}`).join(', ')}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (d) => (
        <span className="whitespace-nowrap text-slate-500">{formatDate(d.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title="Medications"
        subtitle="How the pharmacy has filled your prescriptions, and every pickup on record."
      />

      <Card
        title="Prescription fulfillment"
        subtitle="Progress of each prescribed medicine at the pharmacy."
      >
        <Table
          columns={fulfillmentColumns}
          rows={fulfillments}
          emptyState={
            <EmptyState
              title="Nothing at the pharmacy yet"
              description="Once the pharmacy starts filling a prescription, progress shows here."
            />
          }
        />
      </Card>

      <Card title="Dispensing history" subtitle="Each pharmacy pickup.">
        <Table
          columns={dispensingColumns}
          rows={dispensings}
          emptyState={<EmptyState title="No pickups yet" />}
        />
        <div className="mt-4">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
          />
        </div>
      </Card>
    </div>
  );
}
