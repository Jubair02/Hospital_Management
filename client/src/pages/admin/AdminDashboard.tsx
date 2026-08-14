import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useSettings from '../../hooks/useSettings';
import { ROLE_LABELS } from '../../utils/constants';
import Button from '../../components/ui/Button';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';
import Icon from '../../components/ui/icons';
import PatientStatsCards from '../../components/patients/PatientStatsCards';
import AppointmentStatsCards from '../../components/appointments/AppointmentStatsCards';
import ConsultationStatsCards from '../../components/consultations/ConsultationStatsCards';

export default function AdminDashboard() {
  const { user, role } = useAuth();
  const { hospitalName } = useSettings();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={role ? ROLE_LABELS[role] : undefined}
        title={`Welcome back, ${user?.firstName ?? ''}`.trim()}
        subtitle={`Live operating picture for ${hospitalName}. Every figure below is queried from the database, not cached.`}
        actions={
          <>
            <Link to="/admin/appointments/new">
              <Button>
                <Icon name="plus" className="h-4 w-4" />
                Book appointment
              </Button>
            </Link>
            <Link to="/admin/patients/new">
              <Button variant="accent">Register patient</Button>
            </Link>
            <Link to="/analytics">
              <Button variant="ghost">Analytics</Button>
            </Link>
          </>
        }
      />

      <section className="space-y-3">
        <SectionHeading
          title="Doctors & appointments"
          hint="Capacity and today's booked load"
          actions={
            <Link
              to="/admin/appointments"
              className="text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              View schedule →
            </Link>
          }
        />
        <AppointmentStatsCards view="admin" />
      </section>

      <section className="space-y-3">
        <SectionHeading title="Consultations" hint="Clinical throughput and open records" />
        <ConsultationStatsCards view="admin" />
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Patients"
          hint="Register size and this month's intake"
          actions={
            <Link
              to="/admin/patients"
              className="text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              View register →
            </Link>
          }
        />
        <PatientStatsCards />
      </section>
    </div>
  );
}
