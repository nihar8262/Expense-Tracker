import type { HTMLAttributes, ReactNode } from "react";

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
      {actions ? <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">{actions}</div> : null}
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
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type StatusNoticeProps = {
  tone: "success" | "error" | "warning" | "neutral";
  children: ReactNode;
  className?: string;
};

export function StatusNotice({ tone, children, className }: StatusNoticeProps) {
  return <div className={cn("status-notice", `is-${tone}`, className)}>{children}</div>;
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
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className={cn("modal-panel", className)} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}