import { useState, useEffect } from "react";
import type { User } from "firebase/auth";
import type { FeedbackCategory, FeedbackRecord } from "../types";
import { submitFeedback, updateFeedback } from "../services/api";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  userName?: string;
  initialFeedback?: FeedbackRecord | null;
  onFeedbackSaved?: (feedback: FeedbackRecord) => void;
  todayCount?: number;
}

export function FeedbackModal({
  isOpen,
  onClose,
  currentUser,
  userName,
  initialFeedback,
  onFeedbackSaved,
  todayCount = 0
}: FeedbackModalProps) {
  const [category, setCategory] = useState<FeedbackCategory>("feature");
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(initialFeedback);
  const senderName = userName?.trim() || currentUser.displayName || currentUser.email?.split("@")[0] || "User";

  useEffect(() => {
    if (initialFeedback) {
      setCategory(initialFeedback.category);
      setRating(initialFeedback.rating ?? 5);
      setMessage(initialFeedback.message);
    } else {
      setCategory("feature");
      setRating(5);
      setMessage("");
    }
    setError(null);
  }, [initialFeedback, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please write your suggestion or feedback before submitting.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (isEditing && initialFeedback) {
        const updated = await updateFeedback(
          initialFeedback.id,
          {
            category,
            rating,
            message: message.trim(),
            userName: senderName
          },
          currentUser
        );
        onFeedbackSaved?.(updated);
      } else {
        const result = await submitFeedback(
          {
            category,
            rating,
            message: message.trim(),
            userName: senderName
          },
          currentUser
        );
        onFeedbackSaved?.(result.feedback);
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setMessage("");
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || "Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Minimal Header */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/20">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {isEditing ? "Edit Feedback" : "Feedback & Suggestions"}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isEditing
                ? "Update your thoughts within the 24-hour edit window"
                : "Share feature requests, bug reports, or ideas directly with the team"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {isSuccess ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl font-bold">
              ✓
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {isEditing ? "Feedback Updated Successfully" : "Thank You for Your Feedback!"}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
              {isEditing
                ? "Your modifications have been saved and dispatched."
                : "Your message has been dispatched to our inbox via Resend. We review all feedback regularly."}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-xl">
                {error}
              </div>
            )}

            {/* Sender Identity Preview */}
            <div className="px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-zinc-400">Submitting as:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                  {senderName}
                </span>
                {currentUser.email && (
                  <span className="text-zinc-400 truncate hidden sm:inline">
                    ({currentUser.email})
                  </span>
                )}
              </div>
              {!isEditing && (
                <span className="text-[11px] font-medium text-zinc-500 shrink-0">
                  {todayCount}/5 today
                </span>
              )}
            </div>

            {/* Minimal Category Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: "feature", label: "Feature Idea" },
                    { id: "bug", label: "Bug Report" },
                    { id: "feedback", label: "General" }
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium text-center transition-all ${
                      category === item.id
                        ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent shadow-xs"
                        : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Rating
                </label>
                <span className="text-xs font-medium text-amber-500 font-semibold">
                  {(hoverRating ?? rating) === 5
                    ? "5 ★ Excellent"
                    : (hoverRating ?? rating) === 4
                    ? "4 ★ Great"
                    : (hoverRating ?? rating) === 3
                    ? "3 ★ Good"
                    : (hoverRating ?? rating) === 2
                    ? "2 ★ Fair"
                    : "1 ★ Needs Improvement"}
                </span>
              </div>
              <div
                className="flex items-center gap-1.5 py-1"
                onMouseLeave={() => setHoverRating(null)}
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const isFilled = star <= (hoverRating ?? rating);
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      className="p-1 rounded-lg transition-transform hover:scale-115 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                      aria-label={`${star} star`}
                    >
                      <svg
                        className={`w-7 h-7 transition-colors ${
                          isFilled
                            ? "text-amber-400 fill-amber-400 drop-shadow-xs"
                            : "text-zinc-300 dark:text-zinc-600 fill-transparent hover:text-amber-200"
                        }`}
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                        />
                      </svg>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Message
              </label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your suggestion, the bug you encountered, or ideas for improvement..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 resize-none"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !message.trim() || (!isEditing && todayCount >= 5)}
                className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 disabled:opacity-50 rounded-xl shadow-xs transition-all"
              >
                {isSubmitting
                  ? "Saving..."
                  : isEditing
                  ? "Update Feedback"
                  : "Submit Feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
