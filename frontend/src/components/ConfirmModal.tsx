import { ModalFrame } from "./ui";

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
    <ModalFrame onClose={onCancel} className="max-w-[560px] p-6 sm:p-8">
      <div className="space-y-5">
        <div className="space-y-3">
          <p className="section-eyebrow">Confirm action</p>
          <h2 className="font-display text-4xl leading-none tracking-[-0.03em] text-ink">{title}</h2>
          <p className="text-sm leading-7 text-secondary sm:text-base">{description}</p>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="ui-button-secondary" onClick={onCancel} disabled={isConfirming}>
            {cancelLabel}
          </button>
          <button type="button" className="ui-button-danger" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}