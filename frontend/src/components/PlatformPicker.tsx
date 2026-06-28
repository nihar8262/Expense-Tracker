import React, { useState, useEffect, useRef } from "react";
import { PLATFORMS } from "../lib/platforms";

// Simple class merger
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

// Reusable logo component with image load failure fallback
export function PlatformLogo({
  logo,
  name,
  className = "w-7 h-7",
}: {
  logo?: string | null;
  name?: string | null;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  // Reset error state when logo changes
  useEffect(() => {
    setHasError(false);
  }, [logo]);

  if (hasError || !logo || !name) {
    return (
      <span
        className={cn(
          "rounded-full bg-zinc-400 dark:bg-zinc-600 flex items-center justify-center text-white font-semibold uppercase select-none text-[11px] leading-none shrink-0",
          className
        )}
      >
        {name ? name[0] : "?"}
      </span>
    );
  }

  return (
    <img
      src={logo}
      alt={name}
      onError={() => setHasError(true)}
      className={cn("rounded-full object-cover shrink-0", className)}
    />
  );
}

interface PlatformPickerProps {
  value: string | null;
  onChange?: ((id: string | null) => void) | null;
  disabled?: boolean;
  className?: string;
}

export function PlatformPicker({
  value,
  onChange,
  disabled = false,
  className,
}: PlatformPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const isInteractive = Boolean(onChange) && !disabled;

  // Find selected platform details
  const selectedPlatform = PLATFORMS.find((p) => p.id === value);

  // Animate on open
  useEffect(() => {
    if (isOpen) {
      const raf = requestAnimationFrame(() => {
        setAnimate(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setAnimate(false);
    }
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus trap / keyboard handler for Dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Tab") {
        const active = document.activeElement;
        const validOptions = optionRefs.current.filter(Boolean) as HTMLButtonElement[];
        if (validOptions.length === 0) return;

        const first = validOptions[0];
        const last = validOptions[validOptions.length - 1];

        if (e.shiftKey) {
          if (active === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (active === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Arrow key grid navigation
  const handleOptionKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const totalOptions = PLATFORMS.length + 1; // +1 for "None"
    const isMobile = window.innerWidth < 640;
    const cols = isMobile ? 3 : 5;
    let nextIndex = index;

    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % totalOptions;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + totalOptions) % totalOptions;
    } else if (e.key === "ArrowDown") {
      nextIndex = (index + cols) % totalOptions;
    } else if (e.key === "ArrowUp") {
      nextIndex = (index - cols + totalOptions) % totalOptions;
    } else if (e.key === "Escape") {
      setIsOpen(false);
      triggerRef.current?.focus();
      e.preventDefault();
      return;
    } else {
      return;
    }

    e.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  // Close and set value
  const handleSelect = (platformId: string | null) => {
    if (onChange) {
      onChange(platformId);
    }
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Read-only / Not interactive Mode:
  if (!isInteractive) {
    if (!value || !selectedPlatform) return null;
    return (
      <PlatformLogo
        logo={selectedPlatform.logo}
        name={selectedPlatform.name}
        className={cn("w-7 h-7", className)}
      />
    );
  }

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={selectedPlatform ? `Source: ${selectedPlatform.name}` : "Select Source"}
        className={cn(
          "flex items-center justify-center rounded-full transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
          selectedPlatform
            ? "w-8 h-8"
            : "w-8 h-8 border border-dashed border-zinc-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-800/70 hover:border-primary/60 hover:text-primary"
        )}
      >
        {selectedPlatform ? (
          <PlatformLogo
            logo={selectedPlatform.logo}
            name={selectedPlatform.name}
            className="w-8 h-8"
          />
        ) : (
          <svg
            className="w-4 h-4 text-zinc-400 dark:text-zinc-500 hover:text-primary transition-colors"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        )}
      </button>

      {/* Mobile Bottom Sheet */}
      {isOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <div
            className={cn(
              "fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out",
              animate ? "opacity-100" : "opacity-0"
            )}
            onClick={() => setIsOpen(false)}
          />

          {/* Bottom Sheet Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Select source platform"
            className={cn(
              "relative w-full max-h-[80vh] overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-white/20 bg-white dark:bg-zinc-900 p-6 shadow-2xl transition-transform duration-300 ease-out",
              animate ? "translate-y-0" : "translate-y-full"
            )}
          >
            {/* Drag Bar */}
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-4 text-center">
              Select Source Platform
            </h3>

            {/* Grid options */}
            <div className="grid grid-cols-3 gap-y-5 gap-x-3 justify-items-center">
              {/* None cell */}
              <button
                ref={(el) => {
                  optionRefs.current[0] = el;
                }}
                type="button"
                onClick={() => handleSelect(null)}
                onKeyDown={(e) => handleOptionKeyDown(e, 0)}
                aria-pressed={value === null}
                className="flex flex-col items-center gap-1.5 focus-visible:outline-none"
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 transition-all",
                    value === null ? "ring-2 ring-primary border-primary" : "hover:border-zinc-300 dark:hover:border-zinc-600"
                  )}
                >
                  <svg
                    className="w-5 h-5 text-zinc-500 dark:text-zinc-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">None</span>
              </button>

              {/* Platform cells */}
              {PLATFORMS.map((platform, idx) => {
                const isSelected = value === platform.id;
                return (
                  <button
                    key={platform.id}
                    ref={(el) => {
                      optionRefs.current[idx + 1] = el;
                    }}
                    type="button"
                    onClick={() => handleSelect(platform.id)}
                    onKeyDown={(e) => handleOptionKeyDown(e, idx + 1)}
                    aria-pressed={isSelected}
                    className="flex flex-col items-center gap-1.5 focus-visible:outline-none"
                  >
                    <PlatformLogo
                      logo={platform.logo}
                      name={platform.name}
                      className={cn(
                        "w-12 h-12 border border-zinc-200 dark:border-zinc-700 transition-all",
                        isSelected ? "ring-2 ring-primary border-primary" : "hover:border-zinc-300 dark:hover:border-zinc-600"
                      )}
                    />
                    <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 text-center truncate max-w-[80px]">
                      {platform.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Desktop Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select source platform"
          className={cn(
            "hidden sm:block absolute top-full left-0 mt-2 w-72 rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xl z-50 transition-all duration-150 ease-out origin-top-left",
            animate ? "opacity-100 scale-100" : "opacity-0 scale-95"
          )}
        >
          <div className="grid grid-cols-4 gap-y-4 gap-x-2 justify-items-center">
            {/* None cell */}
            <button
              ref={(el) => {
                optionRefs.current[0] = el;
              }}
              type="button"
              onClick={() => handleSelect(null)}
              onKeyDown={(e) => handleOptionKeyDown(e, 0)}
              aria-pressed={value === null}
              className="flex flex-col items-center gap-1.5 focus-visible:outline-none group"
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 transition-all",
                  value === null ? "ring-2 ring-primary border-primary" : "group-hover:border-zinc-300 dark:group-hover:border-zinc-600"
                )}
              >
                <svg
                  className="w-4 h-4 text-zinc-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">None</span>
            </button>

            {/* Platform cells */}
            {PLATFORMS.map((platform, idx) => {
              const isSelected = value === platform.id;
              return (
                <button
                  key={platform.id}
                  ref={(el) => {
                    optionRefs.current[idx + 1] = el;
                  }}
                  type="button"
                  onClick={() => handleSelect(platform.id)}
                  onKeyDown={(e) => handleOptionKeyDown(e, idx + 1)}
                  aria-pressed={isSelected}
                  className="flex flex-col items-center gap-1.5 focus-visible:outline-none group"
                >
                  <PlatformLogo
                    logo={platform.logo}
                    name={platform.name}
                    className={cn(
                      "w-10 h-10 border border-zinc-200 dark:border-zinc-700 transition-all",
                      isSelected ? "ring-2 ring-primary border-primary" : "group-hover:border-zinc-300 dark:group-hover:border-zinc-600"
                    )}
                  />
                  <span className="text-[10px] font-medium text-zinc-700 dark:text-zinc-300 text-center truncate max-w-[64px]">
                    {platform.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
