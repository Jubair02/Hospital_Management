import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import FullPageSpinner from '../components/ui/FullPageSpinner';

/**
 * Blocks unauthenticated users. While the session is being restored on
 * page refresh, shows a full-page spinner instead of redirecting early.
 */
export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullPageSpinner label="Restoring your session" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
