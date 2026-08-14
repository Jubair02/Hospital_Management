import { useEffect, useState } from 'react';
import { getAdmissions, type PortalAdmissionsData } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { PortalAdmission } from '../../types';
import Alert from '../../components/ui/Alert';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import PageHeader from '../../components/ui/PageHeader';
import Table, { type Column } from '../../components/ui/Table';
import { StatusBadge, doctorLabel, humanize } from './portalShared';

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value ?? '—'}</dd>
    </div>
  );
}

export default function PortalAdmissionPage() {
  const [data, setData] = useState<PortalAdmissionsData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdmissions()
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, 'Unable to load your admissions.')));
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <FullPageSpinner label="Loading admissions" />;

  const historyColumns: Column<PortalAdmission>[] = [
    {
      key: 'admissionId',
      header: 'Admission',
      render: (a) => <span className="font-medium text-slate-800">{a.admissionId}</span>,
    },
    {
      key: 'period',
      header: 'Period',
      render: (a) => (
        <span className="whitespace-nowrap">
          {formatDate(a.admissionDate)}
          {a.dischargeDate ? ` → ${formatDate(a.dischargeDate)}` : ''}
        </span>
      ),
    },
    {
      key: 'ward',
      header: 'Ward / bed',
      render: (a) => `${a.wardId?.name ?? '—'}${a.bedId ? ` · ${a.bedId.bedNumber}` : ''}`,
    },
    { key: 'doctor', header: 'Doctor', render: (a) => doctorLabel(a.doctorId) },
    { key: 'reason', header: 'Reason', render: (a) => <span className="text-slate-600">{a.reason}</span> },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title="Admission"
        subtitle="Your current stay, if any, and your admission history."
      />

      {data.current ? (
        <Card
          title="Current admission"
          subtitle={data.current.admissionId}
          actions={<StatusBadge status={data.current.status} />}
        >
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <Row label="Ward" value={data.current.wardId?.name} />
            <Row label="Bed" value={data.current.bedId?.bedNumber} />
            <Row label="Admitted" value={formatDate(data.current.admissionDate)} />
            <Row
              label="Expected discharge"
              value={
                data.current.expectedDischargeDate
                  ? formatDate(data.current.expectedDischargeDate)
                  : undefined
              }
            />
            <Row label="Attending doctor" value={doctorLabel(data.current.doctorId)} />
            <Row label="Type" value={humanize(data.current.admissionType)} />
            <Row label="Reason" value={data.current.reason} />
          </dl>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="You are not currently admitted"
            description="If you are admitted, your ward, bed, and care team appear here."
          />
        </Card>
      )}

      <Card title="Admission history">
        <Table
          columns={historyColumns}
          rows={data.history}
          emptyState={<EmptyState title="No previous admissions" />}
        />
      </Card>
    </div>
  );
}
