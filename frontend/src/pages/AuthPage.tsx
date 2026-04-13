import { ProviderLogo } from "../components/ProviderLogo";
import { EmptyState, StatusNotice, SurfaceCard, cn } from "../components/ui";
import type { ProviderOption } from "../types";

type AuthPageProps = {
  mode: "signin" | "signup";
  authLoading: boolean;
  authMessage: string;
  providerOptions: ProviderOption[];
  onBack: () => void;
  onChangeMode: (mode: "signin" | "signup") => void;
  onSignIn: (provider: ProviderOption["provider"]) => Promise<void>;
};

export function AuthPage({ mode, authLoading, authMessage, providerOptions, onBack, onChangeMode, onSignIn }: AuthPageProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[1220px] items-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.88fr)] lg:items-center">
        <div className="hidden lg:block">
          <div className="space-y-5 px-4">
            <button type="button" className="ui-button-ghost -ml-4" onClick={onBack}>
              Back to landing
            </button>
            <p className="section-eyebrow">Secure access</p>
            <h1 className="max-w-xl font-display text-[4.6rem] leading-[0.88] tracking-[-0.05em] text-ink">
              {mode === "signin" ? "Return to a finance space that stays quiet and precise." : "Create a calm finance account built for daily use."}
            </h1>
            <p className="max-w-lg text-lg leading-8 text-secondary">
              Use a provider you already trust. The app keeps private tracking, shared wallets, and alerts inside one connected product system.
            </p>
          </div>
        </div>

        <SurfaceCard className="mx-auto w-full max-w-[560px] overflow-hidden p-5 sm:p-7">
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 lg:hidden">
              <button type="button" className="ui-button-ghost -ml-3" onClick={onBack}>
                Back
              </button>
              <p className="section-eyebrow">Expense Tracker</p>
            </div>

            <div className="space-y-4">
              <p className="section-eyebrow">Secure access</p>
              <div className="space-y-2">
                <h2 className="font-display text-[3rem] leading-none tracking-[-0.04em] text-ink sm:text-[3.5rem]">{mode === "signin" ? "Sign in" : "Sign up"}</h2>
                <p className="text-sm leading-7 text-secondary sm:text-base">
                  {mode === "signin"
                    ? "Choose a provider to open your private expense workspace."
                    : "Create your account with a provider below. If the account already exists, you will be signed in instead."}
                </p>
              </div>
            </div>

            <div className="inline-flex rounded-full border border-[color:var(--border)] bg-white/70 p-1 shadow-sm" role="tablist" aria-label="Authentication mode">
              <button type="button" className={cn("ui-button-ghost min-w-[120px]", mode === "signin" && "bg-white text-ink shadow-sm")} onClick={() => onChangeMode("signin")}>
                Sign in
              </button>
              <button type="button" className={cn("ui-button-ghost min-w-[120px]", mode === "signup" && "bg-white text-ink shadow-sm")} onClick={() => onChangeMode("signup")}>
                Sign up
              </button>
            </div>

            {authLoading ? (
              <EmptyState title="Checking your session" description="The app is confirming whether an authenticated session already exists for this browser." />
            ) : (
              <div className="grid gap-3">
                {providerOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="group flex w-full items-start gap-4 rounded-[24px] border border-[color:var(--border)] bg-white/80 px-5 py-4 text-left shadow-sm hover:-translate-y-0.5 hover:bg-white"
                    onClick={() => void onSignIn(option.provider)}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-white text-xl text-ink shadow-sm">
                      <ProviderLogo providerId={option.id} />
                    </span>
                    <span className="block space-y-1">
                      <strong className="block text-base font-semibold text-ink">{mode === "signin" ? option.label : option.label.replace("Continue", "Create account")}</strong>
                      <span className="block text-sm leading-6 text-secondary">{option.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {authMessage ? <StatusNotice tone="error">{authMessage}</StatusNotice> : null}
          </div>
        </SurfaceCard>
      </div>
    </main>
  );
}