import { useState } from "react";
import { ModalFrame } from "./ui";

type TokenRevealModalProps = {
  isOpen: boolean;
  token: string | null;
  label: string;
  onClose: () => void;
};

export function TokenRevealModal({ isOpen, token, label, onClose }: TokenRevealModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !token) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy token to clipboard:", err);
    }
  };

  return (
    <ModalFrame onClose={onClose} className="max-w-[560px] p-6 sm:p-8">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="section-eyebrow text-primary">New Access Token Generated</p>
          <h2 className="font-display text-4xl leading-none tracking-[-0.03em] text-ink">
            Copy Token for &ldquo;{label}&rdquo;
          </h2>
          <div className="border border-red-500/20 bg-red-500/5 rounded-2xl p-3 text-xs text-red-900 leading-relaxed">
            <strong>Warning:</strong> For your security, this raw token will be shown <strong>exactly once</strong>. Once you close this modal, you will never be able to see it again. Copy it now!
          </div>
        </div>

        <div className="space-y-2">
          <div className="relative flex items-center">
            <input
              type="text"
              readOnly
              value={token}
              className="w-full font-mono text-sm bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3.5 pr-20 outline-none text-primary"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="absolute right-2 px-3 py-1.5 text-xs font-semibold rounded-xl bg-primary text-white hover:bg-primary/95 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="button" className="ui-button-primary px-5" onClick={onClose}>
            Done & Close
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
