import { useState } from 'react';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../utils/constants';
import Button from '../../components/ui/Button';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';
import PharmacyStatsCards from '../../components/pharmacy/PharmacyStatsCards';
import DispensingQueueCard from '../../components/pharmacy/DispensingQueueCard';
import StockAttentionCard from '../../components/pharmacy/StockAttentionCard';

/**
 * The pharmacist's board.
 *
 * It used to be counters and three buttons that repeated the sidebar — so it
 * told you eight prescriptions were pending and offered no way to see which,
 * and the navigation it carried was navigation you already had. The counters
 * stay, because stock health is genuinely a number, but the two questions a
 * shift actually opens with — what is waiting, and what is about to go out of
 * date — are now answered on the page rather than counted on it.
 */
export default function PharmacistDashboard() {
  const { user, role } = useAuth();

  /** One Refresh for the whole board; every panel reloads itself. */
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={role ? ROLE_LABELS[role] : undefined}
        title={`Welcome, ${user?.firstName ?? ''}`.trim()}
        subtitle="What is waiting to be dispensed, and what is close to expiry. Low stock and expiry are called out in colour; everything else is routine."
        actions={
          <Button variant="secondary" onClick={() => setRefreshKey((key) => key + 1)}>
            Refresh
          </Button>
        }
      />

      <section className="space-y-3">
        <SectionHeading title="Pharmacy" hint="Catalog, stock exceptions, and today's activity" />
        <PharmacyStatsCards key={refreshKey} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <DispensingQueueCard refreshKey={refreshKey} />
        <StockAttentionCard refreshKey={refreshKey} />
      </div>
    </div>
  );
}
