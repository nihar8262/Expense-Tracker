import { useEffect, useState } from "react";
import type { AuthProvider, User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, authPersistenceReady, facebookProvider, githubProvider, googleProvider, isFirebaseConfigured } from "../auth";
import type { ProviderOption } from "../types";
import { formatAuthError } from "../utils/auth";

export const providerOptions: ProviderOption[] = [
  {
    id: "google",
    label: "Continue with Google",
    blurb: "Fast sign-in with your Google account.",
    provider: googleProvider
  },
  {
    id: "github",
    label: "Continue with GitHub",
    blurb: "Great if you already live in developer tools.",
    provider: githubProvider
  },
  {
    id: "facebook",
    label: "Continue with Facebook",
    blurb: "Useful for a lighter consumer-style onboarding.",
    provider: facebookProvider
  }
];

export function useAuth() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (!isFirebaseConfigured || !auth) {
      setAuthLoading(false);
      setAuthMessage("Firebase is not configured. Add the Vite Firebase environment variables to enable sign-in.");
      return undefined;
    }

    void authPersistenceReady.finally(() => {
      if (!isMounted || !auth) {
        return;
      }

      return onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        setAuthLoading(false);
        if (user) {
          setAuthMessage("");
        }
      });
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function signIn(provider: AuthProvider) {
    if (!auth) {
      setAuthMessage("Firebase is not configured. Add the Vite Firebase environment variables to enable sign-in.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      await authPersistenceReady;
      await signInWithPopup(auth, provider);
    } catch (error) {
      setAuthMessage(formatAuthError(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOutCurrentUser() {
    if (auth) {
      await signOut(auth);
    }
    setCurrentUser(null);
  }

  return {
    authLoading,
    currentUser,
    authMessage,
    setAuthMessage,
    setCurrentUser,
    signIn,
    signOutCurrentUser
  };
}
