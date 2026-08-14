import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { DASHBOARD_PATHS } from '../utils/constants';
import Button from '../components/ui/Button';

export default function UnauthorizedPage() {
  const { role } = useAuth();
  const home = role ? DASHBOARD_PATHS[role] : '/';

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-sm font-semibold text-brand-700">403</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        You don't have access to that page
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        That area is restricted to a different role. If you believe you need
        access, contact your system administrator.
      </p>
      <Link to={home} className="mt-6">
        <Button>Back to my dashboard</Button>
      </Link>
    </div>
  );
}
