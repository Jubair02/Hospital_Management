import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  /** One line under the title saying what the dialog is for. */
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const WIDTHS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Nested dialogs are real here — a confirmation can open over a form — and
 * each one locking and unlocking the body would let the inner dialog's cleanup
 * unlock the page while the outer one is still up. Counting the locks means
 * the page is only released when the last dialog closes.
 */
let lockCount = 0;

/** Ids of the dialogs currently open, innermost last. */
const openStack: string[] = [];

const lockBodyScroll = (): void => {
  if (lockCount === 0) {
    // Removing the scrollbar widens the viewport and shifts the whole page
    // left behind the dialog. Holding its width back as padding keeps the
    // page still.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
  }
  lockCount += 1;
};

const unlockBodyScroll = (): void => {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
};

/**
 * The one dialog surface in the app.
 *
 * A bottom sheet under `sm` and a centred dialog above it. A phone-sized
 * centred box has to shrink a ten-field form into the middle of the screen and
 * put its buttons furthest from the thumb; a sheet rising from the bottom edge
 * keeps the full width and lands the actions where the hand already is.
 *
 * The panel is a flex column with a single scrolling body, so the title and
 * the actions stay put however long the form gets — the previous version
 * scrolled the whole panel, which carried the save button off the top of a
 * long dialog.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = 'md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  /** Where focus came from, so it can be handed back on close. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  /** Whether the current gesture began on the backdrop rather than in the panel. */
  const fromBackdrop = useRef(false);

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

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    openStack.push(titleId);

    const onKeyDown = (e: KeyboardEvent) => {
      // Every open dialog listens on the document, so without this a
      // confirmation opened over a form would hand Escape to both and close
      // the form underneath it too.
      if (openStack[openStack.length - 1] !== titleId) return;

      if (e.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;

      // Without this, Tab walks straight out of the dialog and into the page
      // behind it, which is still there and still clickable to a keyboard.
      const panel = panelRef.current;
      if (!panel) return;

      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    lockBodyScroll();

    // Move focus into the dialog, but never away from a field that already
    // has it — a child's autoFocus mounts before this runs and should win.
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel.focus();
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = openStack.lastIndexOf(titleId);
      if (index !== -1) openStack.splice(index, 1);
      unlockBodyScroll();
      // Hand focus back to whatever opened the dialog, so a keyboard user
      // resumes where they left off rather than at the top of the document.
      returnFocusRef.current?.focus?.();
    };
  }, [open, titleId]);

  if (!open) return null;

  // Rendered into the body rather than in place. `position: fixed` and `z-50`
  // are both relative to the nearest stacking context, and the shell wraps
  // every page in an entrance animation (`.rise` in DashboardLayout) — an
  // animation on opacity and transform creates one. A dialog rendered inline
  // is therefore sealed inside that context at its parent's level, which paints
  // it *under* the sticky header (z-20) and the navigation rail (z-40): the
  // title row disappears behind the header and the backdrop stops short of the
  // rail. No z-index on the dialog can escape that; only leaving the subtree
  // can.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="modal-backdrop absolute inset-0 bg-navy-950/55 backdrop-blur-sm"
        // Only a gesture that both started and ended on the backdrop closes the
        // dialog. Selecting text in a field and releasing outside it is not an
        // attempt to discard the form.
        onPointerDown={() => {
          fromBackdrop.current = true;
        }}
        onClick={() => {
          if (fromBackdrop.current) onClose?.();
        }}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        onPointerDown={() => {
          fromBackdrop.current = false;
        }}
        className={`modal-panel relative flex w-full ${WIDTHS[size]} max-h-[92dvh] flex-col
          overflow-hidden rounded-t-3xl border border-line bg-white shadow-xl outline-none
          sm:max-h-[88dvh] sm:rounded-2xl`}
      >
        {/* Sheet handle. Only meaningful on the mobile presentation, where the
            panel reads as something you could pull down. */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1 w-9 rounded-full bg-slate-300" />
        </div>

        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900 sm:text-[0.9375rem]">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-pretty text-sm leading-relaxed text-slate-500">
                {description}
              </p>
            )}
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1.5 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
        </header>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          // Stacked full width on mobile — column children stretch — with the
          // primary action last, so in a sheet anchored to the bottom edge it
          // lands nearest the thumb. Deliberately not `flex-col-reverse`: that
          // would put the primary on top but leave Tab visiting the buttons
          // bottom-to-top, with focus order contradicting what is on screen.
          <footer className="flex shrink-0 flex-col gap-2 border-t border-line bg-slate-50/60 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:justify-end sm:pb-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
