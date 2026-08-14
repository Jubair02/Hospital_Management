import { Navigate, Outlet } from 'react-router-dom';
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

  if (!role || !allow.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
