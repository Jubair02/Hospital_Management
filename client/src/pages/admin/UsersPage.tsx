import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { deleteUser, fetchUsers, updateUserStatus } from '../../services/userService';
import { getErrorMessage } from '../../services/api';
import { ROLE_LABELS, STAFF_ROLE_LABELS } from '../../utils/constants';
import { formatDate } from '../../utils/date';
import type { Pagination as PaginationInfo, User, UserStatus } from '../../types';
import Alert from '../../components/ui/Alert';
import Badge, { ROLE_TONES, type BadgeTone } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Select, { type SelectOption } from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import Icon from '../../components/ui/icons';
import UserFormModal from '../../components/users/UserFormModal';

const PAGE_SIZE = 10;

/**
 * Staff roles only, and only on the staff tab. `ROLE_LABELS` also carries
 * `patient`, and offering it as one role among six mixed portal logins into a
 * list of staff accounts — the server excludes them from an unfiltered query
 * for the same reason. Patient logins get their own tab instead, because what
 * you do with one is different: no role to assign, no deletion (a Patient
 * record still points at it), and the person's name lives on that record
 * rather than on the login.
 */
const ROLE_FILTER_OPTIONS: SelectOption[] = Object.entries(STAFF_ROLE_LABELS).map(
  ([value, label]) => ({ value, label: label as string })
);

/**
 * Which population of accounts is on screen. The server takes this as the
 * `role` query: absent means "every staff role", `patient` means portal
 * logins only.
 */
type Audience = 'staff' | 'patient';

const AUDIENCE_TABS: { value: Audience; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'patient', label: 'Patients' },
];

/**
 * Status is the filter reached for most often, so it is a segmented control
 * rather than a third dropdown — one click instead of two, and the counts are
 * visible without opening anything.
 */
const STATUS_TABS: { value: '' | UserStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
};

const STATUS_TONES: Record<UserStatus, BadgeTone> = {
  active: 'green',
  inactive: 'slate',
  suspended: 'red',
};

/** The dot inside a status badge, so status reads before the label does. */
const STATUS_DOTS: Record<UserStatus, string> = {
  active: 'bg-emerald-500',
  inactive: 'bg-slate-400',
  suspended: 'bg-rose-500',
};

/** Legacy accounts may carry only `isActive`. */
const statusOf = (u: User): UserStatus => u.status ?? (u.isActive ? 'active' : 'inactive');

