import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getAdmissions, getInpatientStats } from '../../services/inpatientService';
import { getNursingNotes, getObservations } from '../../services/nursingService';
import { getErrorMessage } from '../../services/api';
import { relativeTime } from '../../utils/date';
import { ROLE_LABELS } from '../../utils/constants';
import type { Admission, InpatientStats, NursingNote } from '../../types';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/icons';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import RecordObservationModal from '../../components/nursing/RecordObservationModal';

/**
 * How long a patient can go unobserved before the row says so.
 *
 * Not a clinical standard — observation frequency is prescribed per patient
 * and this app has no schedule to read. It is a "nobody has looked in a while"
 * marker, which is the question the ward actually asks, and it is worded as
 * elapsed time rather than as a due date so it never reads as a claim that an
 * observation was formally due.
 */
const STALE_AFTER_HOURS = 6;

interface PatientRow {
  admission: Admission;
  lastObservedAt: string | null;
}

export default function NurseDashboard() {
  const { user, role } = useAuth();

  const [stats, setStats] = useState<InpatientStats | null>(null);
  const [rows, setRows] = useState<PatientRow[] | null>(null);
  const [handover, setHandover] = useState<NursingNote[] | null>(null);
  const [error, setError] = useState('');

  /**
   * The patient being observed from this board.
   *
   * The queue names who has not been seen in a while and then made you open
   * their admission to do anything about it — so the page that raised the
   * question could not answer it. Recording here closes that loop, and the
   * reload afterwards moves the row out of the queue in front of you.
   */
  const [recordingFor, setRecordingFor] = useState<{ id: string; name: string } | null>(null);

  /**
   * The wards this nurse covers, or none — in which case they are a
   * hospital-wide reader and the board shows everyone, exactly as the
   * server's scoping rule does.
   */
  const wards = useMemo(() => user?.assignedWards ?? [], [user]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [statsData, admissionsData, observationsData, notesData] = await Promise.all([
        getInpatientStats(),
        getAdmissions({ status: 'admitted', limit: 100 }),
        // One request covers the whole board: the latest reading per patient is
        // derived here rather than asked for once per row.
        getObservations({ limit: 100 }),
        getNursingNotes({ category: 'handover', limit: 5 }),
      ]);

      const latest = new Map<string, string>();
      for (const observation of observationsData.observations) {
        const patient = observation.patientId?._id;
        if (!patient) continue;
        // The feed is newest first, so the first sighting of a patient wins.
        if (!latest.has(patient)) latest.set(patient, observation.recordedAt);
      }

      const mine = admissionsData.admissions.filter(
        (admission) => wards.length === 0 || (admission.wardId && wards.includes(admission.wardId._id))
      );

      setStats(statsData);
      setRows(
        mine.map((admission) => ({
          admission,
          lastObservedAt: admission.patientId ? (latest.get(admission.patientId._id) ?? null) : null,
        }))
      );
      setHandover(notesData.notes);
    } catch (err) {
      setRows([]);
      setHandover([]);
      setError(getErrorMessage(err, 'Unable to load your ward.'));
    }
  }, [wards]);

  useEffect(() => {
    load();
  }, [load]);

  const hoursSince = (value: string | null): number | null => {
    if (!value) return null;
    return (Date.now() - new Date(value).getTime()) / 3_600_000;
  };

  const unobserved = rows?.filter((row) => {
    const hours = hoursSince(row.lastObservedAt);
    return hours === null || hours >= STALE_AFTER_HOURS;
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={role ? ROLE_LABELS[role] : undefined}
        title={`Welcome, ${user?.firstName ?? ''}`.trim()}
        subtitle={
          wards.length === 0
            ? 'You are not assigned to a ward, so this board shows every inpatient. Ask an administrator to assign your wards to narrow it.'
            : 'The patients on your wards, and when each was last observed.'
        }
        actions={
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Patients in your care"
          value={rows?.length}
          hint={wards.length === 0 ? 'Every inpatient' : 'On your wards'}
          icon="patients"
        />
        <StatCard
          label={`Not observed in ${STALE_AFTER_HOURS}h`}
          value={unobserved}
          hint="Longest gaps first below"
          icon="activity"
          alert
        />
        <StatCard
          label="Beds occupied"
          value={stats?.occupiedBeds}
          hint={stats ? `${stats.availableBeds} free` : undefined}
          icon="bed"
        />
        <StatCard
          label="Admitted today"
          value={stats?.todaysAdmissions}
          hint={stats ? `${stats.todaysDischarges} discharged` : undefined}
          icon="clipboard"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card
          title="Your patients"
          subtitle="Longest since an observation, first"
          icon="patients"
          padded={false}
        >
          <div className="px-4 py-3">
            {rows === null ? (
              <ul className="space-y-2" aria-label="Loading your patients">
                {[0, 1, 2, 3].map((row) => (
                  <li key={row} className="h-14 w-full rounded-xl skeleton" />
                ))}
              </ul>
            ) : rows.length === 0 ? (
              <EmptyState
                title="No patients admitted"
                description={
                  wards.length === 0
                    ? 'Nobody is currently an inpatient.'
                    : 'Nobody is currently admitted to your wards.'
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {[...rows]
                  .sort((a, b) => {
                    // Never observed sorts first, then oldest reading.
                    const left = a.lastObservedAt ? new Date(a.lastObservedAt).getTime() : 0;
                    const right = b.lastObservedAt ? new Date(b.lastObservedAt).getTime() : 0;
                    return left - right;
                  })
                  .map(({ admission, lastObservedAt }) => {
                    const hours = hoursSince(lastObservedAt);
                    const stale = hours === null || hours >= STALE_AFTER_HOURS;
                    const patient = admission.patientId;

                    return (
                      <li
                        key={admission._id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {patient
                              ? `${patient.firstName} ${patient.lastName}`
                              : 'Patient removed'}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {admission.wardId?.name}
                            {admission.bedId && ` · Bed ${admission.bedId.bedNumber}`}
                            {patient && (
                              <span className="tabular-nums"> · {patient.patientId}</span>
                            )}
                          </p>
                        </div>

                        <Badge tone={stale ? 'amber' : 'green'}>
                          {lastObservedAt
                            ? `Observed ${relativeTime(lastObservedAt)}`
                            : 'Never observed'}
                        </Badge>

                        <div className="flex items-center gap-1.5">
                          {stale && patient && (
                            <Button
                              size="sm"
                              onClick={() =>
                                setRecordingFor({
                                  id: patient._id,
                                  name: `${patient.firstName} ${patient.lastName}`,
                                })
                              }
                            >
                              Record
                            </Button>
                          )}
                          <Link to={`/inpatient/admissions/${admission._id}`}>
                            <Button variant="ghost" size="sm">
                              Open
                              <Icon name="chevronRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
                            </Button>
                          </Link>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </Card>

        <Card title="Latest handover" subtitle="What the last shift left" icon="clipboard">
          {handover === null ? (
            <ul className="space-y-2" aria-label="Loading handover notes">
              {[0, 1].map((row) => (
                <li key={row} className="h-16 w-full rounded-xl skeleton" />
              ))}
            </ul>
          ) : handover.length === 0 ? (
            <EmptyState
              title="No handover notes"
              description="Handover notes written on a patient's record appear here."
            />
          ) : (
            <ul className="space-y-3">
              {handover.map((note) => (
                <li key={note._id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {note.patientId
                        ? `${note.patientId.firstName} ${note.patientId.lastName}`
                        : 'Patient removed'}
                    </p>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      {relativeTime(note.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-pretty text-xs leading-relaxed text-slate-600">
                    {note.body}
                  </p>
                  {note.authorId && (
                    <p className="mt-1 text-[0.6875rem] text-slate-400">
                      {note.shift ? `${note.shift} shift · ` : ''}
                      {note.authorId.firstName} {note.authorId.lastName}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <RecordObservationModal
        open={recordingFor !== null}
        patientId={recordingFor?.id ?? ''}
        patientName={recordingFor?.name}
        onClose={() => setRecordingFor(null)}
        onRecorded={load}
      />
    </div>
  );
}
