import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { ArrowRight, Download, Smartphone, X } from "lucide-react";
import { isAndroidApp } from "../utils/platform";

const APP_VERSION = (import.meta.env.VITE_ANDROID_APP_VERSION as string | undefined)?.trim() || "1.0";
const RELEASE_KEY = `expense-tracker.android-release.${APP_VERSION}`;

export function AndroidDownloadPromotion() {
  const [isBannerVisible, setIsBannerVisible] = useState(() => {
    if (isAndroidApp || typeof window === "undefined") return false;
    return window.localStorage.getItem(`${RELEASE_KEY}.banner-dismissed`) !== "true";
  });
  const [isModalVisible, setIsModalVisible] = useState(false);

  useEffect(() => {
    if (isAndroidApp || window.localStorage.getItem(`${RELEASE_KEY}.announcement-seen`) === "true") return;
    const timer = window.setTimeout(() => setIsModalVisible(true), 550);
    return () => window.clearTimeout(timer);
  }, []);

  if (isAndroidApp) return null;

  function markAnnouncementSeen() {
    window.localStorage.setItem(`${RELEASE_KEY}.announcement-seen`, "true");
    setIsModalVisible(false);
  }

  function dismissBanner() {
    window.localStorage.setItem(`${RELEASE_KEY}.banner-dismissed`, "true");
    setIsBannerVisible(false);
  }

  return (
    <>
      {isBannerVisible ? (
        <section className="relative mb-3 overflow-hidden rounded-[20px] border border-emerald-800/15 bg-[linear-gradient(115deg,#123f2c,#1d7450)] px-3.5 py-3 text-white shadow-[0_12px_35px_rgba(15,83,57,0.2)] sm:mb-4 sm:px-5">
          <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full border border-white/10 bg-white/5" />
          <div className="relative flex items-center gap-3 pr-7 sm:pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 sm:h-11 sm:w-11">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100">Now available for Android</p>
              <p className="mt-0.5 text-xs leading-5 text-white/85 sm:text-sm">Faster access, offline storage, manual sync, and debit notification detection.</p>
            </div>
            <NavLink
              to="/profile#android-app"
              className="hidden shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50 sm:inline-flex"
            >
              Get the app <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </NavLink>
            <button type="button" onClick={dismissBanner} className="absolute -right-1 -top-1 rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Dismiss Android app banner">
              <X className="h-4 w-4" />
            </button>
          </div>
          <NavLink to="/profile#android-app" className="relative mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-white sm:hidden">
            View download <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </NavLink>
        </section>
      ) : null}

      {isModalVisible ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="android-release-title" onMouseDown={(event) => event.target === event.currentTarget && markAnnouncementSeen()}>
          <section className="modal-panel sm:max-w-[650px]">
            <div className="relative overflow-hidden bg-[linear-gradient(145deg,#eef7ef,#fffaf0)] px-5 pb-5 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
              <button type="button" onClick={markAnnouncementSeen} className="absolute right-4 top-4 z-10 rounded-full border border-slate-200/80 bg-white/80 p-2 text-slate-500 shadow-sm transition hover:text-slate-900" aria-label="Close Android app announcement">
                <X className="h-4 w-4" />
              </button>
              <div className="grid items-center gap-5 sm:grid-cols-[150px_1fr] sm:gap-7">
                <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-[30px] border border-white bg-white/70 p-4 shadow-[0_18px_45px_rgba(28,87,58,0.16)] sm:h-36 sm:w-36">
                  <img src="/Glossy-logo.png" alt="Expense Tracker Android app" className="h-full w-full object-contain" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="section-eyebrow text-primary">A faster way to track</p>
                  <h2 id="android-release-title" className="mt-2 font-display text-3xl font-bold leading-none tracking-[-0.035em] text-ink sm:text-4xl">Expense Tracker is now on Android</h2>
                  <p className="mt-3 text-sm leading-6 text-secondary">Keep your day-to-day finance data on your device, detect debit alerts, and decide exactly when to sync.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] font-semibold text-emerald-900 sm:justify-start">
                    <span className="rounded-full bg-emerald-100/80 px-3 py-1.5">Local-first</span>
                    <span className="rounded-full bg-emerald-100/80 px-3 py-1.5">Manual sync</span>
                    <span className="rounded-full bg-emerald-100/80 px-3 py-1.5">Smart alerts</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={markAnnouncementSeen} className="ui-button-secondary justify-center">Maybe later</button>
                <NavLink to="/profile#android-app" onClick={markAnnouncementSeen} className="ui-button-primary justify-center gap-2">
                  <Download className="h-4 w-4" aria-hidden="true" /> View Android download
                </NavLink>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
