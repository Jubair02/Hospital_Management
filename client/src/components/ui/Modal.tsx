import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  footer?: ReactNode;
  children: ReactNode;
  size?: 'md' | 'lg';
}

/**
 * Accessible modal dialog: closes on Escape and backdrop click, focuses
 * itself on open, and locks body scroll while visible.
 */
export default function Modal({ open, onClose, title, footer, children, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Callers pass `onClose` as an inline arrow, so its identity changes on
   * every parent render. Reading it through a ref keeps the effect below
   * keyed on `open` alone — otherwise a dialog whose form state lives in
   * the parent would re-run the effect on every keystroke and pull focus
   * out of the field being typed into, accepting only one character.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog, but never away from a field that already
    // has it — a child's autoFocus mounts before this runs and should win.
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel.focus();
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const width = size === 'lg' ? 'max-w-2xl' : 'max-w-lg';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`scroll-slim relative w-full ${width} max-h-[90vh] overflow-y-auto rounded-2xl
          border border-line bg-white shadow-xl outline-none rise`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-[0.9375rem] font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-line bg-slate-50/60 px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
