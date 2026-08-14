import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import {
  cancelLabOrder,
  collectLabSample,
  enterLabResult,
  getLabOrderById,
  rejectLabSample,
  verifyLabResult,
} from '../../services/laboratoryService';
import { getErrorMessage } from '../../services/api';
import { canProcessLab } from '../../utils/permissions';
import { formatDate } from '../../utils/date';
import type { LabOrder, LabResult, LabSample } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import {
  LabOrderStatusBadge,
  LabResultStatusBadge,
  PriorityBadge,
  SampleStatusBadge,
} from '../../components/laboratory/LabBadges';

export default function LabOrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const canProcess = canProcessLab(role);

  const [order, setOrder] = useState<LabOrder | null>(null);
  const [samples, setSamples] = useState<LabSample[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [rejecting, setRejecting] = useState<LabSample | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [entering, setEntering] = useState<LabResult | null>(null);
  const [entryForm, setEntryForm] = useState({ value: '', interpretation: '', notes: '' });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getLabOrderById(id);
      setOrder(data.order);
      setSamples(data.samples);
      setResults(data.results);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this lab order.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      flash(success);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEnterResult = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!entering) return;
    if (!entryForm.value.trim()) {
      setError('A result value is required.');
      return;
    }
    const target = entering;
    setEntering(null);
    await act(
      () =>
        enterLabResult(target._id, {
          value: entryForm.value.trim(),
          interpretation: entryForm.interpretation.trim() || undefined,
          notes: entryForm.notes.trim() || undefined,
        }),
      `Result recorded for ${target.testName}.`
    );
  };

  if (loading) return <FullPageSpinner label="Loading lab order" />;

  if (!order) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error || 'Lab order not found.'}</Alert>
        <Link to="/laboratory/orders">
          <Button variant="secondary">Back to orders</Button>
        </Link>
      </div>
    );
  }

  const workable = order.status !== 'completed' && order.status !== 'cancelled';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{order.orderId}</h1>
            <LabOrderStatusBadge status={order.status} />
            <PriorityBadge priority={order.priority} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Ordered {formatDate(order.orderedAt)}
            {order.patientId && (
              <>
                {' · '}
                <Link className="text-brand-800 hover:underline" to={`/patients/${order.patientId._id}`}>
                  {order.patientId.firstName} {order.patientId.lastName} ({order.patientId.patientId})
                </Link>
              </>
            )}
            {order.doctorId && (
              <>
                {' · '}Dr. {order.doctorId.firstName} {order.doctorId.lastName}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/laboratory/orders">
            <Button variant="ghost">Back to orders</Button>
          </Link>
          {canProcess && workable && (
            <Button variant="danger" onClick={() => setCancelOpen(true)}>
              Cancel order
            </Button>
          )}
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {order.status === 'completed' && (
        <Alert tone="info">This order is completed — results are verified and read-only.</Alert>
      )}

      {order.clinicalNotes && (
        <Card title="Clinical notes from the doctor">
          <p className="whitespace-pre-wrap text-sm text-slate-600">{order.clinicalNotes}</p>
        </Card>
      )}

      {/* Samples */}
      <Card title="Samples" subtitle="One sample per required sample type">
        <ul className="space-y-3">
          {samples.map((sample) => (
            <li
              key={sample._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {sample.sampleId} · <span className="capitalize">{sample.sampleType}</span>
                </p>
                <p className="text-sm text-slate-500">
                  {sample.status === 'collected' && sample.collectedBy && (
                    <>
                      Collected by {sample.collectedBy.firstName} {sample.collectedBy.lastName}
                      {sample.collectedAt && <> on {formatDate(sample.collectedAt)}</>}
                    </>
                  )}
                  {sample.status === 'rejected' && <>Rejected: {sample.rejectionReason}</>}
                  {sample.status === 'pending' && 'Awaiting collection'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <SampleStatusBadge status={sample.status} />
                {canProcess && workable && sample.status === 'pending' && (
                  <>
                    <Button
                      size="sm"
                      loading={busy}
                      onClick={() =>
                        act(() => collectLabSample(sample._id), `Sample ${sample.sampleId} collected.`)
                      }
                    >
                      Collect
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setRejecting(sample);
                        setRejectReason('');
                      }}
                    >
                      Reject
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Results */}
      <Card title="Results" subtitle="Entered by laboratory staff, then verified">
        <ul className="space-y-3">
          {results.map((result) => (
            <li key={result._id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {result.testName}{' '}
                    <span className="font-normal text-slate-400">({result.resultId})</span>
                  </p>
                  {result.value ? (
                    <p className="mt-1 text-sm text-slate-700">
                      <span className="text-lg font-semibold">{result.value}</span>
                      {result.unit && <span className="ml-1 text-slate-500">{result.unit}</span>}
                      {result.referenceRange && (
                        <span className="ml-3 text-slate-500">Ref: {result.referenceRange}</span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-400">No value entered yet.</p>
                  )}
                  {result.interpretation && (
                    <p className="mt-0.5 text-sm text-slate-600">{result.interpretation}</p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {result.performedBy && (
                      <>
                        Performed by {result.performedBy.firstName} {result.performedBy.lastName}
                      </>
                    )}
                    {result.verifiedBy && (
                      <>
                        {' · '}Verified by {result.verifiedBy.firstName} {result.verifiedBy.lastName}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <LabResultStatusBadge status={result.status} />
                  {canProcess && workable && result.status !== 'verified' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEntering(result);
                          setEntryForm({
                            value: result.value ?? '',
                            interpretation: result.interpretation ?? '',
                            notes: result.notes ?? '',
                          });
                        }}
                      >
                        {result.value ? 'Edit result' : 'Enter result'}
                      </Button>
                      {result.status === 'completed' && (
                        <Button
                          size="sm"
                          loading={busy}
                          onClick={() =>
                            act(() => verifyLabResult(result._id), `${result.testName} verified.`)
                          }
                        >
                          Verify
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Reject sample modal */}
      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title={`Reject sample ${rejecting?.sampleId ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (!rejecting) return;
                if (!rejectReason.trim()) {
                  setError('A rejection reason is required.');
                  return;
                }
                const target = rejecting;
                setRejecting(null);
                await act(
                  () => rejectLabSample(target._id, rejectReason.trim()),
                  `Sample ${target.sampleId} rejected.`
                );
              }}
            >
              Reject sample
            </Button>
          </>
        }
      >
        <Textarea
          label="Rejection reason"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={2}
          placeholder="Hemolyzed sample, insufficient volume…"
          autoFocus
        />
      </Modal>

      {/* Enter result modal */}
      <Modal
        open={Boolean(entering)}
        onClose={() => setEntering(null)}
        title={`Result — ${entering?.testName ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEntering(null)}>
              Cancel
            </Button>
            <Button type="submit" form="result-form" loading={busy}>
              Save result
            </Button>
          </>
        }
      >
        <form id="result-form" onSubmit={handleEnterResult} noValidate className="space-y-4">
          <Input
            label="Value"
            value={entryForm.value}
            onChange={(e) => setEntryForm((f) => ({ ...f, value: e.target.value }))}
            hint={
              entering?.unit
                ? `Unit: ${entering.unit}${entering.referenceRange ? ` · Ref: ${entering.referenceRange}` : ''}`
                : entering?.referenceRange
                  ? `Ref: ${entering.referenceRange}`
                  : undefined
            }
            autoFocus
          />
          <Textarea
            label="Interpretation"
            value={entryForm.interpretation}
            onChange={(e) => setEntryForm((f) => ({ ...f, interpretation: e.target.value }))}
            rows={2}
            hint="Optional — entered by staff, never generated"
          />
          <Textarea
            label="Notes"
            value={entryForm.notes}
            onChange={(e) => setEntryForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            hint="Optional"
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel lab order"
        confirmLabel="Cancel order"
        busy={busy}
        onConfirm={async () => {
          setCancelOpen(false);
          await act(() => cancelLabOrder(order._id), 'Order cancelled.');
        }}
        onCancel={() => setCancelOpen(false)}
      >
        <p>
          {order.orderId} will be cancelled. The record is kept, but samples and results can no
          longer be processed.
        </p>
      </ConfirmDialog>
    </div>
  );
}
