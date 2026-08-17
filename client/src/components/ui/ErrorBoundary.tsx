import { Component, type ErrorInfo, type ReactNode } from 'react';
import Button from './Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render or effect crash and says what happened.
 *
 * React unmounts the whole tree when an error reaches the root, so without
 * this a single bad property access anywhere in the app leaves a blank white
 * page — no message, no route, nothing to report but "it stopped working".
 * On a clinical system that is the difference between a bug someone can
 * describe and a bug nobody can.
 *
 * Deliberately a hard reload rather than a state reset: whatever produced the
 * error is still in memory, and pretending otherwise usually re-crashes.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the component stack in the console for whoever is debugging; the
    // panel below only shows the message, which is what a user can relay.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60dvh] items-center justify-center p-6">
        <div className="surface-card w-full max-w-lg p-6 text-center">
          <p className="text-sm font-semibold text-rose-700">Something broke on this screen</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">
            The page could not be displayed
          </h1>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-slate-500">
            Nothing you entered was sent. Reload to try again — if it keeps happening, quote the
            message below.
          </p>

          <pre className="scroll-slim mt-4 max-h-40 overflow-auto rounded-xl bg-slate-50 p-3 text-left text-xs leading-relaxed text-slate-700 ring-1 ring-inset ring-line">
            {error.message}
          </pre>

          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => window.history.back()}>
              Go back
            </Button>
            <Button onClick={() => window.location.reload()}>Reload page</Button>
          </div>
        </div>
      </div>
    );
  }
}
