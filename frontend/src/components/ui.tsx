import { useEffect, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]) {
  return values.filter(Boolean).join(" ");
}

type BellIconProps = {
  className?: string;
};

export function BellIcon({ className }: BellIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M15 18H5.5a1.5 1.5 0 0 1-1.2-2.4L6 13.25V9a6 6 0 1 1 12 0v4.25l1.7 2.35A1.5 1.5 0 0 1 18.5 18H15" />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>;

export function SurfaceCard({ children, className, ...props }: SurfaceCardProps) {
  return (
    <section className={cn("surface-card", className)} {...props}>
      {children}
    </section>
  );
}

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHero({ eyebrow, title, description, actions, className }: PageHeroProps) {
  return (
    <section className={cn("page-hero-panel", className)}>
      <div className="max-w-3xl space-y-4">
        <p className="section-eyebrow">{eyebrow}</p>
        <h1 className="font-display text-[2.8rem] leading-[0.95] tracking-[-0.04em] text-ink sm:text-[3.4rem] lg:text-[4.4rem]">
          {title}
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">{description}</p>
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-3 sm:flex-row sm:items-center">
          {actions}
        </div>
      ) : null}
    </section>
  );
}

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function SectionHeader({ eyebrow, title, description, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="space-y-2">
        {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">{title}</h2>
          {description ? <p className="max-w-2xl text-sm leading-6 text-muted sm:text-[15px]">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

type StatusNoticeProps = {
  tone: "success" | "error" | "warning" | "neutral";
  children: ReactNode;
  className?: string;
};

export function StatusNotice({ tone, children, className }: StatusNoticeProps) {
  return (
    <div className={cn("status-notice flex items-start gap-2.5", `is-${tone}`, className)}>
      {tone === "success" && (
        <span className="mt-0.5 shrink-0 text-current opacity-90">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
      )}
      {tone === "error" && (
        <span className="mt-0.5 shrink-0 text-current opacity-90">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
      )}
      {tone === "warning" && (
        <span className="mt-0.5 shrink-0 text-current opacity-90">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </span>
      )}
      <div className="flex-1 leading-normal">{children}</div>
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("empty-state-shell", className)}>
      <div className="empty-state-illustration" aria-hidden="true">
        <span className="h-3 w-3 rounded-full bg-primary/30" />
        <span className="h-4 w-4 rounded-full bg-gold/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/20" />
      </div>
      <div className="space-y-2 text-center">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="max-w-md text-sm leading-6 text-muted">{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

type ModalFrameProps = {
  children: ReactNode;
  onClose: () => void;
  className?: string;
};

export function ModalFrame({ children, onClose, className }: ModalFrameProps) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className={cn("modal-panel", className)} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}

type ItemActionButtonsProps = {
  onEdit: (event: import("react").MouseEvent<HTMLButtonElement>) => void;
  onDelete: (event: import("react").MouseEvent<HTMLButtonElement>) => void;
  isDeleting?: boolean;
  description?: string;
  className?: string;
};

export function ItemActionButtons({
  onEdit,
  onDelete,
  isDeleting = false,
  description,
  className,
}: ItemActionButtonsProps) {
  return (
    <div className={cn("flex items-center gap-1.5 shrink-0 flex-nowrap", className)}>
      <button
        type="button"
        title="Edit"
        aria-label={description ? `Edit ${description}` : "Edit"}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border)] bg-white/90 text-secondary hover:bg-white hover:text-ink hover:border-zinc-400 transition-all shadow-xs cursor-pointer active:scale-95"
        onClick={onEdit}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
        </svg>
      </button>
      <button
        type="button"
        title="Delete"
        aria-label={description ? `Delete ${description}` : "Delete"}
        disabled={isDeleting}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-danger-tint text-[color:var(--danger-text)] hover:bg-[#f3d4d1] disabled:opacity-50 transition-all shadow-xs cursor-pointer active:scale-95"
        onClick={onDelete}
      >
        {isDeleting ? (
          <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        )}
      </button>
    </div>
  );
}