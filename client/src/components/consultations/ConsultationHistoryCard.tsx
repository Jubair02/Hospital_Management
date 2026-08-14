import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPatientConsultations } from '../../services/consultationService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Consultation, Pagination as PaginationInfo } from '../../types';
import Card from '../ui/Card';
import Alert from '../ui/Alert';
import Spinner from '../ui/Spinner';
import Pagination from '../ui/Pagination';
import ConsultationStatusBadge from './ConsultationStatusBadge';

const primaryDiagnosis = (c: Consultation): string | undefined =>
  (c.diagnoses.find((d) => d.type === 'primary') ?? c.diagnoses[0])?.diagnosis;

/**
 * The patient's medical timeline: consultations in reverse chronological
 * order, each linking to its read-only record.
 */
export default function ConsultationHistoryCard({ patientMongoId }: { patientMongoId: string }) {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
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
      const data = await getPatientConsultations(patientMongoId, { page, limit: 5 });
      setConsultations(data.consultations);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load consultation history.'));
    } finally {
      setLoading(false);
    }
  }, [patientMongoId, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card title="Medical timeline" subtitle="Consultations, newest first">
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="text-brand-700" />
        </div>
      ) : consultations.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">No consultations yet.</p>
      ) : (
        <ol className="relative space-y-5 border-l border-brand-200 pl-5">
          {consultations.map((c) => (
            <li key={c._id} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[1.45rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/consultations/${c._id}`}
                  className="text-sm font-semibold text-brand-800 hover:underline"
                >
                  {formatDate(c.consultationDate)} · {c.consultationId}
                </Link>
                <ConsultationStatusBadge status={c.status} />
              </div>
              <p className="mt-0.5 text-sm text-slate-600">
                {c.doctorId ? `Dr. ${c.doctorId.firstName} ${c.doctorId.lastName}` : '—'}
                {c.departmentId && <> · {c.departmentId.name}</>}
              </p>
              {primaryDiagnosis(c) && (
                <p className="mt-0.5 text-sm text-slate-700">
                  <span className="text-slate-500">Diagnosis:</span> {primaryDiagnosis(c)}
                </p>
              )}
              {c.treatmentPlan && (
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{c.treatmentPlan}</p>
              )}
            </li>
          ))}
        </ol>
      )}

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
  );
}
