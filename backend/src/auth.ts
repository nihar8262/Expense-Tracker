import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

export class AuthenticationError extends Error {
  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthenticationConfigurationError extends Error {
  constructor(message = "Firebase admin credentials are not configured.") {
    super(message);
    this.name = "AuthenticationConfigurationError";
  }
}

function readFirebaseAdminCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new AuthenticationConfigurationError();
  }

  return { projectId, clientEmail, privateKey };
}

function getFirebaseAuth() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(readFirebaseAdminCredentials())
    });
  }

  return getAuth();
}

export async function authenticateBearerToken(headerValue: string | undefined): Promise<AuthenticatedUser> {
  const token = headerValue?.startsWith("Bearer ") ? headerValue.slice(7).trim() : "";

  if (!token) {
    throw new AuthenticationError();
  }

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);

    return {
      id: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      picture: decoded.picture ?? null
    };
  } catch (error) {
    if (error instanceof AuthenticationConfigurationError) {
      throw error;
    }

    throw new AuthenticationError("Your login session is invalid or expired.");
  }
}