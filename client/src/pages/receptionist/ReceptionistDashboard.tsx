import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../utils/constants';
import Button from '../../components/ui/Button';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';
import Icon from '../../components/ui/icons';
import PatientStatsCards from '../../components/patients/PatientStatsCards';
import AppointmentStatsCards from '../../components/appointments/AppointmentStatsCards';

export default function ReceptionistDashboard() {
  const { user, role } = useAuth();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={role ? ROLE_LABELS[role] : undefined}
        title={`Welcome, ${user?.firstName ?? ''}`.trim()}
        subtitle="Front desk at a glance — today's bookings and the patient register."
        actions={
          <>
            <Link to="/receptionist/appointments/new">
              <Button>
                <Icon name="plus" className="h-4 w-4" />
                Book appointment
              </Button>
            </Link>
            <Link to="/receptionist/patients/new">
              <Button variant="secondary">Register patient</Button>
            </Link>
          </>
        }
      />

      <section className="space-y-3">
        <SectionHeading
          title="Today's appointments"
          hint="Booked, confirmed, and cancelled today"
          actions={
            <Link
              to="/receptionist/appointments"
              className="text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              View schedule →
            </Link>
          }
        />
        <AppointmentStatsCards view="receptionist" />
      </section>

      <section className="space-y-3">
        <SectionHeading title="Patients" hint="Register size and this month's intake" />
        <PatientStatsCards />
      </section>
    </div>
  );
}
