import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { formatMoney } from '../../utils/money';
import { formatDate } from '../../utils/date';
import type { PortalDashboard } from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import { AppointmentStatusBadge, StatusBadge, doctorLabel } from './portalShared';

export default function PortalDashboardPage() {
  const [data, setData] = useState<PortalDashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, 'Unable to load your dashboard.')));
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <FullPageSpinner label="Loading your dashboard" />;

  const totalDue = data.outstandingInvoices.reduce((sum, invoice) => sum + invoice.dueAmount, 0);
  const nextAppointment = data.upcomingAppointments[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title={`Welcome, ${data.patient.firstName}`}
        subtitle={`Patient ID ${data.patient.patientId} — your appointments, results, and bills in one place.`}
        actions={
          <Link to="/patient/appointments/new">
            <Button>Book appointment</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Upcoming appointments"
          value={data.upcomingAppointments.length}
          icon="appointments"
          tone="brand"
          hint={
            nextAppointment
              ? `Next: ${formatDate(nextAppointment.appointmentDate)} ${nextAppointment.startTime}`
              : 'Nothing booked'
          }
          to="/patient/appointments"
        />
        <StatCard
          label="Active prescriptions"
          value={data.activePrescriptionLines.length}
          icon="pill"
          tone="teal"
          hint="Partially dispensed lines"
          to="/patient/medications"
        />
        <StatCard
          label="Outstanding balance"
          value={totalDue}
          money
          icon="cash"
          tone={totalDue > 0 ? 'amber' : 'teal'}
          hint={`${data.outstandingInvoices.length} open invoice(s)`}
          to="/patient/billing"
        />
        <StatCard
          label="Unread notifications"
          value={data.unreadNotifications}
          icon="bell"
          tone={data.unreadNotifications > 0 ? 'amber' : 'slate'}
          to="/patient/notifications"
        />
      </div>

      {data.currentAdmission && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                You are currently admitted — {data.currentAdmission.wardId?.name ?? 'Ward'}
                {data.currentAdmission.bedId ? `, bed ${data.currentAdmission.bedId.bedNumber}` : ''}
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                Since {formatDate(data.currentAdmission.admissionDate)} · attending{' '}
                {doctorLabel(data.currentAdmission.doctorId)}
              </p>
            </div>
            <Link to="/patient/admission">
              <Button variant="secondary" size="sm">
                View admission
              </Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <SectionHeading
            title="Upcoming appointments"
            actions={
              <Link to="/patient/appointments" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                View all
              </Link>
            }
          />
          <Card>
            {data.upcomingAppointments.length === 0 ? (
              <EmptyState
                title="No upcoming appointments"
                description="Book a visit with a doctor in a few clicks."
                action={
                  <Link to="/patient/appointments/new">
                    <Button size="sm">Book appointment</Button>
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.upcomingAppointments.map((appointment) => (
                  <li key={appointment._id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link
                        to={`/patient/appointments/${appointment._id}`}
                        className="truncate text-sm font-medium text-slate-800 hover:text-brand-700"
                      >
                        {doctorLabel(appointment.doctorId)}
                      </Link>
                      <p className="text-sm text-slate-500">
                        {formatDate(appointment.appointmentDate)} · {appointment.startTime}–{appointment.endTime}
                        {appointment.departmentId ? ` · ${appointment.departmentId.name}` : ''}
                      </p>
                    </div>
                    <AppointmentStatusBadge status={appointment.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <SectionHeading
            title="Recent lab results"
            hint="Verified results only"
            actions={
              <Link to="/patient/laboratory" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                View all
              </Link>
            }
          />
          <Card>
            {data.recentLabResults.length === 0 ? (
              <EmptyState title="No results yet" description="Verified lab results will appear here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recentLabResults.map((result) => (
                  <li key={result._id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{result.testName}</p>
                      <p className="text-sm text-slate-500">
                        {result.value ?? '—'}
                        {result.unit ? ` ${result.unit}` : ''}
                        {result.referenceRange ? ` · ref ${result.referenceRange}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatDate(result.verifiedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <SectionHeading
            title="Outstanding invoices"
            actions={
              <Link to="/patient/billing" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                View all
              </Link>
            }
          />
          <Card>
            {data.outstandingInvoices.length === 0 ? (
              <EmptyState title="Nothing due" description="You have no open invoices." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.outstandingInvoices.map((invoice) => (
                  <li key={invoice._id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link
                        to={`/patient/billing/${invoice._id}`}
                        className="text-sm font-medium text-slate-800 hover:text-brand-700"
                      >
                        {invoice.invoiceId}
                      </Link>
                      <p className="text-sm text-slate-500">{formatDate(invoice.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-slate-900">
                        {formatMoney(invoice.dueAmount)}
                      </p>
                      <StatusBadge status={invoice.paymentStatus} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <SectionHeading
            title="Recent payments"
            actions={
              <Link to="/patient/billing" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Billing
              </Link>
            }
          />
          <Card>
            {data.recentPayments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recentPayments.map((payment) => (
                  <li key={payment._id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{payment.paymentId}</p>
                      <p className="text-sm text-slate-500">
                        {formatDate(payment.paidAt)} · {payment.method.replace('_', ' ')}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-emerald-700">
                      {formatMoney(payment.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
