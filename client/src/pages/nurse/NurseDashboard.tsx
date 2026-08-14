import DashboardPlaceholder, { type Kpi } from '../../components/DashboardPlaceholder';

const KPIS: Kpi[] = [
  { label: 'Assigned patients', hint: 'Patients on your ward today', icon: 'patients' },
  { label: 'Vitals due', hint: 'Scheduled observations remaining', icon: 'activity' },
  { label: 'Ward occupancy', hint: 'Beds in use on your ward', icon: 'bed' },
];

export default function NurseDashboard() {
  return <DashboardPlaceholder kpis={KPIS} />;
}
