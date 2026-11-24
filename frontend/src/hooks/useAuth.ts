import { useEffect, useState } from "react";
import type { AuthProvider, User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  GithubAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { auth, authPersistenceReady, facebookProvider, githubProvider, googleProvider, isFirebaseConfigured } from "../auth";
import type { ProviderOption } from "../types";
import { formatAuthError } from "../utils/auth";
import { isAndroidApp } from "../utils/platform";

const webProviderOptions: ProviderOption[] = [
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

// Keep the same provider choices in the browser and Android app. Android uses
// the native Firebase plugin because browser popups cannot reliably return to
// a Capacitor WebView.
export const providerOptions: ProviderOption[] = webProviderOptions;

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
      if (isAndroidApp) {
        if (provider.providerId === "google.com") {
          const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
          const idToken = result.credential?.idToken;
          if (!idToken) {
            throw new Error("Google did not return an identity token. Check the Firebase Android configuration.");
          }
          await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
        } else if (provider.providerId === "github.com") {
          const result = await FirebaseAuthentication.signInWithGithub({ skipNativeAuth: true });
          const accessToken = result.credential?.accessToken;
          if (!accessToken) {
            throw new Error("GitHub did not return an access token. Check the GitHub provider configuration in Firebase.");
          }
          await signInWithCredential(auth, GithubAuthProvider.credential(accessToken));
        } else if (provider.providerId === "facebook.com") {
          const result = await FirebaseAuthentication.signInWithFacebook({ skipNativeAuth: true });
          const accessToken = result.credential?.accessToken;
          if (!accessToken) {
            throw new Error("Facebook did not return an access token. Check the Meta app configuration.");
          }
          await signInWithCredential(auth, FacebookAuthProvider.credential(accessToken));
        } else {
          throw new Error("This sign-in provider is not supported in the Android app.");
        }
      } else {
        await signInWithPopup(auth, provider);
      }
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

  async function signInWithEmail(email: string, password: string) {
    if (!auth) {
      setAuthMessage("Firebase is not configured. Add the Vite Firebase environment variables to enable sign-in.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      await authPersistenceReady;
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setAuthMessage(formatAuthError(error));
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }

  async function signUpWithEmail(email: string, password: string) {
    if (!auth) {
      setAuthMessage("Firebase is not configured. Add the Vite Firebase environment variables to enable sign-in.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      await authPersistenceReady;
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setAuthMessage(formatAuthError(error));
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }

  async function sendPasswordReset(email: string) {
    if (!auth) {
      setAuthMessage("Firebase is not configured. Add the Vite Firebase environment variables to enable password reset.");
      return;
    }

    setAuthMessage("");

    try {
      await authPersistenceReady;
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      setAuthMessage(formatAuthError(error));
      throw error;
    }
  }

  return {
    authLoading,
    currentUser,
    authMessage,
    setAuthMessage,
    setCurrentUser,
    signIn,
    signOutCurrentUser,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset
  };
}
