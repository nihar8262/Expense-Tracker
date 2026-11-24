import { Check, Database, RefreshCw, ShieldCheck, Sparkles, WalletCards, X } from "lucide-react";
import { ModalFrame, SurfaceCard } from "./ui";

type InitialDeviceSetupProps = {
  state: "checking" | "required" | "ready" | "syncing" | "failed";
  progress: number;
  stageLabel: string;
  detail?: string;
  error?: string;
  onStart: () => void;
};

export function InitialDeviceSetup({ state, progress, stageLabel, detail, error, onStart }: InitialDeviceSetupProps) {
  const isBusy = state === "checking" || state === "syncing" || state === "ready";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(155deg,#f8f0d9_0%,#eef4ec_48%,#dcebe3_100%)] px-4 py-8">
      <div className="absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_top,rgba(35,135,92,0.18),transparent_68%)]" aria-hidden="true" />
      <SurfaceCard className="relative w-full max-w-[560px] overflow-hidden border-white/70 p-5 shadow-[0_28px_90px_rgba(31,70,52,0.16)] sm:p-8">
        <div className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
            {state === "ready" ? <Check className="h-6 w-6" /> : <Database className="h-6 w-6" />}
          </span>
          <div>
            <p className="section-eyebrow">One-time device setup</p>
            <h1 className="mt-1 font-display text-2xl leading-tight tracking-tight text-ink sm:text-3xl">
              {state === "ready" ? "Your device is ready" : "Preparing your private expense space"}
            </h1>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-secondary">
          We’ll securely prepare your account data on this device so Finance Space opens quickly. Automatic synchronization remains off after setup.
        </p>

        <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold">
            <span className="text-secondary">{stageLabel}</span>
            <span className="tabular-nums text-primary">{Math.round(progress)}%</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white shadow-inner">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),#53b383)] transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          {detail ? <p className="mt-2.5 text-[11px] leading-5 text-muted">{detail}</p> : null}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-secondary sm:text-xs">
          <div className="rounded-xl bg-white/75 px-2 py-3"><ShieldCheck className="mx-auto mb-1.5 h-4 w-4 text-primary" />Private SQLite</div>
          <div className="rounded-xl bg-white/75 px-2 py-3"><WalletCards className="mx-auto mb-1.5 h-4 w-4 text-primary" />Account data</div>
          <div className="rounded-xl bg-white/75 px-2 py-3"><RefreshCw className="mx-auto mb-1.5 h-4 w-4 text-primary" />Manual sync</div>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-700" role="alert">
            {error}
          </div>
        ) : null}

        {state === "required" || state === "failed" ? (
          <button type="button" onClick={onStart} className="ui-button-primary mt-5 w-full justify-center">
            <RefreshCw className="h-4 w-4" /> {state === "failed" ? "Retry setup" : "Prepare this device"}
          </button>
        ) : null}

        {isBusy ? (
          <p className="mt-5 text-center text-[11px] leading-5 text-muted">
            Keep the app open during setup. Existing server data is never deleted by this process.
          </p>
        ) : null}
      </SurfaceCard>
    </main>
  );
}

type WhatsNewModalProps = {
  onClose: () => void;
  onOpenSyncSettings: () => void;
};

export function WhatsNewModal({ onClose, onOpenSyncSettings }: WhatsNewModalProps) {
  return (
    <ModalFrame onClose={onClose} className="max-w-[520px] overflow-hidden p-0">
      <div className="relative bg-[linear-gradient(135deg,rgba(30,130,86,0.14),rgba(244,218,145,0.2))] px-5 pb-5 pt-6 sm:px-7">
        <button type="button" onClick={onClose} aria-label="Close what’s new" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-muted shadow-sm">
          <X className="h-4 w-4" />
        </button>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
          <Sparkles className="h-5 w-5" />
        </span>
        <p className="section-eyebrow mt-4">Ready on this device</p>
        <h2 className="mt-1 font-display text-2xl tracking-tight text-ink">What’s new in Finance Space</h2>
        <p className="mt-2 text-sm leading-6 text-secondary">Your app is now prepared for fast, local-first money tracking.</p>
      </div>
      <div className="space-y-2 px-5 py-5 sm:px-7">
        {[
          "Faster expenses and budgets backed by private device storage",
          "Manual two-way synchronization whenever you choose",
          "Debit detection from supported banking notifications",
          "Native budget, wallet, loan, and payment alerts",
          "Cached wallet dashboards that load instantly after first use"
        ].map((item) => (
          <div key={item} className="flex gap-2.5 rounded-xl bg-zinc-50 px-3 py-2.5 text-xs leading-5 text-secondary">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{item}</span>
          </div>
        ))}
        <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onOpenSyncSettings} className="ui-button-secondary justify-center">Review sync settings</button>
          <button type="button" onClick={onClose} className="ui-button-primary justify-center">Got it</button>
        </div>
      </div>
    </ModalFrame>
  );
}
