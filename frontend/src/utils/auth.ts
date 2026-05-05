export function formatAuthError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Failed to sign in.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("popup_closed_by_user") || message.includes("cancelled-popup-request")) {
    return "The sign-in window was closed before authentication completed.";
  }

  if (message.includes("popup-blocked")) {
    return "The browser blocked the sign-in popup. Allow popups for localhost and try again.";
  }

  if (message.includes("unauthorized-domain")) {
    return "This domain is not authorized in Firebase Authentication. Add your current localhost or deployed URL to Firebase authorized domains.";
  }

  if (message.includes("operation-not-allowed")) {
    return "This sign-in provider is not enabled in Firebase Authentication.";
  }

  if (message.includes("redirect_uri_mismatch") || message.includes("redirect uri")) {
    return "The OAuth redirect URL is misconfigured for this provider. Check the provider callback URL in Firebase and the provider console.";
  }

  if (message.includes("access blocked") || message.includes("cookie") || message.includes("storage")) {
    return "Browser storage or cookies blocked the sign-in flow. Try again with cookie blocking disabled for localhost.";
  }

  if (message.includes("account-exists-with-different-credential")) {
    return "An account already exists with the same email address but a different sign-in method. Sign in using the original provider (e.g. Google) linked to that email, then link additional providers from your profile.";
  }

  return error.message;
}
