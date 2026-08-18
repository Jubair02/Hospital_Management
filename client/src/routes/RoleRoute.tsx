import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import type { Role } from '../types';

interface RoleRouteProps {
  allow: Role[];
}

/**
 * Restricts a route subtree to the given roles. Must be nested inside
 * ProtectedRoute so authentication has already been checked.
 *
 *   <Route element={<RoleRoute allow={['admin']} />}> ... </Route>
 */
export default function RoleRoute({ allow }: RoleRouteProps) {
  const { role } = useAuth();
  const location = useLocation();

  if (!role || !allow.includes(role)) {
    // The refused address travels with the redirect. Without it the 403 can
    // only say "some page", which is not enough for the user to report — and
    // reporting it is the one action that page can offer.
    return <Navigate to="/unauthorized" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
