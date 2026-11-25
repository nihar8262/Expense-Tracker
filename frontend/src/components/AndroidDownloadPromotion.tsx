import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ArrowRight, Download, Smartphone, X } from "lucide-react";
import { isAndroidApp } from "../utils/platform";

const APP_VERSION = (import.meta.env.VITE_ANDROID_APP_VERSION as string | undefined)?.trim() || "1.1";
const RELEASE_KEY = `expense-tracker.android-release.${APP_VERSION}`;

type AndroidDownloadPromotionProps = {
  isAuthenticated: boolean;
};

export function AndroidDownloadPromotion({ isAuthenticated }: AndroidDownloadPromotionProps) {
  const { pathname } = useLocation();
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);

  useEffect(() => {
    // A dismissal lasts only for the current authenticated session. Logging in
    // again deliberately restores the banner while the release is promoted.
    setIsBannerVisible(!isAndroidApp && isAuthenticated);
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAndroidApp || window.localStorage.getItem(`${RELEASE_KEY}.announcement-seen`) === "true") return;
    const timer = window.setTimeout(() => setIsModalVisible(true), 550);
    return () => window.clearTimeout(timer);
  }, []);

  if (isAndroidApp) return null;

  const destination = isAuthenticated ? "/profile#android-app" : "/signin";
  const isAuthPage = pathname === "/signin" || pathname === "/signup";

  function markAnnouncementSeen() {
    window.localStorage.setItem(`${RELEASE_KEY}.announcement-seen`, "true");
    setIsModalVisible(false);
  }

  function dismissBanner() {
    setIsBannerVisible(false);
  }

  return (
    <>
      {isBannerVisible && isAuthenticated && !isAuthPage ? (
        <section className="relative z-[60] mx-3 mt-3 overflow-hidden rounded-[18px] border border-emerald-800/15 bg-[linear-gradient(115deg,#123f2c,#1d7450)] px-3 py-3 text-white shadow-[0_12px_35px_rgba(15,83,57,0.24)] sm:mx-auto sm:max-w-[1180px] sm:rounded-[20px] sm:px-5">
          <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full border border-white/10 bg-white/5" />
          <div className="relative flex items-start gap-2.5 pr-7 sm:items-center sm:gap-3 sm:pr-8">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 sm:h-11 sm:w-11">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100 sm:text-[11px] sm:tracking-[0.12em]">Android v{APP_VERSION} available</p>
              <p className="mt-0.5 text-[11px] leading-4 text-white/85 sm:text-sm sm:leading-5">Faster access, offline storage, manual sync, and debit notification detection.</p>
            </div>
            <NavLink
              to={destination}
              className="hidden shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50 sm:inline-flex"
            >
              {isAuthenticated ? "Get the app" : "Sign in to download"} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </NavLink>
            <button type="button" onClick={dismissBanner} className="absolute -right-1 -top-1 min-h-8 min-w-8 rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Dismiss Android app banner">
              <X className="h-4 w-4" />
            </button>
          </div>
          <NavLink to={destination} className="relative ml-11 mt-1.5 inline-flex min-h-8 items-center gap-1.5 text-xs font-bold text-white sm:hidden">
            {isAuthenticated ? "View download" : "Sign in to download"} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </NavLink>
        </section>
      ) : null}

      {isModalVisible ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="android-release-title" onMouseDown={(event) => event.target === event.currentTarget && markAnnouncementSeen()}>
          <section className="modal-panel max-h-[92dvh] sm:max-w-[650px]">
            <div className="relative overflow-hidden bg-[linear-gradient(145deg,#eef7ef,#fffaf0)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 sm:px-8 sm:pb-8 sm:pt-8">
              <button type="button" onClick={markAnnouncementSeen} className="absolute right-4 top-4 z-10 rounded-full border border-slate-200/80 bg-white/80 p-2 text-slate-500 shadow-sm transition hover:text-slate-900" aria-label="Close Android app announcement">
                <X className="h-4 w-4" />
              </button>
              <div className="grid items-center gap-3 sm:grid-cols-[150px_1fr] sm:gap-7">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[24px] border border-white bg-white/70 p-3 shadow-[0_18px_45px_rgba(28,87,58,0.16)] min-[390px]:h-28 min-[390px]:w-28 sm:h-36 sm:w-36 sm:rounded-[30px] sm:p-4">
                  <img src="/Glossy-logo.png" alt="Expense Tracker Android app" className="h-full w-full object-contain" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="section-eyebrow text-primary">Android v{APP_VERSION} · A faster way to track</p>
                  <h2 id="android-release-title" className="mt-1.5 font-display text-2xl font-bold leading-[1.05] tracking-[-0.035em] text-ink min-[390px]:text-3xl sm:mt-2 sm:text-4xl">Expense Tracker is now on Android</h2>
                  <p className="mt-2 text-xs leading-5 text-secondary min-[390px]:text-sm min-[390px]:leading-6 sm:mt-3">Keep your day-to-day finance data on your device, detect debit alerts, and decide exactly when to sync.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] font-semibold text-emerald-900 sm:justify-start">
                    <span className="rounded-full bg-emerald-100/80 px-3 py-1.5">Local-first</span>
                    <span className="rounded-full bg-emerald-100/80 px-3 py-1.5">Manual sync</span>
                    <span className="rounded-full bg-emerald-100/80 px-3 py-1.5">Smart alerts</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:mt-6 sm:flex-row sm:justify-end">
                <button type="button" onClick={markAnnouncementSeen} className="ui-button-secondary justify-center">Maybe later</button>
                <NavLink to={destination} onClick={markAnnouncementSeen} className="ui-button-primary justify-center gap-2">
                  <Download className="h-4 w-4" aria-hidden="true" /> {isAuthenticated ? "View Android download" : "Sign in to download"}
                </NavLink>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
