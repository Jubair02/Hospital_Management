import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { AppNotification, NotificationType, Pagination as PaginationInfo } from '../../types';
import Alert from '../../components/ui/Alert';
import Badge, { type BadgeTone } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';

const TYPE_META: Record<NotificationType, { label: string; tone: BadgeTone }> = {
  appointment: { label: 'Appointment', tone: 'blue' },
  lab_result: { label: 'Lab result', tone: 'brand' },
  prescription: { label: 'Prescription', tone: 'amber' },
  payment: { label: 'Payment', tone: 'green' },
  admission: { label: 'Admission', tone: 'blue' },
  discharge: { label: 'Discharge', tone: 'green' },
  low_stock: { label: 'Low stock', tone: 'red' },
  system: { label: 'System', tone: 'slate' },
};

const TYPE_OPTIONS = Object.entries(TYPE_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

/** Where a notification's reference lives in the app, when it has one. */
const linkFor = (notification: AppNotification): string | null => {
  if (!notification.referenceId) return null;
  switch (notification.referenceType) {
    case 'appointment':
      return `/appointments/${notification.referenceId}`;
    case 'consultation':
      return `/consultations/${notification.referenceId}`;
    case 'lab_order':
      return `/laboratory/orders/${notification.referenceId}`;
    case 'invoice':
      return `/billing/invoices/${notification.referenceId}`;
    case 'admission':
      return `/inpatient/admissions/${notification.referenceId}`;
    case 'medicine':
      return '/pharmacy/medicines';
    default:
      return null;
  }
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getNotifications({
        page,
        limit: 20,
        type: type || undefined,
        unread: unreadOnly ? 'true' : undefined,
      });
      setNotifications(data.notifications);
      setUnread(data.unreadCount);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load notifications.'));
    } finally {
      setLoading(false);
    }
  }, [page, type, unreadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkRead = async (notification: AppNotification) => {
    if (notification.isRead) return;
    try {
      await markNotificationRead(notification._id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update the notification.'));
    }
  };

  const handleMarkAll = async () => {
    setBusy(true);
    setError('');
    try {
      await markAllNotificationsRead();
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to mark all as read.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'You are all caught up.'}
        actions={
          <Button variant="secondary" loading={busy} disabled={unread === 0} onClick={handleMarkAll}>
            Mark all as read
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select
            aria-label="Filter by type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            options={TYPE_OPTIONS}
            placeholder="All types"
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
            />
            Unread only
          </label>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="text-brand-700" />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="Activity relevant to your role will appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((notification) => {
              const meta = TYPE_META[notification.type];
              const link = linkFor(notification);

              return (
                <li
                  key={notification._id}
                  className={`flex flex-wrap items-start justify-between gap-3 py-3 ${
                    notification.isRead ? '' : 'bg-brand-50/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {!notification.isRead && (
                      <span
                        aria-label="Unread"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600"
                      />
                    )}
                    <div className={notification.isRead ? 'pl-5' : ''}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <p className="font-medium text-slate-800">{notification.title}</p>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">{notification.message}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDate(notification.createdAt)} · {notification.notificationId}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {link && (
                      <Link to={link} onClick={() => handleMarkRead(notification)}>
                        <Button variant="ghost" size="sm">
                          Open
                        </Button>
                      </Link>
                    )}
                    {!notification.isRead && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleMarkRead(notification)}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
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
    </div>
  );
}
