import { useCallback, useEffect, useState } from 'react';
import { getMedicalRecords } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Pagination as PaginationInfo, PortalMedicalRecord } from '../../types';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { StatusBadge, doctorLabel } from './portalShared';

function RecordCard({ record }: { record: PortalMedicalRecord }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="font-medium text-slate-800">
            {formatDate(record.consultationDate)} · {doctorLabel(record.doctorId)}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {record.consultationId}
            {record.departmentId ? ` · ${record.departmentId.name}` : ''}
            {record.chiefComplaint ? ` · ${record.chiefComplaint}` : ''}
          </p>
        </div>
        <StatusBadge status={record.status} />
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 text-sm">
          {record.diagnoses.length > 0 && (
            <div>
              <p className="font-medium text-slate-700">Diagnoses</p>
              <ul className="mt-1.5 space-y-1">
                {record.diagnoses.map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-600">
                    <Badge tone={d.type === 'primary' ? 'brand' : 'slate'}>{d.type}</Badge>
                    {d.diagnosis}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {record.assessment && (
            <div>
              <p className="font-medium text-slate-700">Assessment</p>
              <p className="mt-1 text-slate-600">{record.assessment}</p>
            </div>
          )}

          {record.treatmentPlan && (
            <div>
              <p className="font-medium text-slate-700">Treatment plan</p>
              <p className="mt-1 text-slate-600">{record.treatmentPlan}</p>
            </div>
          )}

          {record.prescriptions.length > 0 && (
            <div>
              <p className="font-medium text-slate-700">Prescriptions</p>
              <ul className="mt-1 list-inside list-disc text-slate-600">
                {record.prescriptions.map((line, i) => (
                  <li key={i}>
                    {line.medicineName} — {line.dosage}, {line.frequency}, {line.duration}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {record.followUpDate && (
            <p className="text-slate-600">
              <span className="font-medium text-slate-700">Follow-up:</span>{' '}
              {formatDate(record.followUpDate)}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function PortalMedicalRecordsPage() {
  const [records, setRecords] = useState<PortalMedicalRecord[] | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
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
      const data = await getMedicalRecords({ page, limit: 10 });
      setRecords(data.consultations);
      setHistory(data.medicalHistory);
      setAllergies(data.allergies);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load your medical records.'));
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (records === null) return <FullPageSpinner label="Loading medical records" />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title="Medical records"
        subtitle="Your consultation history and clinical summary. Records are read-only — talk to your doctor about anything here."
      />

      {(allergies.length > 0 || history.length > 0) && (
        <Card title="Known allergies & history">
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="font-medium text-slate-700">Allergies</p>
              {allergies.length === 0 ? (
                <p className="mt-1 text-slate-400">None recorded</p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {allergies.map((item) => (
                    <Badge key={item} tone="red">
                      {item}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="font-medium text-slate-700">Medical history</p>
              {history.length === 0 ? (
                <p className="mt-1 text-slate-400">None recorded</p>
              ) : (
                <ul className="mt-1 list-inside list-disc text-slate-600">
                  {history.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {records.length === 0 ? (
        <Card>
          <EmptyState
            title="No consultations yet"
            description="After your first visit, the clinical summary appears here."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <RecordCard key={record._id} record={record} />
          ))}
        </div>
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
