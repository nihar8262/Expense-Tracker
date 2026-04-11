import type { ProviderOption } from "../types";
import { ProviderLogo } from "../components/ProviderLogo";

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
    <main className="app-shell auth-shell">
      <section className="auth-page-frame">
        <button type="button" className="text-button" onClick={onBack}>
          Back to landing
        </button>

        <section className="card auth-panel auth-panel-minimal">
          <div className="auth-panel-top">
            <div>
              <p className="eyebrow">Secure Access</p>
              <h2>{mode === "signin" ? "Sign in" : "Sign up"}</h2>
            </div>

            <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
              <button type="button" className={mode === "signin" ? "auth-toggle-button is-active" : "auth-toggle-button"} onClick={() => onChangeMode("signin")}>
                Sign in
              </button>
              <button type="button" className={mode === "signup" ? "auth-toggle-button is-active" : "auth-toggle-button"} onClick={() => onChangeMode("signup")}>
                Sign up
              </button>
            </div>
          </div>

          <p className="auth-panel-copy">
            {mode === "signin"
              ? "Choose your provider to open your private expense dashboard."
              : "Create your account with a provider below. If the account already exists, we will sign you in instead."}
          </p>

          {authLoading ? <p className="empty-state">Checking your session...</p> : null}

          {!authLoading ? (
            <div className="provider-list">
              {providerOptions.map((option) => (
                <button key={option.id} type="button" className={`provider-button provider-${option.id}`} onClick={() => void onSignIn(option.provider)}>
                  <span className="provider-mark">
                    <ProviderLogo providerId={option.id} />
                  </span>
                  <span className="provider-text">
                    <strong>{mode === "signin" ? option.label : option.label.replace("Continue", "Create account")}</strong>
                    <span>{option.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {authMessage ? <p className="status-message error">{authMessage}</p> : null}
        </section>
      </section>
    </main>
  );
}
