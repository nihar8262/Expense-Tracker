import { useState, useRef, useEffect } from "react";
import type { User } from "firebase/auth";
import type { ReminderPreferences } from "../types";
import { SurfaceCard, StatusNotice, PageHero } from "../components/ui";
import { listTokens, createToken, revokeToken, type Token } from "../services/api";
import { TokenRevealModal } from "../components/TokenRevealModal";
import { ConfirmModal } from "../components/ConfirmModal";

function compressImage(file: File, maxWidth = 160, maxHeight = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Compress as JPEG with 0.75 quality
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.75);
        resolve(compressedDataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

const currencies = [
  { code: "USD", name: "US Dollar (USD)", symbol: "$" },
  { code: "EUR", name: "Euro (EUR)", symbol: "€" },
  { code: "GBP", name: "British Pound (GBP)", symbol: "£" },
  { code: "INR", name: "Indian Rupee (INR)", symbol: "₹" },
  { code: "JPY", name: "Japanese Yen (JPY)", symbol: "¥" },
  { code: "CAD", name: "Canadian Dollar (CAD)", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar (AUD)", symbol: "A$" },
  { code: "CHF", name: "Swiss Franc (CHF)", symbol: "Fr" },
  { code: "CNY", name: "Chinese Yuan (CNY)", symbol: "元" },
  { code: "SGD", name: "Singapore Dollar (SGD)", symbol: "S$" },
  { code: "NZD", name: "New Zealand Dollar (NZD)", symbol: "NZ$" }
];

const timezones = [
  { value: "UTC", label: "Coordinated Universal Time (UTC)" },
  { value: "GMT", label: "Greenwich Mean Time (GMT)" },
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "Europe/London", label: "London, Dublin" },
  { value: "Europe/Paris", label: "Paris, Brussels, Madrid" },
  { value: "Europe/Berlin", label: "Berlin, Rome, Stockholm" },
  { value: "Asia/Kolkata", label: "Mumbai, Kolkata, New Delhi" },
  { value: "Asia/Tokyo", label: "Tokyo, Osaka, Seoul" },
  { value: "Asia/Shanghai", label: "Beijing, Shanghai, Hong Kong" },
  { value: "Asia/Singapore", label: "Singapore, Kuala Lumpur" },
  { value: "Australia/Sydney", label: "Sydney, Melbourne, Canberra" },
  { value: "Pacific/Auckland", label: "Auckland, Wellington" }
];

type SearchableSelectProps = {
  options: { value: string; label: string }[];
  selectedValue: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
};

function SearchableSelect({ options, selectedValue, onChange, placeholder, searchPlaceholder }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(search.toLowerCase()) ||
    option.value.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find(o => o.value === selectedValue);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        className="w-full rounded-2xl border border-[color:var(--border)] bg-white/80 px-4 py-2.5 text-left text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-sm flex justify-between items-center"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <span className="text-muted text-xs">▼</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-2 z-50 rounded-[20px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,251,247,0.95))] p-2 shadow-[0_16px_50px_rgba(40,44,35,0.15)] backdrop-blur-2xl max-h-[220px] flex flex-col">
          <input
            type="text"
            className="w-full rounded-xl border border-[color:var(--border)] bg-white/80 px-3 py-1.5 text-sm mb-2 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors hover:bg-primary/5 hover:text-primary ${
                    option.value === selectedValue ? "bg-primary/10 text-primary font-semibold" : "text-secondary"
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setSearch("");
                  }}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <p className="text-center text-xs text-muted py-4">No results found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type ProfilePageProps = {
  currentUser: User;
  reminderPreferences: ReminderPreferences | null;
  isSavingReminderPreferences: boolean;
  onReminderPreferencesChange: (
    field: "daily_logging_enabled" | "daily_logging_hour" | "budget_alerts_enabled" | "budget_alert_threshold" | "default_currency" | "default_timezone",
    value: boolean | number | string
  ) => void;
  onSaveReminderPreferences: () => void;
  onUpdateProfile: (displayName: string, photoURL: string) => Promise<void>;
  isUpdatingProfile: boolean;
  onOpenDeleteAccountModal: () => void;
  isDeletingAccount: boolean;
};

