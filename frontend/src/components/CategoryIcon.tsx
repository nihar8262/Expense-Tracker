import type { CategoryIconId } from "../types";

export function CategoryIcon({ iconId }: { iconId: CategoryIconId }) {
  if (iconId === "groceries") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M7 4a1 1 0 0 1 1 1v1h8V5a1 1 0 1 1 2 0v1h1a1 1 0 0 1 .97 1.24l-1.8 7.2A3 3 0 0 1 15.26 17H9.18a3 3 0 0 1-2.91-2.27L4.47 7.52A1 1 0 0 1 5.44 6H6V5a1 1 0 0 1 1-1Zm.94 4 1.27 5.07a1 1 0 0 0 .97.76h5.08a1 1 0 0 0 .97-.76L17.5 8H7.94ZM9 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      </svg>
    );
  }

  if (iconId === "food") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M7 2a1 1 0 0 1 1 1v7a3 3 0 0 1-2 2.82V21a1 1 0 1 1-2 0v-8.18A3 3 0 0 1 2 10V3a1 1 0 1 1 2 0v4h1V3a1 1 0 1 1 2 0v4h1V3a1 1 0 0 1 1-1Zm10 0a1 1 0 0 1 1 1v18a1 1 0 1 1-2 0v-7h-2a1 1 0 0 1-1-1V8a6 6 0 0 1 4-5.66V2Z" />
      </svg>
    );
  }

  if (iconId === "travel") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M10 3.5a2.5 2.5 0 0 1 5 0V5h3a2 2 0 0 1 2 2v9.5a2.5 2.5 0 0 1-5 0V16H9v.5a2.5 2.5 0 0 1-5 0V7a2 2 0 0 1 2-2h4V3.5ZM8 7H6v2h2V7Zm10 0h-2v2h2V7Zm-8-3.5V5h3V3.5a1.5 1.5 0 0 0-3 0ZM6 11v5.5a.5.5 0 1 0 1 0V16h10v.5a.5.5 0 1 0 1 0V11H6Z" />
      </svg>
    );
  }

  if (iconId === "shopping") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M8 7a4 4 0 1 1 8 0h2a1 1 0 0 1 1 1.12l-1.2 11A2 2 0 0 1 15.82 21H8.18a2 2 0 0 1-1.98-1.88L5 8.12A1 1 0 0 1 6 7h2Zm2 0h4a2 2 0 1 0-4 0Zm-2.82 2 .98 9h7.68l.98-9H7.18Z" />
      </svg>
    );
  }

  if (iconId === "bills") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 3h12a1 1 0 0 1 1 1v16.5a.5.5 0 0 1-.8.4L16 19.25l-2.2 1.65a.5.5 0 0 1-.6 0L11 19.25 8.8 20.9a.5.5 0 0 1-.8-.4V4a1 1 0 0 1 1-1Zm2 4v2h8V7H8Zm0 4v2h8v-2H8Zm0 4v2h5v-2H8Z" />
      </svg>
    );
  }

  if (iconId === "health") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M11 4a1 1 0 0 1 2 0v3h3a1 1 0 1 1 0 2h-3v3a1 1 0 1 1-2 0V9H8a1 1 0 1 1 0-2h3V4Zm1 18s-7-4.35-9.54-9.1C.78 9.76 2.2 6 5.78 6c2 0 3.12 1.17 3.72 2.1.6-.93 1.72-2.1 3.72-2.1 3.58 0 5 3.76 3.32 6.9C19 17.65 12 22 12 22Z" />
      </svg>
    );
  }

  if (iconId === "entertainment") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M18 4a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H9.41l-3.7 2.78A1 1 0 0 1 4 20V6a2 2 0 0 1 2-2h12Zm-8 4v6l5-3-5-3Z" />
      </svg>
    );
  }

  if (iconId === "work") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v3h-8v2h-2v-2H3V8a2 2 0 0 1 2-2h4V4Zm2 2h2V4h-2v2Zm10 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5h8v2h2v-2h8Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a6 6 0 0 1 4.24 10.24l-6.95 6.95a1.5 1.5 0 0 1-2.12-2.12l6.95-6.95A4 4 0 1 0 8 6a1 1 0 1 1-2 0 6 6 0 0 1 6-4Zm5.66 12.24a1 1 0 0 1 0 1.42l-2 2a1 1 0 0 1-1.42-1.42l2-2a1 1 0 0 1 1.42 0Zm-8.49.34a1 1 0 0 1 0 1.42l-2.59 2.59a1 1 0 1 1-1.41-1.42l2.58-2.59a1 1 0 0 1 1.42 0Z" />
    </svg>
  );
}
