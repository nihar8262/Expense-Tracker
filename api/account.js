const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { AuthenticationConfigurationError, AuthenticationError, authenticateRequest, deleteUserData } = require("./_lib/finance");
const { createToken, listTokens, revokeToken, deleteToken } = require("./_lib/account-tokens");

function readFirebaseAdminCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    if (
      (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))
    ) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (clientEmail && clientEmail.startsWith("mailto:")) {
    clientEmail = clientEmail.substring(7);
  }

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

async function deleteAuthenticatedUser(userId) {
  try {
    await getFirebaseAuth().deleteUser(userId);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "auth/user-not-found") {
      return;
    }

    throw error;
  }
}

module.exports = async function handler(request, response) {
  let user;

  try {
    user = await authenticateRequest(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return response.status(401).json({ error: error.message });
    }

    if (error instanceof AuthenticationConfigurationError) {
      return response.status(500).json({ error: error.message });
    }

    return response.status(500).json({ error: "Failed to authenticate request." });
  }

  const isTokensRequest = request.query.tokens === "true" || request.query.tokensRoute !== undefined;

  if (isTokensRequest) {
    const method = request.method;

    if (method === "GET") {
      try {
        const tokens = await listTokens(user.id);
        return response.status(200).json({ tokens });
      } catch (err) {
        console.error("Failed to list tokens:", err);
        return response.status(500).json({ error: "Failed to list tokens." });
      }
    }

    if (method === "POST") {
      try {
        const { label } = request.body || {};
        if (!label || typeof label !== "string" || !label.trim()) {
          return response.status(400).json({ error: "Label is required." });
        }
        const token = await createToken(user.id, label.trim());
        return response.status(201).json(token);
      } catch (err) {
        console.error("Failed to create token:", err);
        return response.status(500).json({ error: "Failed to create token." });
      }
    }

    if (method === "DELETE") {
      try {
        const tokenId = request.query.tokensRoute;
        const purge = request.query.purge === "true";
        if (!tokenId) {
          return response.status(400).json({ error: "Token ID is required." });
        }
        const success = purge
          ? await deleteToken(user.id, tokenId)
          : await revokeToken(user.id, tokenId);

        if (!success) {
          return response.status(404).json({ error: "Token not found." });
        }
        return response.status(204).end();
      } catch (err) {
        console.error("Failed to delete/revoke token:", err);
        return response.status(500).json({ error: "Failed to delete/revoke token." });
      }
    }

    response.setHeader("Allow", "GET, POST, DELETE");
    return response.status(405).end("Method Not Allowed");
  }

  if (request.method === "DELETE") {
    try {
      await deleteUserData(user.id);
      try {
        await deleteAuthenticatedUser(user.id);
      } catch (error) {
        console.error("Account data was deleted, but Firebase Auth user deletion failed.", error);
        return response.status(200).json({
          deleted: true,
          authDeleted: false,
          warning: "Account data was deleted, but Firebase Auth user deletion failed."
        });
      }

      return response.status(204).end();
    } catch (error) {
      console.error("Failed to delete account.", error);
      return response.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete account." });
    }
  }

  response.setHeader("Allow", "DELETE");
  return response.status(405).end("Method Not Allowed");
};
