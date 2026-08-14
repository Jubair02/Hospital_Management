import { useCallback, useEffect, useState } from 'react';
import { getPrescriptions } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Pagination as PaginationInfo, PortalPrescriptionRecord } from '../../types';
import Alert from '../../components/ui/Alert';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Table, { type Column } from '../../components/ui/Table';
import { StatusBadge, doctorLabel } from './portalShared';

type Line = PortalPrescriptionRecord['prescriptions'][number] & { id: string };

export default function PortalPrescriptionsPage() {
  const [records, setRecords] = useState<PortalPrescriptionRecord[] | null>(null);
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
      const data = await getPrescriptions({ page, limit: 10 });
      setRecords(data.records);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load your prescriptions.'));
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (records === null) return <FullPageSpinner label="Loading prescriptions" />;

  const lineColumns: Column<Line>[] = [
    {
      key: 'medicine',
      header: 'Medicine',
      render: (l) => <span className="font-medium text-slate-800">{l.medicineName}</span>,
    },
    { key: 'dosage', header: 'Dosage', render: (l) => l.dosage },
    { key: 'frequency', header: 'Frequency', render: (l) => l.frequency },
    { key: 'duration', header: 'Duration', render: (l) => l.duration },
    {
      key: 'route',
      header: 'Route',
      render: (l) => l.route ?? <span className="text-slate-400">—</span>,
    },
    {
      key: 'instructions',
      header: 'Instructions',
      render: (l) =>
        l.instructions ? (
          <span className="text-slate-600">{l.instructions}</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Pharmacy status',
      render: (l) => <StatusBadge status={l.dispenseStatus} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title="Prescriptions"
        subtitle="What your doctors prescribed, visit by visit, with the pharmacy's dispensing status."
      />

      {records.length === 0 ? (
        <Card>
          <EmptyState
            title="No prescriptions yet"
            description="Prescriptions written during consultations appear here."
          />
        </Card>
      ) : (
        records.map((record) => (
          <Card
            key={record._id}
            title={`${formatDate(record.consultationDate)} · ${doctorLabel(record.doctorId)}`}
            subtitle={record.consultationId}
          >
            <Table
              columns={lineColumns}
              rows={record.prescriptions.map((line, index) => ({
                ...line,
                id: `${record._id}:${index}`,
              }))}
            />
          </Card>
        ))
      )}

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={setPage}
      />
    </div>
  );
}
