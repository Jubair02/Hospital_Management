import type { ReactNode } from 'react';
import Modal from './Modal';
import Button from './Button';
import Icon from './icons';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation for a consequential action.
 *
 * Narrower than a form dialog on purpose: a question with two answers should
 * not open at the width of a ten-field form. The danger variant carries a
 * glyph, because the difference between "save this" and "delete this" needs to
 * register before the sentence is read — the primary variant does not, since
 * an icon on every confirmation is decoration and stops meaning anything.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3.5">
        {tone === 'danger' && (
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100"
          >
            <Icon name="alert" className="h-[1.125rem] w-[1.125rem]" />
          </span>
        )}
        <div className="min-w-0 text-pretty text-sm leading-relaxed text-slate-600">{children}</div>
      </div>
    </Modal>
  );
}
