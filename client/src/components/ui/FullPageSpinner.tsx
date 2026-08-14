import Spinner from './Spinner';

export default function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas">
      <Spinner size="lg" className="text-brand-700" />
      <p className="text-sm text-slate-500">{label}…</p>
    </div>
  );
}
