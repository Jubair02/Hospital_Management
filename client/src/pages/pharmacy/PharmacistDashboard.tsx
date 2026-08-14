import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../utils/constants';
import Button from '../../components/ui/Button';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';
import Icon from '../../components/ui/icons';
import PharmacyStatsCards from '../../components/pharmacy/PharmacyStatsCards';

export default function PharmacistDashboard() {
  const { user, role } = useAuth();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={role ? ROLE_LABELS[role] : undefined}
        title={`Welcome, ${user?.firstName ?? ''}`.trim()}
        subtitle="Dispensing queue and stock health. Low stock and expiry are called out in red — everything else is routine."
        actions={
          <>
            <Link to="/pharmacy/prescriptions">
              <Button>
                <Icon name="clipboard" className="h-4 w-4" />
                Prescriptions
              </Button>
            </Link>
            <Link to="/pharmacy/inventory">
              <Button variant="secondary">Inventory</Button>
            </Link>
            <Link to="/pharmacy/medicines">
              <Button variant="ghost">Medicines</Button>
            </Link>
          </>
        }
      />

      <section className="space-y-3">
        <SectionHeading title="Pharmacy" hint="Catalog, stock exceptions, and today's activity" />
        <PharmacyStatsCards />
      </section>
    </div>
  );
}
