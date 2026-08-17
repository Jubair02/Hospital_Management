import AppRoutes from './routes/AppRoutes';
import ErrorBoundary from './components/ui/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  );
}
