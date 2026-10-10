import { useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./ui";

export type FilterOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  badge?: string;
};

type FilterDropdownProps = {
  label?: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  align?: "left" | "right";
  variant?: "filter" | "form";
  required?: boolean;
  error?: string | boolean;
};

export function FilterDropdown({
  label,
  options,
  value,
  onChange,
  placeholder = "Select option",
  searchable,
  searchPlaceholder = "Search...",
  className,
  buttonClassName,
  disabled = false,
  align = "left",
  variant = "filter",
  required = false,
  error,
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ left: 0, width: 0, maxHeight: 240 });

  const selectedOption = options.find((opt) => opt.value === value);

  // Auto-enable search if there are more than 6 options unless explicitly passed
  const isSearchable = searchable ?? options.length > 7;

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Show above if space below is too tight (< 180px) AND space above is greater
    const showAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const availableHeight = showAbove ? Math.max(120, spaceAbove - 16) : Math.max(120, spaceBelow - 16);
    const maxHeight = Math.min(260, availableHeight);

    const width = Math.max(rect.width, 180);
    let left = align === "right" ? rect.right - width : rect.left;
    if (left + width > window.innerWidth - 8) {
      left = window.innerWidth - width - 8;
    }
    if (left < 8) {
      left = 8;
    }

    setCoords({
      top: showAbove ? undefined : Math.round(rect.bottom + 6),
      bottom: showAbove ? Math.round(window.innerHeight - rect.top + 6) : undefined,
      left: Math.round(left),
      width: Math.round(width),
      maxHeight: Math.round(maxHeight)
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleResize = () => updatePosition();
    const handleScroll = () => updatePosition();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    if (isSearchable) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSearchable, align]);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.trim().toLowerCase())
  );

  const isDefaultSelected = value === "" || value === "all" || value === "none";
  const hasError = Boolean(error);

  const toggleDropdown = () => {
    if (!isOpen) {
      updatePosition();
      setSearch("");
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left w-full", className)}>
      {label ? (
        <span
          className={cn(
            "block font-medium mb-1.5",
            variant === "form" ? "text-sm text-secondary" : "text-xs font-semibold text-secondary",
            required && "required-mark"
          )}
        >
          {label}
        </span>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggleDropdown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-invalid={hasError}
        className={cn(
          variant === "form"
            ? "inline-flex items-center justify-between gap-3 w-full rounded-2xl border border-[color:var(--border)] bg-white/80 px-4 py-2.5 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-sm hover:border-primary/40 focus:outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            : "inline-flex items-center justify-between gap-2.5 w-full rounded-xl border border-[color:var(--border)] bg-white/90 dark:bg-zinc-800/90 px-3.5 py-2 text-xs font-medium text-ink shadow-2xs hover:bg-zinc-50 dark:hover:bg-zinc-700/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
          variant === "filter" && !isDefaultSelected && "border-primary/40 bg-primary/5 text-primary font-semibold",
          hasError && "border-[color:var(--danger-text)] focus:ring-red-400/20",
          buttonClassName
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon ? (
            <span className="shrink-0">{selectedOption.icon}</span>
          ) : null}
          <span className={cn("truncate", !selectedOption && "text-muted")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>

        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform duration-200",
            isOpen && "rotate-180 text-ink"
          )}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {hasError && typeof error === "string" ? (
        <span className="mt-1 block text-sm text-[color:var(--danger-text)]">{error}</span>
      ) : null}

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 99999,
            }}
            className="rounded-xl border border-[color:var(--border)] bg-white dark:bg-zinc-900 p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95"
            role="listbox"
          >
            {isSearchable && (
              <div className="p-1.5 border-b border-[color:var(--border)] mb-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg border border-[color:var(--border)] bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            )}

            <div
              style={{ maxHeight: `${coords.maxHeight}px` }}
              className="overflow-y-auto space-y-0.5 custom-scrollbar"
            >
              {filteredOptions.length === 0 ? (
                <div className="py-3 px-2 text-center text-xs text-muted">
                  No matching options
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                        setSearch("");
                      }}
                      className={cn(
                        "flex items-center justify-between gap-2.5 w-full rounded-lg px-2.5 py-2 text-xs text-left transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary/10 font-semibold text-primary"
                          : "text-secondary hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-ink"
                      )}
                    >
                      <span className="flex items-center gap-2 truncate">
                        {opt.icon ? (
                          <span className="shrink-0">{opt.icon}</span>
                        ) : null}
                        <span className="truncate">{opt.label}</span>
                        {opt.badge ? (
                          <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-muted">
                            {opt.badge}
                          </span>
                        ) : null}
                      </span>

                      {isSelected ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-4 w-4 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
