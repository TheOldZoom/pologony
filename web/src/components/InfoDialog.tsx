import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useStrings } from '../i18n/strings';

export function InfoDialog({
  title,
  close,
  dismissible = true,
  children,
}: {
  title: string;
  close: () => void;
  dismissible?: boolean;
  children: ReactNode;
}) {
  const s = useStrings();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="info-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) close();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) close();
      }}
    >
      <div className="info-card">
        <div className="info-heading">
          <h2 id={titleId}>{title}</h2>
          {dismissible && (
            <button className="action secondary close" aria-label={s.close} onClick={close}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="info-scroll">{children}</div>
      </div>
    </dialog>
  );
}
