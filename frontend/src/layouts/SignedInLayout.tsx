import type { ReactNode, RefObject } from "react";
import { NavLink } from "react-router-dom";
import type { User } from "firebase/auth";
import { ConfirmModal } from "../components/ConfirmModal";
import { ProfileMenu } from "../components/ProfileMenu";

type SignedInLayoutProps = {
  currentUser: User;
  isProfileMenuOpen: boolean;
  profileMenuRef: RefObject<HTMLDivElement | null>;
  isDeleteAccountModalOpen: boolean;
  isDeletingAccount: boolean;
  onToggleProfileMenu: () => void;
  onCloseProfileMenu: () => void;
  onSignOut: () => Promise<void>;
  onOpenDeleteAccountModal: () => void;
  onCloseDeleteAccountModal: () => void;
  onDeleteAccount: () => Promise<void>;
  children: ReactNode;
};

export function SignedInLayout({
  currentUser,
  isProfileMenuOpen,
  profileMenuRef,
  isDeleteAccountModalOpen,
  isDeletingAccount,
  onToggleProfileMenu,
  onCloseProfileMenu,
  onSignOut,
  onOpenDeleteAccountModal,
  onCloseDeleteAccountModal,
  onDeleteAccount,
  children
}: SignedInLayoutProps) {
  return (
    <main className="app-shell signed-shell">
      <section className="card shell-topbar">
        <div className="shell-brand">
          <p className="eyebrow">Personal Finance</p>
          <h1>Expense Tracker</h1>
        </div>

        <nav className="page-nav" aria-label="Signed-in pages">
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "page-nav-button is-active" : "page-nav-button")} onClick={onCloseProfileMenu}>
            Dashboard
          </NavLink>
          <NavLink to="/expenses" className={({ isActive }) => (isActive ? "page-nav-button is-active" : "page-nav-button")} onClick={onCloseProfileMenu}>
            Expenses
          </NavLink>
        </nav>

        <div className="shell-user">
          <ProfileMenu
            currentUser={currentUser}
            isOpen={isProfileMenuOpen}
            profileMenuRef={profileMenuRef}
            onToggle={onToggleProfileMenu}
            onSignOut={onSignOut}
            onDeleteAccount={onOpenDeleteAccountModal}
            isDeletingAccount={isDeletingAccount}
          />
        </div>
      </section>

      <ConfirmModal
        isOpen={isDeleteAccountModalOpen}
        title="Delete your account?"
        description="This will permanently remove your account and all stored expenses. This action cannot be undone."
        confirmLabel="Yes, delete it"
        cancelLabel="Keep account"
        isConfirming={isDeletingAccount}
        onCancel={onCloseDeleteAccountModal}
        onConfirm={() => void onDeleteAccount()}
      />

      {children}
    </main>
  );
}
