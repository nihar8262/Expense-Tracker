type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  isConfirming = false,
  onCancel,
  onConfirm
}: ConfirmModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="card confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-copy"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Confirm deletion</p>
        <h2 id="confirm-modal-title">{title}</h2>
        <p id="confirm-modal-copy" className="confirm-modal-copy">
          {description}
        </p>

        <div className="confirm-modal-actions">
          <button type="button" className="ghost-button confirm-modal-button" onClick={onCancel} disabled={isConfirming}>
            {cancelLabel}
          </button>
          <button type="button" className="secondary-button confirm-modal-button destructive-shell-button" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Deleting account..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
