import { NavLink } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useSettings from '../../hooks/useSettings';
import { DASHBOARD_PATHS, ROLES } from '../../utils/constants';
import Icon, { LogoMark, type IconName } from '../ui/icons';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Match the exact path only — used by parent links such as /admin. */
  end?: boolean;
}

interface NavGroup {
  /** Omitted for the first group, which needs no heading. */
  label?: string;
  items: NavItem[];
}

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapsed: () => void;
}

/** Keeps the icon name checked against the registry at each call site. */
const nav = (
  to: string,
  label: string,
  icon: IconName,
  extra?: Pick<NavItem, 'end'>
): NavItem => ({ to, label, icon, ...extra });

const ROW =
  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150';
const ROW_IDLE = 'text-slate-300 hover:bg-white/[0.07] hover:text-white';
/** The accent marks "you are here". Blue stays the colour of things you click
 *  to act; teal marks the place you already are. */
const ROW_ACTIVE = 'bg-accent-600 text-white shadow-sm';

/**
 * Navigation rail. Deep navy, so the white content column stays the
 * brightest surface on screen and the data reads first.
 *
 * Links are grouped by the part of the hospital they belong to: a flat list
 * of fifteen rows has to be scanned linearly every time, while four short
 * labelled groups can be jumped between. Role gating is unchanged — the same
 * conditions still decide the same links, they are only bucketed.
 *
 * On desktop the rail collapses to a 76px icon strip; on mobile it is an
 * off-canvas drawer controlled by the layout.
 */
