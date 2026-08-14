import Badge from '../ui/Badge';
import type { PatientStatus } from '../../types';

export default function PatientStatusBadge({ status }: { status: PatientStatus }) {
  return status === 'active' ? (
    <Badge tone="green">Active</Badge>
  ) : (
    <Badge tone="red">Inactive</Badge>
  );
}
