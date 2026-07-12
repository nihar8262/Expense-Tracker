import { useEffect, useState } from "react";
import { ProviderLogo } from "../components/ProviderLogo";
import { StatusNotice, cn } from "../components/ui";
import type { ProviderOption } from "../types";

type AuthPageProps = {
  mode: "signin" | "signup";
  authLoading: boolean;
  authMessage: string;
  providerOptions: ProviderOption[];
  onBack: () => void;
  onChangeMode: (mode: "signin" | "signup") => void;
  onSignIn: (provider: ProviderOption["provider"]) => Promise<void>;
  onSignInWithEmail: (email: string, password: string) => Promise<void>;
  onSignUpWithEmail: (email: string, password: string) => Promise<void>;
  onSendPasswordReset: (email: string) => Promise<void>;
};

export function AuthPage({
  mode,
  authLoading,
  authMessage,
  providerOptions,
  onBack,
  onChangeMode,
  onSignIn,
  onSignInWithEmail,
  onSignUpWithEmail,
  onSendPasswordReset
}: AuthPageProps) {
  const [localMode, setLocalMode] = useState<"signin" | "signup" | "forgot">(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [localMessage, setLocalMessage] = useState("");

  // Sync mode changes from parent routes
  useEffect(() => {
    setLocalMode(mode);
  }, [mode]);

  // Reset errors and fields on mode change
  useEffect(() => {
    setLocalError("");
    setLocalMessage("");
  }, [localMode]);

  const validateEmail = (val: string) => {
    return /\S+@\S+\.\S+/.test(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    setLocalMessage("");

    if (!email.trim()) {
      setLocalError("Please enter your email address.");
      return;
    }

    if (!validateEmail(email)) {
      setLocalError("Please enter a valid email address.");
      return;
    }

    if (localMode !== "forgot" && !password) {
      setLocalError("Please enter your password.");
      return;
    }

    if (localMode === "signup" && password.length < 6) {
      setLocalError("The password must be at least 6 characters long.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (localMode === "signin") {
        await onSignInWithEmail(email.trim(), password);
      } else if (localMode === "signup") {
        await onSignUpWithEmail(email.trim(), password);
      } else if (localMode === "forgot") {
        await onSendPasswordReset(email.trim());
        setLocalMessage("A password reset link has been successfully sent to your email.");
        setEmail("");
      }
    } catch (error) {
      // Global hook sets the authMessage; we display it below
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuthSignIn = async (provider: ProviderOption["provider"]) => {
    setLocalError("");
    setLocalMessage("");
    setIsSubmitting(true);
    try {
      await onSignIn(provider);
    } catch (error) {
      // Handled globally
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen w-full flex items-center justify-center bg-[radial-gradient(rgba(6,26,17,0.38)_1.2px,transparent_1.2px)] [background-size:20px_20px,100%_100%] bg-white p-4 sm:p-6 lg:p-8">
      <div className="relative w-full max-w-[1220px] lg:py-2 lg:px-4 rounded-[32px] lg:bg-linear-to-br from-green-500/20 to-yellow-700/10 lg:backdrop-blur-md grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:items-center">
        
        {/* Left Column (Desktop only) */}
        <div className="hidden lg:flex flex-col justify-center space-y-6">
          <button
            type="button"
            disabled={isSubmitting || authLoading}
            onClick={onBack}
            className="self-start text-zinc-800 p-2 rounded-full hover:bg-green-200/50 hover:backdrop-blur-md transition duration-200 text-xs flex items-center gap-1.5 font-medium cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to landing
          </button>

          <div className="space-y-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-800">SECURE ACCESS</span>
            <h1 className="font-display text-[4.2rem] leading-[0.92] tracking-[-0.04em] text-ink max-w-xl">
              {localMode === "signin"
                ? "Return to a finance space that stays quiet and precise."
                : localMode === "signup"
                ? "Create a calm finance account built for daily use."
                : "Recover your quiet, secure workspace access."}
            </h1>
            <p className="max-w-md text-lg leading-8 text-secondary">
              Use a provider you already trust. The app keeps private tracking, shared wallets, and alerts inside one connected product system.
            </p>
          </div>
        </div>

        {/* Right Column (Auth Card) */}
        <div className="relative w-full max-w-[480px] lg:max-w-[440px] bg-white border border-zinc-150 rounded-[32px] px-8 py-10 shadow-[0_16px_48px_rgba(0,0,0,0.03)] overflow-hidden mx-auto lg:mr-0">
          {/* Back Button (Mobile only) */}
          <button
            type="button"
            disabled={isSubmitting || authLoading}
            onClick={onBack}
            className="lg:hidden absolute left-6 top-6 text-zinc-400 hover:text-ink disabled:opacity-50 transition duration-150 text-xs flex items-center gap-1.5 font-medium cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>

          {/* Headline Header */}
          <div className="space-y-1 mt-4 mb-6">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">SECURE ACCESS</span>
            <h2 className="font-display text-[2.2rem] tracking-[-0.03em] text-ink leading-none">
              {localMode === "signin" ? "Sign in" : localMode === "signup" ? "Sign up" : "Reset Password"}
            </h2>
            <p className="text-xs text-secondary leading-relaxed max-w-[340px]">
              {localMode === "signin"
                ? "Choose a provider to open your private expense workspace."
                : localMode === "signup"
                ? "Create your account with a provider below to get started."
                : "We will send a recovery link to your registered email."}
            </p>
          </div>

          {/* Tab Switcher (Only in signin/signup modes) */}
          {localMode !== "forgot" && (
            <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-800 p-1 shadow-sm mb-6" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                disabled={isSubmitting || authLoading}
                onClick={() => {
                  onChangeMode("signin");
                  setLocalMode("signin");
                }}
                className={cn(
                  "px-5 py-1.5 text-xs font-semibold rounded-full transition-all duration-150 cursor-pointer disabled:opacity-50 min-w-[100px]",
                  localMode === "signin"
                    ? "bg-white text-ink shadow-sm"
                    : "text-zinc-50 hover:text-zinc-400"
                )}
              >
                Sign in
              </button>
              <button
                type="button"
                disabled={isSubmitting || authLoading}
                onClick={() => {
                  onChangeMode("signup");
                  setLocalMode("signup");
                }}
                className={cn(
                  "px-5 py-1.5 text-xs font-semibold rounded-full transition-all duration-150 cursor-pointer disabled:opacity-50 min-w-[100px]",
                  localMode === "signup"
                    ? "bg-white text-ink shadow-sm"
                    : "text-zinc-50 hover:text-zinc-400"
                )}
              >
                Sign up
              </button>
            </div>
          )}

          {/* Notices */}
          {localError && <StatusNotice tone="error" className="mb-4">{localError}</StatusNotice>}
          {authMessage && !localError && <StatusNotice tone="error" className="mb-4">{authMessage}</StatusNotice>}
          {localMessage && <StatusNotice tone="success" className="mb-4">{localMessage}</StatusNotice>}
          {localMode === "forgot" && localMessage && (
            <p className="text-xs text-center pb-5 font-bold text-red-500">You must check your spam/junk folder for the link!</p>
          )}

          {localMode === "forgot" && localMessage ? (
            <div className="space-y-4 pt-2">
              <button
                type="button"
                onClick={() => {
                  setLocalMessage("");
                  setLocalError("");
                  setLocalMode("signin");
                }}
                className="w-full bg-ink hover:bg-zinc-800 text-white font-semibold py-3.5 px-4 rounded-2xl transition duration-150 flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
              >
                Sign In
              </button>
            </div>
          ) : (
            /* Input Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Address */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-ink mb-1.5">Email Address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  disabled={isSubmitting || authLoading}
                  required
                  autoComplete="email"
                  className="w-full rounded-2xl border border-[color:var(--border)] bg-white px-4 py-3.5 text-sm text-ink placeholder:text-muted/70 focus:border-primary/45 focus:ring-4 focus:ring-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
                />
              </div>

              {/* Password (signin/signup modes only) */}
              {localMode !== "forgot" && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label htmlFor="password" className="block text-sm font-semibold text-ink">Password</label>
                    {localMode === "signin" && (
                      <button
                        type="button"
                        disabled={isSubmitting || authLoading}
                        onClick={() => setLocalMode("forgot")}
                        className="text-xs font-semibold text-primary hover:text-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={isSubmitting || authLoading}
                      required
                      autoComplete={localMode === "signin" ? "current-password" : "new-password"}
                      className="w-full rounded-2xl border border-[color:var(--border)] bg-white px-4 py-3.5 pr-12 text-sm text-ink placeholder:text-muted/70 focus:border-primary/45 focus:ring-4 focus:ring-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
                    />
                    <button
                      type="button"
                      disabled={isSubmitting || authLoading}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-ink disabled:opacity-50 transition-colors p-1 cursor-pointer"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Action Trigger Button */}
              <button
                type="submit"
                disabled={isSubmitting || authLoading}
                className="w-full mt-2 bg-ink hover:bg-zinc-800 text-white font-semibold py-3.5 px-4 rounded-2xl transition duration-150 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting || authLoading ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : localMode === "signin" ? (
                  "Sign In"
                ) : localMode === "signup" ? (
                  "Create Account"
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </form>
          )}

          {/* Separator and Social Options (signin/signup modes only) */}
          {localMode !== "forgot" && providerOptions.length > 0 && (
            <>
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-[1px] bg-zinc-200" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">or continue with</span>
                <div className="flex-1 h-[1px] bg-zinc-200" />
              </div>

              <div className="flex gap-3">
                {providerOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isSubmitting || authLoading}
                    onClick={() => void handleOAuthSignIn(option.provider)}
                    className="w-full flex items-center justify-center gap-3 border border-zinc-200 hover:border-green-600 hover:bg-green-50  bg-white py-1.5 px-2 rounded-2xl text-sm font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    <span className="w-8 h-8 shrink-0 flex items-center justify-center">
                      <ProviderLogo providerId={option.id} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Footer Navigation (Forgot Mode Only) */}
          {localMode === "forgot" && !localMessage && (
            <div className="text-center mt-6 text-sm">
              <p className="text-secondary font-medium">
                Remember your password?{" "}
                <button
                  type="button"
                  disabled={isSubmitting || authLoading}
                  onClick={() => setLocalMode("signin")}
                  className="font-bold text-primary hover:underline transition cursor-pointer disabled:opacity-50"
                >
                  Sign in
                </button>
              </p>
            </div>
          )}

          {/* Bottom Glow Tint - website colour combination (Forest Green) */}
          <div
            className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 100% 65% at 50% 100%, rgba(30, 122, 84, 0.5) 0%, rgba(30, 122, 84, 0) 100%)'
            }}
          />
        </div>
      </div>
    </main>
  );
}