export default function Sidebar({
  open,
  collapsed,
  onClose,
  onToggleCollapsed,
}: SidebarProps) {
  const { role } = useAuth();
  const { hospitalName } = useSettings();

  const isClinical =
    role === ROLES.ADMIN ||
    role === ROLES.DOCTOR ||
    role === ROLES.RECEPTIONIST ||
    role === ROLES.NURSE;
  const isPharmacy = role === ROLES.ADMIN || role === ROLES.PHARMACIST;

  /** The patient portal is its own world: self-service pages only, no
   * staff surfaces. Grouped by what patients come here to do. */
  const patientGroups: NavGroup[] = [
    {
      items: [
        nav('/patient', 'Dashboard', 'dashboard', { end: true }),
        nav('/patient/appointments', 'Appointments', 'appointments'),
      ],
    },
    {
      label: 'My health',
      items: [
        nav('/patient/medical-records', 'Medical records', 'clipboard'),
        nav('/patient/prescriptions', 'Prescriptions', 'pill'),
        nav('/patient/laboratory', 'Lab results', 'flask'),
        nav('/patient/medications', 'Medications', 'inventory'),
        nav('/patient/admission', 'Admission', 'bed'),
      ],
    },
    {
      label: 'Account',
      // Notifications are reached from the bell in the header, which every
      // page carries — a second entry here would be the same inbox twice.
      items: [nav('/patient/billing', 'Billing', 'cash'), nav('/patient/profile', 'My profile', 'users')],
    },
  ];

  const allGroups: NavGroup[] = [
    {
      items: role ? [nav(DASHBOARD_PATHS[role], 'Dashboard', 'dashboard')] : [],
    },
    {
      label: 'Clinical',
      items: [
        ...(isClinical ? [nav(`/${role}/patients`, 'Patients', 'patients')] : []),
        ...(isClinical ? [nav(`/${role}/appointments`, 'Appointments', 'appointments')] : []),
        ...(role === ROLES.ADMIN || role === ROLES.RECEPTIONIST
          ? [nav(`/${role}/doctors`, 'Doctors', 'doctors')]
          : []),
        ...(role === ROLES.DOCTOR
          ? [
              nav('/doctor/consultations', 'Consultations', 'clipboard'),
              nav('/doctor/availability', 'Availability', 'clock'),
            ]
          : []),
        ...(role === ROLES.ADMIN || role === ROLES.RECEPTIONIST || role === ROLES.NURSE
          ? [nav('/inpatient', 'Inpatient', 'bed')]
          : []),
        ...(role === ROLES.DOCTOR ? [nav('/inpatient/admissions', 'Inpatients', 'bed')] : []),
      ],
    },
    {
      label: 'Services',
      items: [
        ...(isPharmacy
          ? [
              nav('/pharmacy/prescriptions', 'Pharmacy Rx', 'clipboard'),
              nav('/pharmacy/medicines', 'Medicines', 'pill'),
              nav('/pharmacy/inventory', 'Inventory', 'inventory'),
            ]
          : []),
        ...(role === ROLES.PHARMACIST
          ? [
              nav('/pharmacy/dispensing', 'Dispensing', 'clock'),
              nav('/pharmacy/transactions', 'Ledger', 'building'),
            ]
          : []),
        ...(role === ROLES.ADMIN || role === ROLES.LAB_TECHNICIAN
          ? [
              nav('/laboratory/orders', 'Lab orders', 'flask'),
              nav('/laboratory/tests', 'Lab tests', 'clipboard'),
            ]
          : []),
        ...(role === ROLES.LAB_TECHNICIAN
          ? [nav('/laboratory/samples', 'Samples', 'inventory')]
          : []),
        ...(role === ROLES.DOCTOR ? [nav('/laboratory/orders', 'Lab orders', 'flask')] : []),
        ...(role === ROLES.ADMIN || role === ROLES.RECEPTIONIST
          ? [nav('/billing', 'Billing', 'cash')]
          : []),
      ],
    },
    {
      label: 'Insights',
      items: [
        // Each role sees the one report it is authorized for; the admin
        // gets the hospital-wide analytics dashboard.
        ...(role === ROLES.ADMIN ? [nav('/analytics', 'Analytics', 'reports')] : []),
        ...(role === ROLES.RECEPTIONIST
          ? [nav('/reports/appointments', 'Reports', 'reports')]
          : []),
        ...(role === ROLES.DOCTOR ? [nav('/reports/clinical', 'Reports', 'reports')] : []),
        ...(role === ROLES.PHARMACIST ? [nav('/reports/pharmacy', 'Reports', 'reports')] : []),
        ...(role === ROLES.LAB_TECHNICIAN
          ? [nav('/reports/laboratory', 'Reports', 'reports')]
          : []),
        ...(role === ROLES.NURSE ? [nav('/reports/inpatient', 'Reports', 'reports')] : []),
      ],
    },
    {
      label: 'Administration',
      items:
        role === ROLES.ADMIN
          ? [
              nav('/admin/departments', 'Departments', 'building'),
              nav('/admin/users', 'Users', 'users'),
              nav('/admin/audit-logs', 'Audit logs', 'shield'),
              nav('/admin', 'Administration', 'cog', { end: true }),
            ]
          : [],
    },
  ];

  const groups = (role === ROLES.PATIENT ? patientGroups : allGroups).filter(
    (group) => group.items.length > 0
  );

  /** Text that gives way to icons only once the rail is collapsed. */
  const labelClass = collapsed ? 'truncate lg:sr-only' : 'truncate';

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-navy-950/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col
          bg-gradient-to-b from-navy-900 to-navy-950 text-white
          transition-[transform,width] duration-200 ease-out lg:translate-x-0
          ${collapsed ? 'lg:w-[4.75rem]' : 'lg:w-[16.5rem]'}
          ${open ? 'translate-x-0 shadow-xl' : '-translate-x-full'}`}
        aria-label="Main navigation"
      >
        {/* Brand — the same 64px height as the header, so the two align */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.07] px-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
            <LogoMark className="h-[1.125rem] w-[1.125rem]" />
          </span>
          <div className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="truncate text-[0.9375rem] font-semibold leading-tight">{hospitalName}</p>
            <p className="flex items-center gap-1.5 truncate text-[0.6875rem] text-slate-400">
              {/* Accent dot: the session is live. Static, not a pulse — a
                  blinking light in a hospital UI means something. */}
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true" />
              {role === ROLES.PATIENT ? 'Patient portal' : 'Staff portal'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="-mr-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white lg:hidden"
          >
            <Icon name="x" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="scroll-slim flex-1 overflow-y-auto px-3 py-3">
          {groups.map((group, groupIndex) => (
            <div key={group.label ?? 'primary'}>
              {group.label && (
                <>
                  {collapsed && groupIndex > 0 && (
                    <div
                      className="mx-auto my-2.5 hidden h-px w-7 bg-white/10 lg:block"
                      aria-hidden="true"
                    />
                  )}
                  <p
                    className={`px-3 pb-1.5 pt-4 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-slate-400 ${
                      collapsed ? 'lg:sr-only' : ''
                    }`}
                  >
                    {group.label}
                  </p>
                </>
              )}

              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={`${item.to}-${item.label}`}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `${ROW} ${isActive ? ROW_ACTIVE : ROW_IDLE} ${
                          collapsed ? 'lg:justify-center lg:gap-0 lg:px-0' : ''
                        }`
                      }
                    >
                      <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                      <span className={`flex-1 ${labelClass}`}>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse control. The account and sign-out live in the header menu,
            which every page carries — the rail holds places to go, nothing
            else. Desktop-only, hence the hidden wrapper: the drawer would
            otherwise end in an empty bordered strip on mobile. */}
        <div className="hidden shrink-0 border-t border-white/[0.07] p-3 lg:block">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className={`${ROW} ${ROW_IDLE} hidden w-full lg:flex ${
              collapsed ? 'lg:justify-center lg:gap-0 lg:px-0' : ''
            }`}
          >
            <Icon
              name="chevronLeft"
              className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                collapsed ? 'rotate-180' : ''
              }`}
            />
            <span className={labelClass}>Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}
