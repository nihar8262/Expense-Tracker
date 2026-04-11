import type { ProfileMenuProps } from "../types";

export function ProfileMenu({ currentUser, isOpen, profileMenuRef, onToggle, onSignOut, onDeleteAccount, isDeletingAccount }: ProfileMenuProps) {
  const avatarAlt = currentUser.displayName ?? currentUser.email ?? "User avatar";
  const avatarFallback = (currentUser.displayName ?? currentUser.email ?? "U").slice(0, 1).toUpperCase();

  return (
    <div className="profile-menu" ref={profileMenuRef}>
      <button type="button" className={isOpen ? "profile-trigger is-open" : "profile-trigger"} onClick={onToggle} aria-haspopup="menu" aria-expanded={isOpen}>
        {currentUser.photoURL ? <img className="avatar avatar-large" src={currentUser.photoURL} alt={avatarAlt} /> : <div className="avatar avatar-large avatar-fallback">{avatarFallback}</div>}

        <div className="profile-copy shell-meta">
          <p className="eyebrow">Signed in</p>
          <h2>{currentUser.displayName ?? "Your profile"}</h2>
        </div>

        <span className="profile-trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen ? (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-header">
            <strong>{currentUser.displayName ?? "Your profile"}</strong>
            <span>{currentUser.email ?? currentUser.uid}</span>
          </div>

          <div className="profile-dropdown-actions">
            <button type="button" className="secondary-button shell-action-button signout-button" onClick={() => void onSignOut()}>
              Sign out
            </button>
            <button type="button" className="secondary-button shell-action-button destructive-shell-button" disabled={isDeletingAccount} onClick={onDeleteAccount}>
              Delete account
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
