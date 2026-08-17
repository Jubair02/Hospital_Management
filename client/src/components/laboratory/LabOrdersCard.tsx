import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createLabOrder,
  getLabOrders,
  getLabTests,
} from '../../services/laboratoryService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { LabOrder, LabPriority, LabTest } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { LabOrderStatusBadge, PriorityBadge } from './LabBadges';

interface LabOrdersCardProps {
  consultationMongoId: string;
}

/**
 * Doctor-side lab ordering inside the consultation workbench: existing
 * orders for this consultation plus a modal to order new tests.
 */
export default function LabOrdersCard({ consultationMongoId }: LabOrdersCardProps) {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [testSearch, setTestSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, LabTest>>(new Map());
  const [priority, setPriority] = useState<LabPriority>('routine');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getLabOrders({ consultationId: consultationMongoId, limit: 20 });
      setOrders(data.orders);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load lab orders.'));
    }
  }, [consultationMongoId]);

  useEffect(() => {
    load();
  }, [load]);

  // Catalog search inside the modal.
  useEffect(() => {
    if (!modalOpen) return;
    const t = setTimeout(() => {
      getLabTests({ search: testSearch.trim() || undefined, status: 'active', limit: 30 })
        .then((data) => setTests(data.tests))
        .catch((err: unknown) => setModalError(getErrorMessage(err, 'Unable to load tests.')));
    }, 300);
    return () => clearTimeout(t);
  }, [modalOpen, testSearch]);

  const toggleTest = (test: LabTest) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(test._id)) next.delete(test._id);
      else next.set(test._id, test);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      setModalError('Select at least one test.');
      return;
    }
    setSaving(true);
    setModalError('');
    try {
      const order = await createLabOrder({
        consultationId: consultationMongoId,
        tests: [...selected.keys()],
        priority,
        clinicalNotes: clinicalNotes.trim() || undefined,
      });
      setModalOpen(false);
      setSelected(new Map());
      setClinicalNotes('');
      setPriority('routine');
      setNotice(`Lab order ${order.orderId} placed.`);
      setTimeout(() => setNotice(''), 4000);
      load();
    } catch (err) {
      setModalError(getErrorMessage(err, 'Unable to place the lab order.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Laboratory orders"
      subtitle="Tests requested for this patient"
      actions={
        <Button size="sm" onClick={() => setModalOpen(true)}>
          Order tests
        </Button>
      }
    >
      {notice && <Alert tone="success" className="mb-3">{notice}</Alert>}
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}

      {orders.length === 0 ? (
        <p className="text-sm text-slate-500">No lab tests ordered for this consultation.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => (
            <li
              key={order._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm"
            >
              <div className="min-w-0">
                <Link
                  to={`/laboratory/orders/${order._id}`}
                  className="font-medium tabular-nums text-brand-800 transition-colors hover:text-brand-900 hover:underline"
                >
                  {order.orderId}
                </Link>
                <span className="ml-2 text-slate-600">
                  {order.tests.map((t) => t.testName).join(', ')}
                </span>
                <p className="mt-0.5 text-xs text-slate-500">{formatDate(order.orderedAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <PriorityBadge priority={order.priority} />
                <LabOrderStatusBadge status={order.status} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={modalOpen}
        onClose={saving ? undefined : () => setModalOpen(false)}
        title="Order laboratory tests"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleSubmit}>
              Place order ({selected.size})
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {modalError && <Alert tone="error">{modalError}</Alert>}

          <Input
            label="Find tests"
            placeholder="Search the catalog…"
            value={testSearch}
            onChange={(e) => setTestSearch(e.target.value)}
            autoFocus
          />

          <div className="scroll-slim max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
            {tests.length === 0 ? (
              <p className="p-2 text-sm text-slate-500">No active tests match.</p>
            ) : (
              tests.map((test) => {
                const checked = selected.has(test._id);
                return (
                  <label
                    key={test._id}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm transition-colors duration-150 ${
                      checked ? 'bg-brand-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTest(test)}
                        className="h-4 w-4 shrink-0 accent-brand-600"
                      />
                      <span className="truncate font-medium text-slate-800">{test.name}</span>
                      <span className="shrink-0 capitalize text-slate-500">
                        ({test.sampleType})
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {test.price.toFixed(2)}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as LabPriority)}
              options={[
                { value: 'routine', label: 'Routine' },
                { value: 'urgent', label: 'Urgent' },
              ]}
            />
          </div>

          <Textarea
            label="Clinical notes for the lab"
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            rows={2}
            hint="Optional"
          />
        </div>
      </Modal>
    </Card>
  );
}
