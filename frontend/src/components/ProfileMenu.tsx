import type { ProfileMenuProps } from "../types";

export function ProfileMenu({ currentUser, isOpen, profileMenuRef, onToggle, onSignOut, onDeleteAccount, isDeletingAccount }: ProfileMenuProps) {
  const avatarAlt = currentUser.displayName ?? currentUser.email ?? "User avatar";
  const avatarFallback = (currentUser.displayName ?? currentUser.email ?? "U").slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={profileMenuRef}>
      <button
        type="button"
        className="flex min-h-12 items-center gap-3 rounded-full border border-[color:var(--border)] bg-white/75 px-2.5 py-1.5 text-left shadow-sm backdrop-blur-sm hover:bg-white"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {currentUser.photoURL ? (
          <img className="h-10 w-10 rounded-full object-cover" src={currentUser.photoURL} alt={avatarAlt} />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--primary),var(--gold))] text-sm font-bold text-white">
            {avatarFallback}
          </div>
        )}

        <div className="hidden min-w-0 xl:block">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-muted">Signed in</p>
          <p className="truncate text-sm font-semibold text-ink">{currentUser.displayName ?? currentUser.email ?? "Your profile"}</p>
        </div>

        <span className="pr-1 text-xs text-muted">▾</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+14px)] z-40 w-[min(88vw,320px)] rounded-[24px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(252,251,247,0.9))] p-3 shadow-[0_24px_80px_rgba(40,44,35,0.18)] backdrop-blur-2xl">
          <div className="rounded-[20px] border border-[color:var(--border)] bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Account</p>
            <div className="mt-2 space-y-1">
              <strong className="block text-base text-ink">{currentUser.displayName ?? "Your profile"}</strong>
              <span className="block break-all text-sm text-secondary">{currentUser.email ?? currentUser.uid}</span>
            </div>

            <div className="mt-4 grid gap-2">
              <button type="button" className="ui-button-secondary justify-center" onClick={() => void onSignOut()}>
                Sign out
              </button>
              <button type="button" className="ui-button-danger justify-center" disabled={isDeletingAccount} onClick={onDeleteAccount}>
                {isDeletingAccount ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}