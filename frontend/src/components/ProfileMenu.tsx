import { Link } from "react-router-dom";
import { User, LogOut } from "lucide-react";
import type { ProfileMenuProps } from "../types";

export function ProfileMenu({ currentUser, isOpen, profileMenuRef, onToggle, onSignOut, photoUrl, displayName }: ProfileMenuProps) {
  const resolvedDisplayName = displayName || currentUser.displayName || currentUser.email || "Your profile";
  const avatarAlt = resolvedDisplayName;
  const avatarFallback = resolvedDisplayName.slice(0, 1).toUpperCase();
  const resolvedPhotoUrl = photoUrl || currentUser.photoURL;

  return (
    <div className="relative" ref={profileMenuRef}>
      <button
        type="button"
        className="flex min-h-12 items-center gap-3 rounded-full border border-[color:var(--border)] bg-white/80 px-2.5 py-1.5 text-left shadow-sm backdrop-blur-sm hover:bg-white hover:border-primary/30 transition duration-200 ease-out"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {resolvedPhotoUrl ? (
          <img className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/20" src={resolvedPhotoUrl} alt={avatarAlt} />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--primary),var(--gold))] text-sm font-bold text-white shadow-sm">
            {avatarFallback}
          </div>
        )}

        <div className="hidden min-w-0 xl:block">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">Signed in</p>
          <p className="truncate text-sm font-semibold text-ink">{resolvedDisplayName}</p>
        </div>

        <span className={`pr-1 text-xs text-muted transition-transform duration-200 ${isOpen ? "rotate-180 text-primary" : ""}`}>▾</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+14px)] z-40 w-[min(88vw,320px)] rounded-[24px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,251,247,0.94))] p-3.5 shadow-[0_24px_80px_rgba(40,44,35,0.22)] backdrop-blur-2xl">
          {/* User info header card */}
          <div className="rounded-[20px] border border-primary/15 bg-[linear-gradient(135deg,rgba(30,122,83,0.07),rgba(212,168,87,0.07))] p-3.5 shadow-sm">
            <div className="flex items-center gap-3">
              {resolvedPhotoUrl ? (
                <img className="h-11 w-11 rounded-full object-cover ring-2 ring-primary/30 shadow-sm" src={resolvedPhotoUrl} alt={avatarAlt} />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--primary),var(--gold))] text-base font-bold text-white shadow-sm">
                  {avatarFallback}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-bold text-ink">{resolvedDisplayName}</strong>
                <span className="block truncate text-xs text-secondary">{currentUser.email ?? currentUser.uid}</span>
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Active Account
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-3 grid gap-2">
            <Link
              to="/profile"
              className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(30,122,83,0.22)] transition duration-200 ease-out hover:bg-primary-hover active:scale-[0.98]"
              onClick={onToggle}
            >
              <User className="h-4 w-4" />
              Edit Profile
            </Link>
            <button
              type="button"
              className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[color:rgba(154,63,56,0.18)] bg-danger-tint/60 px-4 py-2.5 text-sm font-semibold text-[color:var(--danger-text)] transition duration-200 ease-out hover:bg-danger-tint hover:border-[color:rgba(154,63,56,0.3)] active:scale-[0.98]"
              onClick={() => void onSignOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}