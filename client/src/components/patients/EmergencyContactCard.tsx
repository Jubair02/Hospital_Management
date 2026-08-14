import Card from '../ui/Card';
import type { Patient } from '../../types';

const Value = ({ children }: { children?: string }) =>
  children ? (
    <span className="text-slate-800">{children}</span>
  ) : (
    <span className="text-slate-400">Not recorded</span>
  );

export default function EmergencyContactCard({ patient }: { patient: Patient }) {
  return (
    <Card title="Emergency contact">
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Name</dt>
          <dd className="text-right"><Value>{patient.emergencyContactName}</Value></dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Phone</dt>
          <dd className="text-right"><Value>{patient.emergencyContact}</Value></dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Relationship</dt>
          <dd className="text-right"><Value>{patient.emergencyContactRelation}</Value></dd>
        </div>
      </dl>
    </Card>
  );
}
