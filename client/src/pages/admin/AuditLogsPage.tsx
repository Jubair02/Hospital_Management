import { useCallback, useEffect, useState } from 'react';
import { getAuditLogs, getAuditVocabulary } from '../../services/adminService';
import { getErrorMessage } from '../../services/api';
import { ROLE_LABELS } from '../../utils/constants';
import type {
  AuditLogEntry,
  AuditVocabulary,
  Pagination as PaginationInfo,
  Role,
} from '../../types';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import Pagination from '../../components/ui/Pagination';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import PageHeader from '../../components/ui/PageHeader';

/** "lab_result_verified" → "Lab result verified" */
const humanize = (value: string): string =>
  value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const ACTION_TONE = (action: string): 'red' | 'amber' | 'green' | 'slate' => {
  if (action.includes('failed') || action.includes('blocked') || action.includes('cancelled')) {
    return 'red';
  }
  if (action.includes('role') || action.includes('status') || action.includes('settings')) {
    return 'amber';
  }
  if (action === 'login' || action.includes('created') || action.includes('recorded')) {
    return 'green';
  }
  return 'slate';
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [vocabulary, setVocabulary] = useState<AuditVocabulary | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    getAuditVocabulary()
      .then(setVocabulary)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAuditLogs({
        page,
        limit: 20,
        search: search || undefined,
        action: action || undefined,
        resourceType: resourceType || undefined,
        actorRole: actorRole || undefined,
        from: from || undefined,
        to: to || undefined,
        order,
      });
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load audit logs.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, action, resourceType, actorRole, from, to, order]);

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

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'createdAt',
      header: 'When',
      render: (log) => (
        <span className="whitespace-nowrap text-slate-600">
          {new Date(log.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (log) => (
        <div>
          <p className="font-medium text-slate-800">
            {log.actorId
              ? `${log.actorId.firstName} ${log.actorId.lastName}`
              : (log.actorLabel ?? 'Unauthenticated')}
          </p>
          {log.actorRole && (
            <p className="text-slate-500">{ROLE_LABELS[log.actorRole as Role] ?? log.actorRole}</p>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (log) => <Badge tone={ACTION_TONE(log.action)}>{humanize(log.action)}</Badge>,
    },
    {
      key: 'resourceType',
      header: 'Resource',
      render: (log) => humanize(log.resourceType),
    },
    {
      key: 'description',
      header: 'Description',
      render: (log) => <span className="text-slate-700">{log.description}</span>,
    },
    {
      key: 'ipAddress',
      header: 'IP',
      render: (log) => (
        <span className="whitespace-nowrap text-xs text-slate-400">{log.ipAddress ?? '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit logs"
        subtitle="Append-only record of security and business actions. Entries cannot be edited or deleted."
        actions={
          <Button
            variant="secondary"
            onClick={() => setOrder((current) => (current === 'desc' ? 'asc' : 'desc'))}
          >
            {order === 'desc' ? 'Newest first' : 'Oldest first'}
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Input
            placeholder="Search description, actor, ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search audit logs"
            className="lg:col-span-2"
          />
          <Select
            aria-label="Filter by action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            options={(vocabulary?.actions ?? []).map((a) => ({ value: a, label: humanize(a) }))}
            placeholder="All actions"
          />
          <Select
            aria-label="Filter by resource"
            value={resourceType}
            onChange={(e) => {
              setResourceType(e.target.value);
              setPage(1);
            }}
            options={(vocabulary?.resourceTypes ?? []).map((r) => ({
              value: r,
              label: humanize(r),
            }))}
            placeholder="All resources"
          />
          <Select
            aria-label="Filter by role"
            value={actorRole}
            onChange={(e) => {
              setActorRole(e.target.value);
              setPage(1);
            }}
            options={(vocabulary?.roles ?? []).map((r) => ({
              value: r,
              label: ROLE_LABELS[r] ?? r,
            }))}
            placeholder="All roles"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
            <Input
              type="date"
              aria-label="To date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </Card>

      <Table
        columns={columns}
        rows={logs}
        loading={loading}
        emptyState={
          <EmptyState
            title="No audit entries"
            description="Try widening the date range or clearing the filters."
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
    </div>
  );
}