const initialsOf = (u: User): string =>
  `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();

interface Counts {
  total: number;
  active: number;
  inactive: number;
  suspended: number;
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: PAGE_SIZE,
    totalPages: 1,
    total: 0,
  });
  const [counts, setCounts] = useState<Counts | null>(null);
  /** Total on the tab that is not open, so its badge reads before you click. */
  const [otherTotal, setOtherTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [audience, setAudience] = useState<Audience>('staff');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | UserStatus>('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // The counts describe the whole staff population, not the current
      // query — they label the tabs you are choosing between, so they have to
      // hold still while the search box is being typed into. The number of
      // rows the query actually matched is reported in the toolbar instead.
      // Each comes from `pagination.total` with `limit: 1`, so no extra page
      // of staff is downloaded to produce a figure.
      // `role: 'patient'` is the server's opt-in for portal logins; leaving it
      // off is what makes a query mean "staff". The status counts follow the
      // tab, so they never describe a population that is not on screen.
      const scope = audience === 'patient' ? 'patient' : undefined;

      const [data, active, inactive, suspended, other] = await Promise.all([
        fetchUsers({
          page,
          limit: PAGE_SIZE,
          search: search || undefined,
          role: audience === 'patient' ? 'patient' : roleFilter || undefined,
          status: statusFilter || undefined,
        }),
        fetchUsers({ limit: 1, role: scope, status: 'active' }),
        fetchUsers({ limit: 1, role: scope, status: 'inactive' }),
        fetchUsers({ limit: 1, role: scope, status: 'suspended' }),
        // The other tab's total, for its badge.
        fetchUsers({ limit: 1, role: audience === 'patient' ? undefined : 'patient' }),
      ]);

      setUsers(data.users);
      setPagination(data.pagination);
      setOtherTotal(other.pagination.total);
      setCounts({
        active: active.pagination.total,
        inactive: inactive.pagination.total,
        suspended: suspended.pagination.total,
        total:
          active.pagination.total + inactive.pagination.total + suspended.pagination.total,
      });
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          audience === 'patient' ? 'Unable to load patient logins.' : 'Unable to load users.'
        )
      );
    } finally {
      setLoading(false);
    }
  }, [audience, page, search, roleFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce free-text search back to page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /**
   * One live timer, cleared on replacement and on unmount — otherwise a
   * second action's notice inherits the first one's countdown and vanishes
   * early, and a notice outliving the page updates state after unmount.
   */
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  const flash = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 5000);
  }, []);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const handleSaved = (savedUser: User, wasEdit: boolean) => {
    setFormOpen(false);
    setEditingUser(null);
    flash(
      wasEdit
        ? `${savedUser.firstName} ${savedUser.lastName} updated.`
        : `${savedUser.firstName} ${savedUser.lastName} added.`
    );
    load();
  };

  const handleSetStatus = async (u: User, status: UserStatus) => {
    setTogglingId(u._id);
    setError('');
    try {
      const updated = await updateUserStatus(u._id, status);
      setUsers((list) => list.map((x) => (x._id === updated._id ? updated : x)));
      flash(
        `${updated.firstName} ${updated.lastName} set to ${STATUS_LABELS[
          statusOf(updated)
        ].toLowerCase()}.`
      );
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update user status.'));
    } finally {
      setTogglingId(null);
    }
  };

  const askDelete = (u: User) => {
    setPendingDelete(u);
    setDeleteError('');
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    setDeleteError('');
    try {
      await deleteUser(pendingDelete._id);
      const name = `${pendingDelete.firstName} ${pendingDelete.lastName}`;
      setPendingDelete(null);
      flash(`${name} deleted.`);

      // Removing the only row on the last page would otherwise land the
      // reader on an empty page they did not navigate to.
      if (users.length === 1 && page > 1) setPage((p) => p - 1);
      else load();
    } catch (err) {
      // The server refuses accounts that own clinical or financial records
      // and explains why, so the dialog stays open holding that reason.
      setDeleteError(getErrorMessage(err, 'Unable to delete this account.'));
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Filters describe the tab that was open when they were set, so they are
   * dropped on the way out — a role filter would be meaningless against
   * patient logins, and a search for a staff surname would land the reader on
   * an empty patient tab that looks broken.
   */
  const switchAudience = (next: Audience) => {
    if (next === audience) return;
    setAudience(next);
    setPage(1);
    setRoleFilter('');
    setStatusFilter('');
    setSearchInput('');
    setSearch('');
    setCounts(null);
    setOtherTotal(null);
  };

  const isPatients = audience === 'patient';

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: isPatients ? 'Patient' : 'Staff member',
      render: (u) => (
        <div className="flex items-center gap-3">
          {/* Squircle monogram: gives every row a fixed anchor to scan down,
              and reads as an identity without inventing a stock photo. */}
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-[0.8125rem]
              font-semibold text-brand-700 ring-1 ring-inset ring-brand-100"
            aria-hidden="true"
          >
            {initialsOf(u)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">
              {u.firstName} {u.lastName}
              {u._id === currentUser?._id && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>
              )}
            </p>
            <p className="truncate text-xs text-slate-500">
              {u.email}
              {/* The account is only half the person. Their record holds the
                  clinical side, and this is the one place the two are shown
                  together, so it is also the place to offer the crossing. */}
              {u.patient && (
                <>
                  <span className="text-slate-300"> · </span>
                  <Link
                    to={`/patients/${u.patient.id}`}
                    className="font-medium text-brand-700 transition-colors hover:text-brand-800 hover:underline"
                  >
                    {u.patient.patientId}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      ),
    },
    // Every row on the patients tab carries the same role, so a column of
    // identical badges would be a column of noise.
    ...(isPatients
      ? []
      : [
          {
            key: 'role',
            header: 'Role',
            render: (u: User) => <Badge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Badge>,
          } satisfies Column<User>,
        ]),
    {
      key: 'phone',
      header: 'Phone',
      render: (u) =>
        u.phone ? (
          <span className="text-slate-600">{u.phone}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => {
        const status = statusOf(u);
        return (
          <Badge tone={STATUS_TONES[status]}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOTS[status]}`} aria-hidden="true" />
            {STATUS_LABELS[status]}
          </Badge>
        );
      },
    },
    {
      key: 'createdAt',
      header: isPatients ? 'Access given' : 'Added',
      render: (u) => <span className="text-slate-500">{formatDate(u.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (u) => {
        const isSelf = u._id === currentUser?._id;
        const active = statusOf(u) === 'active';

        return (
          <div className="flex items-center justify-end gap-1">
            {/* A patient's name and contact details belong to their Patient
                record, and the portal login is only a mirror of them. Editing
                them here would leave the two disagreeing, so this tab governs
                the one thing that is genuinely the account's own: whether it
                can sign in. */}
            {!isPatients && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingUser(u);
                  setFormOpen(true);
                }}
              >
                Edit
              </Button>
            )}

            {/* An admin cannot act on their own account — the server refuses
                it too, so the controls are absent rather than merely failing. */}
            {!isSelf && (
              <>
                {/* One toggle, not two: the account is either in use or it is
                    not, and offering both directions at once made the reader
                    work out which one applied. */}
                <Button
                  variant="secondary"
                  size="sm"
                  loading={togglingId === u._id}
                  onClick={() => handleSetStatus(u, active ? 'inactive' : 'active')}
                >
                  {active ? 'Deactivate' : 'Activate'}
                </Button>

                {/* A portal login is retired from the patient record, and the
                    server refuses it here — so the control is absent rather
                    than offered and then rejected. Deactivating one is still
                    allowed, which is why only Delete is withheld. */}
                {u.role !== 'patient' && (
                  <Button variant="dangerGhost" size="sm" onClick={() => askDelete(u)}>
                    Delete
                  </Button>
                )}
              </>
            )}
          </div>
        );
      },
    },
  ];

  const hasFilters = Boolean(search || roleFilter || statusFilter);

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const countFor = (value: '' | UserStatus): number | undefined => {
    if (!counts) return undefined;
    return value === '' ? counts.total : counts[value];
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accounts & access"
        title="Users"
        subtitle={
          isPatients
            ? 'Portal logins issued to patients, and whether each one can currently sign in.'
            : 'Staff logins, the role each one carries, and whether it can currently sign in.'
        }
        meta={
          counts ? (
            <>
              <Badge tone="slate">
                {counts.total.toLocaleString()} {isPatients ? 'logins' : 'accounts'}
              </Badge>
              <Badge tone="green">{counts.active.toLocaleString()} active</Badge>
              {counts.suspended > 0 && (
                <Badge tone="red">{counts.suspended.toLocaleString()} suspended</Badge>
              )}
            </>
          ) : (
            <div className="h-6 w-52 rounded-full skeleton" aria-label="Loading account counts" />
          )
        }
        actions={
          // Nothing to add here on the patients tab: a portal login is issued
          // against an existing Patient record, never created standalone.
          !isPatients && (
            <Button
              onClick={() => {
                setEditingUser(null);
                setFormOpen(true);
              }}
            >
              <Icon name="plus" className="h-4 w-4" />
              Add user
            </Button>
          )
        }
      />

      {/* Two populations, not one list with a filter on it. Underlined tabs
          rather than another pill group, so this reads as a level above the
          status control inside the toolbar rather than a second one beside
          it. `aria-pressed` matches how that control is built. */}
      <div className="border-b border-line">
        <div className="-mb-px flex gap-1" role="group" aria-label="Account type">
          {AUDIENCE_TABS.map((tab) => {
            const selected = audience === tab.value;
            const badge = selected ? counts?.total : otherTotal;

            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={selected}
                onClick={() => switchAudience(tab.value)}
                className={`flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium
                  transition-colors duration-150
                  ${
                    selected
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-500 hover:border-line-strong hover:text-slate-800'
                  }`}
              >
                {tab.label}
                {badge !== undefined && badge !== null && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                      selected ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {badge.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {/* Toolbar and table are two surfaces, not a card wrapped around a card:
          the table already carries its own border, so nesting it produced a
          double outline on every screen that used this pattern. */}
      <Card padded={false}>
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex w-full flex-wrap items-center gap-1 rounded-xl bg-slate-100/80 p-1 lg:w-auto"
            role="group"
            aria-label="Filter by status"
          >
            {STATUS_TABS.map((tab) => {
              const selected = statusFilter === tab.value;
              const count = countFor(tab.value);

              return (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setStatusFilter(tab.value);
                    setPage(1);
                  }}
                  className={`flex min-h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap
                    rounded-lg px-3 text-[0.8125rem] font-medium transition-colors duration-150 lg:flex-none
                    ${
                      selected
                        ? 'bg-white text-slate-900 shadow-xs ring-1 ring-inset ring-line'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  {tab.label}
                  {count !== undefined && (
                    <span
                      className={`text-xs tabular-nums ${
                        selected ? 'text-brand-700' : 'text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:shrink-0">
            <Input
              placeholder={isPatients ? 'Search patient name or email' : 'Search name or email'}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search users"
              className="sm:w-64"
              trailing={
                searchInput ? (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    aria-label="Clear search"
                    className="mr-1 grid h-8 w-8 place-items-center rounded-lg text-slate-400
                      transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                ) : null
              }
            />
            {!isPatients && (
              <Select
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                options={ROLE_FILTER_OPTIONS}
                placeholder="All roles"
                className="sm:w-44"
              />
            )}
          </div>
        </div>

        {/* Where a patient login comes from. Without this the tab reads as
            somewhere you ought to be able to create one, and there is no
            control here that does. */}
        {isPatients && !hasFilters && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
            <span>Access is issued on a patient record, then managed here.</span>
            <Link
              to="/admin/patients"
              className="font-semibold text-brand-700 transition-colors hover:text-brand-800"
            >
              Open patients
            </Link>
          </div>
        )}

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
            <span>
              {pagination.total.toLocaleString()}{' '}
              {isPatients
                ? pagination.total === 1
                  ? 'login matches'
                  : 'logins match'
                : pagination.total === 1
                  ? 'account matches'
                  : 'accounts match'}
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="font-semibold text-brand-700 transition-colors hover:text-brand-800"
            >
              Clear filters
            </button>
          </div>
        )}
      </Card>

      <Table
        columns={columns}
        rows={users}
        loading={loading}
        emptyState={
          <EmptyState
            title={
              hasFilters
                ? `No ${isPatients ? 'logins' : 'accounts'} match these filters`
                : isPatients
                  ? 'No patient has portal access yet'
                  : 'No staff accounts yet'
            }
            description={
              hasFilters
                ? `Try a different search term, or clear the filters to see every ${
                    isPatients ? 'login' : 'account'
                  }.`
                : isPatients
                  ? 'Portal access is given on a patient record, and the login appears here once it exists.'
                  : 'Add the first staff account to give someone access to the portal.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : isPatients ? (
                <Link to="/admin/patients">
                  <Button variant="secondary" size="sm">
                    Go to patients
                  </Button>
                </Link>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingUser(null);
                    setFormOpen(true);
                  }}
                >
                  Add user
                </Button>
              )
            }
          />
        }
        footer={
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            disabled={loading}
            onPageChange={setPage}
          />
        }
      />

      <UserFormModal
        open={formOpen}
        user={editingUser}
        onClose={() => {
          setFormOpen(false);
          setEditingUser(null);
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this account?"
        confirmLabel="Delete account"
        tone="danger"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteError('');
        }}
      >
        {pendingDelete && (
          <div className="space-y-4">
            {/* Name the account being removed. A confirmation that only says
                "are you sure" cannot catch the mistake it exists to catch. */}
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-line">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sm
                  font-semibold text-slate-700 ring-1 ring-inset ring-line-strong"
                aria-hidden="true"
              >
                {initialsOf(pendingDelete)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {pendingDelete.firstName} {pendingDelete.lastName}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {pendingDelete.email} · {ROLE_LABELS[pendingDelete.role]}
                </p>
              </div>
            </div>

            <p className="text-pretty">
              The login is removed and this person loses access immediately. Their entries in the
              audit trail are kept.
            </p>
            <p className="text-pretty text-slate-500">
              This cannot be undone. To revoke access but keep the account, deactivate it instead.
            </p>

            {deleteError && <Alert tone="error">{deleteError}</Alert>}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