export function ProfilePage({
  currentUser,
  reminderPreferences,
  isSavingReminderPreferences,
  onReminderPreferencesChange,
  onSaveReminderPreferences,
  onUpdateProfile,
  isUpdatingProfile,
  onOpenDeleteAccountModal,
  isDeletingAccount
}: ProfilePageProps) {
  const [username, setUsername] = useState(reminderPreferences?.display_name || currentUser.displayName || "");
  const [customPhotoUrl, setCustomPhotoUrl] = useState(reminderPreferences?.photo_url || currentUser.photoURL || "");
  const [isCompressing, setIsCompressing] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<{ tone: "success" | "error" | "neutral"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);

  // For Token Reveal Modal
  const [revealModalOpen, setRevealModalOpen] = useState(false);
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [revealTokenLabel, setRevealTokenLabel] = useState("");

  const loadTokens = async () => {
    setIsLoadingTokens(true);
    setTokenError(null);
    try {
      const data = await listTokens(currentUser);
      setTokens(data);
    } catch (err: any) {
      console.error(err);
      setTokenError(err.message || "Failed to load access tokens.");
    } finally {
      setIsLoadingTokens(false);
    }
  };

  useEffect(() => {
    loadTokens();
  }, [currentUser]);

  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenLabel.trim()) return;

    setIsGenerating(true);
    setTokenError(null);
    try {
      const result = await createToken(newTokenLabel.trim(), currentUser);
      setNewTokenLabel("");
      
      // Store raw token and label for the reveal modal
      setRevealToken(result.token);
      setRevealTokenLabel(result.label);
      setRevealModalOpen(true);

      // Refresh list
      await loadTokens();
    } catch (err: any) {
      console.error(err);
      setTokenError(err.message || "Failed to generate token.");
    } finally {
      setIsGenerating(false);
    }
  };

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    confirmLabel: "",
    onConfirm: () => {}
  });

  const executeRevokeToken = async (tokenId: string) => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    setRevokingTokenId(tokenId);
    setTokenError(null);
    try {
      await revokeToken(tokenId, currentUser);
      await loadTokens();
    } catch (err: any) {
      console.error(err);
      setTokenError(err.message || "Failed to revoke token.");
    } finally {
      setRevokingTokenId(null);
    }
  };

  const executeDeleteToken = async (tokenId: string) => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    setRevokingTokenId(tokenId);
    setTokenError(null);
    try {
      await revokeToken(tokenId, currentUser, true);
      await loadTokens();
    } catch (err: any) {
      console.error(err);
      setTokenError(err.message || "Failed to delete token.");
    } finally {
      setRevokingTokenId(null);
    }
  };

  const handleRevokeToken = (tokenId: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Revoke Token",
      description: "This can't be undone — any app using this token will lose access immediately. Are you sure you want to revoke this token?",
      confirmLabel: "Revoke",
      onConfirm: () => executeRevokeToken(tokenId)
    });
  };

  const handleDeleteToken = (tokenId: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Token",
      description: "Are you sure you want to permanently delete this token from your audit trail? This action is permanent and cannot be undone.",
      confirmLabel: "Delete",
      onConfirm: () => executeDeleteToken(tokenId)
    });
  };

  // Sync state if preferences load
  useEffect(() => {
    if (reminderPreferences) {
      setUsername(reminderPreferences.display_name || currentUser.displayName || "");
      setCustomPhotoUrl(reminderPreferences.photo_url || currentUser.photoURL || "");
    }
  }, [reminderPreferences, currentUser]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    setProfileMessage(null);
    try {
      const compressedBase64 = await compressImage(file);
      setCustomPhotoUrl(compressedBase64);
    } catch (err) {
      setProfileMessage({ tone: "error", text: "Failed to compress selected image. Try another." });
    } finally {
      setIsCompressing(false);
    }
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileMessage(null);
    setUsernameError(null);

    if (!username.trim()) {
      setUsernameError("Username cannot be empty.");
      return;
    }

    try {
      await onUpdateProfile(username.trim(), customPhotoUrl);
      setProfileMessage({ tone: "success", text: "Profile details updated successfully." });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to update profile.";
      if (errMsg.toLowerCase().includes("username") || errMsg.toLowerCase().includes("taken")) {
        setUsernameError(errMsg);
      }
      setProfileMessage({ tone: "error", text: errMsg });
    }
  }

  // Extract original social login provider photo url if it exists in Firebase auth providerData list
  const providerPhotoUrl = currentUser.providerData?.find(p => p.photoURL)?.photoURL || null;

  const avatarFallback = username.slice(0, 1).toUpperCase() || "U";

  return (
    <div className="w-full space-y-4 max-w-4xl mx-auto">
      {/* Moving hazard stripe animation block style */}
      <style>{`
        @keyframes stripe-move {
          0% { background-position: 0 0; }
          100% { background-position: 40px 0; }
        }
      `}</style>

      <PageHero
        eyebrow="My Account"
        title="Your Profile & Regional Settings"
        description="Configure your display name, select default currencies, upload profile pictures, or manage security details."
      />

      {/* Main Grid: Card 1 (Personal Profile) & Card 2 (Regional Settings) */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Profile Card */}
        <SurfaceCard className="relative z-10 flex flex-col p-4 sm:p-5 space-y-4 bg-white/60">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Personal Profile</h2>
            <p className="text-xs text-secondary mt-0.5">Manage your identity details and custom photo.</p>
          </div>

          <form onSubmit={handleProfileSave} className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              {profileMessage && (
                <StatusNotice tone={profileMessage.tone}>{profileMessage.text}</StatusNotice>
              )}

              {/* Avatar Upload */}
              <div className="flex flex-col items-center gap-3 p-3 border border-[color:var(--border)] bg-white/40 rounded-2xl">
                <div className="relative h-20 w-20 rounded-full overflow-hidden border-2 border-primary/20 shadow-sm flex items-center justify-center bg-primary/5">
                  {customPhotoUrl ? (
                    <img src={customPhotoUrl} alt="Avatar Preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-primary/70">{avatarFallback}</span>
                  )}
                  {isCompressing && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-[10px] text-white font-semibold animate-pulse">Compiling...</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    className="ui-button-secondary text-xs px-2.5 py-1.5"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressing || isUpdatingProfile}
                  >
                    Upload Photo
                  </button>
                  {providerPhotoUrl && (
                    <button
                      type="button"
                      className="ui-button-secondary text-xs px-2.5 py-1.5"
                      onClick={() => {
                        setCustomPhotoUrl(providerPhotoUrl);
                        setProfileMessage({ tone: "neutral", text: "Fetched login provider photo. Click 'Update Profile' to save." });
                      }}
                      disabled={isCompressing || isUpdatingProfile}
                    >
                      Fetch Login Photo
                    </button>
                  )}
                  {customPhotoUrl && (
                    <button
                      type="button"
                      className="ui-button-secondary text-xs text-red-700 border-none px-2.5 py-1.5"
                      onClick={() => setCustomPhotoUrl("")}
                      disabled={isCompressing || isUpdatingProfile}
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted text-center leading-relaxed">
                  Upload custom images or fetch the original photo from your logged-in provider (Google, GitHub, Facebook).
                </p>
              </div>

              {/* Username Input */}
              <label className="grid gap-1.5 text-xs font-semibold text-secondary">
                Username / Display Name
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  className="px-3 py-2 text-sm rounded-xl"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setUsernameError(null);
                  }}
                  maxLength={50}
                  required
                />
                {usernameError && (
                  <span className="text-red-600 text-[11px] font-medium mt-1">{usernameError}</span>
                )}
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="ui-button-primary text-xs px-4 py-2"
                disabled={isCompressing || isUpdatingProfile}
              >
                {isUpdatingProfile ? "Saving Profile..." : "Update Profile"}
              </button>
            </div>
          </form>
        </SurfaceCard>

        {/* Currency & Timezone Settings */}
        <SurfaceCard className="relative z-20 flex flex-col justify-between p-4 sm:p-5 space-y-4 bg-white/60">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Regional Settings</h2>
            <p className="text-xs text-secondary mt-0.5">Configure your default reporting currency and local timezone.</p>
          </div>

          <div className="space-y-4 flex-1 flex flex-col justify-center">
            {reminderPreferences ? (
              <>
                <div className="grid gap-1.5 text-xs font-semibold text-secondary">
                  <span>Default Currency</span>
                  <SearchableSelect
                    options={currencies.map(c => ({ value: c.code, label: `${c.name} - ${c.symbol}` }))}
                    selectedValue={reminderPreferences.default_currency}
                    onChange={(val) => onReminderPreferencesChange("default_currency", val)}
                    placeholder="Select default currency"
                    searchPlaceholder="Search currency..."
                  />
                  <p className="text-[10px] text-muted">All charts, budgets, and expenses will format using this selected currency.</p>
                </div>

                <div className="grid gap-1.5 text-xs font-semibold text-secondary pt-1">
                  <span>Default Timezone</span>
                  <SearchableSelect
                    options={timezones}
                    selectedValue={reminderPreferences.default_timezone}
                    onChange={(val) => onReminderPreferencesChange("default_timezone", val)}
                    placeholder="Select default timezone"
                    searchPlaceholder="Search timezone..."
                  />
                  <p className="text-[10px] text-muted">Used to trigger your daily logging reminder checks at the correct hour in your local time.</p>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted animate-pulse">Loading regional configuration...</p>
            )}
          </div>

          {reminderPreferences && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                className="ui-button-primary text-xs px-4 py-2"
                onClick={onSaveReminderPreferences}
                disabled={isSavingReminderPreferences}
              >
                {isSavingReminderPreferences ? "Saving Settings..." : "Save Settings"}
              </button>
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* AI Tools Access (MCP) Section */}
      <SurfaceCard className="relative z-10 p-4 sm:p-5 space-y-4 bg-white/60">
        <div>
          <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">AI Tools Access (MCP)</h2>
          <p className="text-xs text-secondary mt-0.5">
            Generate and manage personal access tokens to connect external AI tools (like Claude Desktop, Cursor, or Claude Code) to your Expense-Tracker data.
          </p>
        </div>

        {tokenError && (
          <StatusNotice tone="error">{tokenError}</StatusNotice>
        )}

        <form onSubmit={handleGenerateToken} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <label className="flex-1 grid gap-1.5 text-xs font-semibold text-secondary">
              Token Label / Name
              <input
                type="text"
                placeholder="e.g. Claude Desktop, Work Laptop"
                className="px-3 py-2 text-sm rounded-xl"
                value={newTokenLabel}
                onChange={(e) => setNewTokenLabel(e.target.value)}
                maxLength={50}
                required
                disabled={isGenerating}
              />
            </label>
            <button
              type="submit"
              className="ui-button-primary text-xs px-4 py-2 shrink-0 h-10 w-full sm:w-auto"
              disabled={isGenerating || !newTokenLabel.trim()}
            >
              {isGenerating ? "Generating..." : "Generate Token"}
            </button>
          </div>
        </form>

        <div className="pt-2">
          <h3 className="text-xs font-bold text-secondary mb-2">Active Tokens</h3>
          {isLoadingTokens ? (
            <p className="text-xs text-muted py-2 animate-pulse">Loading tokens...</p>
          ) : tokens.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-[color:var(--border)] rounded-2xl bg-white/20">
              <p className="text-xs text-muted">No active API tokens found.</p>
              <p className="text-[10px] text-muted/80 mt-1">Generate a token above to connect external tools.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--border)] text-muted font-semibold">
                    <th className="py-2.5 pr-4">Label</th>
                    <th className="py-2.5 pr-4">Token</th>
                    <th className="py-2.5 pr-4">Created</th>
                    <th className="py-2.5 pr-4">Last Used</th>
                    <th className="py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {tokens.map((tok) => {
                    const isRevoked = tok.revoked_at !== null;
                    return (
                      <tr key={tok.id} className={isRevoked ? "text-muted/60 opacity-60" : "text-ink"}>
                        <td className="py-3 pr-4 font-semibold">{tok.label}</td>
                        <td className="py-3 pr-4 font-mono select-all">
                          {tok.token_prefix}••••••••••••{tok.token_suffix}
                        </td>
                        <td className="py-3 pr-4">
                          {new Date(tok.created_at).toLocaleDateString(undefined, {
                            dateStyle: "medium"
                          })}
                        </td>
                        <td className="py-3 pr-4">
                          {tok.last_used_at
                            ? new Date(tok.last_used_at).toLocaleDateString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short"
                              })
                            : "Never used"}
                        </td>
                        <td className="py-3 text-right">
                          {isRevoked ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-[10px] bg-muted/10 text-muted px-2 py-1 rounded-md font-medium">
                                Revoked on {new Date(tok.revoked_at!).toLocaleDateString(undefined, { dateStyle: "short" })}
                              </span>
                              <button
                                type="button"
                                className="ui-button-secondary text-[11px] text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 px-2.5 py-1"
                                onClick={() => handleDeleteToken(tok.id)}
                                disabled={revokingTokenId === tok.id}
                              >
                                {revokingTokenId === tok.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="ui-button-secondary text-[11px] text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 px-2.5 py-1"
                              onClick={() => handleRevokeToken(tok.id)}
                              disabled={revokingTokenId === tok.id}
                            >
                              {revokingTokenId === tok.id ? "Revoking..." : "Revoke"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SurfaceCard>

      {/* Danger Zone Row (Z-Index is set lower so timezone dropdown can overlay it perfectly) */}
      <div className="relative z-0">
        <SurfaceCard className="border border-red-500/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(254,242,242,0.3))] shadow-[0_12px_40px_rgba(239,68,68,0.04)] p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em] text-red-950 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-red-600 animate-pulse" />
              Danger Zone
            </h2>
            <p className="text-xs text-red-800/80 mt-0.5">Actions here are permanent and cannot be reversed.</p>
          </div>

          {/* Animated Danger Graphic */}
          <div className="flex items-center gap-4 bg-red-500/5 border border-red-500/10 rounded-2xl p-3 overflow-hidden relative">
            <div
              className="absolute top-0 left-0 right-0 h-1"
              style={{
                backgroundImage: "linear-gradient(45deg, #ef4444 25%, #1d2a22 25%, #1d2a22 50%, #ef4444 50%, #ef4444 75%, #1d2a22 75%, #1d2a22)",
                backgroundSize: "20px 20px",
                animation: "stripe-move 1.5s linear infinite"
              }}
            />

            <div className="relative flex items-center justify-center h-12 w-12 bg-red-500/10 border border-red-500/20 rounded-full shrink-0">
              <div className="absolute inset-0 bg-red-500/10 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
              <svg className="h-6 w-6 text-red-600 animate-[bounce_3s_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="space-y-0.5 min-w-0">
              <h3 className="text-xs font-bold text-red-950">Delete Account</h3>
              <p className="text-[11px] text-red-800/80 leading-relaxed">This deletes all expenses, budgets, shared wallet connections, and removes your authorization permanently.</p>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              className="ui-button-danger text-xs px-4 py-2 justify-center w-full sm:w-auto"
              disabled={isDeletingAccount}
              onClick={onOpenDeleteAccountModal}
            >
              {isDeletingAccount ? "Deleting Account..." : "Delete Account"}
            </button>
          </div>
        </SurfaceCard>
      </div>

      <TokenRevealModal
        isOpen={revealModalOpen}
        token={revealToken}
        label={revealTokenLabel}
        onClose={() => {
          setRevealModalOpen(false);
          setRevealToken(null);
          setRevealTokenLabel("");
        }}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmLabel={confirmModal.confirmLabel}
        cancelLabel="Cancel"
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
}
