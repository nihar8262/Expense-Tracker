import type { NotificationCenterProps } from "../types";
import { AlertsSurface } from "./AlertsSurface";
import { BellIcon } from "./ui";

export function NotificationCenter({ notificationPanelRef, unreadCount, isOpen, onToggle, ...props }: NotificationCenterProps) {
  return (
    <div className="relative hidden lg:block" ref={notificationPanelRef}>
      <button
        type="button"
        className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--border)] bg-white/75 text-secondary shadow-sm backdrop-blur-sm hover:bg-white"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Notifications"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#d63b3b] ring-2 ring-white" aria-hidden="true" />
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+16px)] z-40 w-[min(92vw,760px)] rounded-[28px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(252,251,247,0.86))] p-3 shadow-[0_30px_80px_rgba(40,44,35,0.18)] backdrop-blur-2xl">
          <AlertsSurface {...props} layout="popover" />
        </div>
      ) : null}
    </div>
  );
}