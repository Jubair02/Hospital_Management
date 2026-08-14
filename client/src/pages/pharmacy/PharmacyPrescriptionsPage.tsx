import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPharmacyPrescriptions } from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type {
  Pagination as PaginationInfo,
  PharmacyPrescription,
  PrescriptionFulfillment,
} from '../../types';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';

export default function PharmacyPrescriptionsPage() {
  const [consultations, setConsultations] = useState<PharmacyPrescription[]>([]);
  const [fulfillments, setFulfillments] = useState<PrescriptionFulfillment[]>([]);
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
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPharmacyPrescriptions({ page, limit: 10, search: search || undefined });
      setConsultations(data.consultations);
      setFulfillments(data.fulfillments);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load prescriptions.'));
    } finally {
      setLoading(false);
    }
  }, [page, search]);

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

  const fulfillmentBadge = (c: PharmacyPrescription) => {
    const lines = fulfillments.filter((f) => f.consultationId === c._id);
    const done = lines.filter((f) => f.status === 'dispensed').length;

    if (done === c.prescriptions.length) return <Badge tone="green">Dispensed</Badge>;
    if (lines.length > 0) return <Badge tone="amber">Partial</Badge>;
    return <Badge tone="slate">Pending</Badge>;
  };

  const columns: Column<PharmacyPrescription>[] = [
    {
      key: 'consultationId',
      header: 'Consultation',
      render: (c) => <span className="font-medium text-brand-800">{c.consultationId}</span>,
    },
    { key: 'date', header: 'Date', render: (c) => formatDate(c.consultationDate) },
    {
      key: 'patient',
      header: 'Patient',
      render: (c) =>
        c.patientId ? (
          <div>
            <p className="font-medium text-slate-800">
              {c.patientId.firstName} {c.patientId.lastName}
            </p>
            <p className="text-slate-500">{c.patientId.patientId}</p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'doctor',
      header: 'Doctor',
      render: (c) =>
        c.doctorId ? `Dr. ${c.doctorId.firstName} ${c.doctorId.lastName}` : '—',
    },
    {
      key: 'medicines',
      header: 'Medicines',
      render: (c) => `${c.prescriptions.length} item(s)`,
    },
    { key: 'fulfillment', header: 'Fulfillment', render: fulfillmentBadge },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (c) => (
        <Link to={`/pharmacy/prescriptions/${c._id}`}>
          <Button size="sm">Open</Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Prescriptions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Completed consultations with medicines to dispense.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4 max-w-md">
          <Input
            placeholder="Search by patient name or ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search prescriptions"
          />
        </div>

        <Table
          columns={columns}
          rows={consultations}
          loading={loading}
          emptyState={
            <EmptyState
              title="No prescriptions found"
              description="Prescriptions appear here once doctors complete consultations."
            />
          }
        />

        <div className="mt-4">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            disabled={loading}
          />
        </div>
      </Card>
    </div>
  );
}
