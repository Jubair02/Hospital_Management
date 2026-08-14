import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';
import Icon from '../../components/ui/icons';
import AppointmentStatsCards from '../../components/appointments/AppointmentStatsCards';
import ConsultationStatsCards from '../../components/consultations/ConsultationStatsCards';

export default function DoctorDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Doctor"
        title={`Welcome, Dr. ${user?.lastName ?? ''}`.trim()}
        subtitle="Your clinic for today, plus anything still open from earlier."
        actions={
          <>
            <Link to="/doctor/appointments">
              <Button>
                <Icon name="appointments" className="h-4 w-4" />
                My appointments
              </Button>
            </Link>
            <Link to="/doctor/consultations">
              <Button variant="secondary">My consultations</Button>
            </Link>
            <Link to="/doctor/availability">
              <Button variant="ghost">My availability</Button>
            </Link>
          </>
        }
      />

      <section className="space-y-3">
        <SectionHeading title="Appointments" hint="Today's clinic and what is booked ahead" />
        <AppointmentStatsCards view="doctor" />
      </section>

      <section className="space-y-3">
        <SectionHeading title="Consultations" hint="Records started, locked, and still open" />
        <ConsultationStatsCards view="doctor" />
      </section>
    </div>
  );
}
