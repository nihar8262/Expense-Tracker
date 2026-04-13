const {
  createWalletBudgetForUser,
  createWalletExpenseForUser,
  createWalletForUser,
  createWalletMemberForUser,
  removeWalletMemberForUser,
  createWalletSettlementForUser,
  deleteWalletBudgetForUser,
  deleteWalletExpenseForUser,
  deleteWalletForUser,
  deleteWalletSettlementForUser,
  getWalletForUser,
  leaveWalletForUser,
  linkWalletInvitesForUser,
  listWalletsForUser,
  updateWalletBudgetForUser,
  updateWalletExpenseForUser,
  updateWalletSettlementForUser
} = require("./_lib/finance");
const { authenticateUser, getRoutedSegments, methodNotAllowed, notFound, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  try {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  const segments = getRoutedSegments(request);

  if (segments.length === 0) {
    if (request.method === "GET") {
      try {
        await linkWalletInvitesForUser(user);
      } catch (error) {
        console.error("Failed to sync wallet invite notifications.", error);
      }
      const result = await listWalletsForUser(user.id);
      return sendResult(response, result);
    }

    if (request.method === "POST") {
      const result = await createWalletForUser(user, request.body);
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "GET, POST");
  }

  const walletId = segments[0];

  if (!walletId) {
    return notFound(response);
  }

  if (segments.length === 1) {
    if (request.method === "GET") {
      try {
        try {
          await linkWalletInvitesForUser(user);
        } catch (error) {
          console.error("Failed to sync wallet invite notifications.", error);
        }
        const result = await getWalletForUser(user.id, walletId);
        return sendResult(response, result);
      } catch (error) {
        return response.status(404).json({ error: error instanceof Error ? error.message : "Wallet not found." });
      }
    }

    if (request.method === "DELETE") {
      try {
        const result = await deleteWalletForUser(user.id, walletId);
        return sendResult(response, result);
      } catch (error) {
        return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete wallet." });
      }
    }

    return methodNotAllowed(response, "GET, DELETE");
  }

  const [resource, resourceId] = segments.slice(1);

  if (resource === "leave" && segments.length === 2) {
    if (request.method === "POST") {
      try {
        const result = await leaveWalletForUser(user.id, walletId);
        return sendResult(response, result);
      } catch (error) {
        return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to leave wallet." });
      }
    }

    return methodNotAllowed(response, "POST");
  }

  if (resource === "members" && segments.length === 2) {
    if (request.method === "POST") {
      try {
        const result = await createWalletMemberForUser(user.id, walletId, request.body);
        return sendResult(response, result);
      } catch (error) {
        return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to add wallet member." });
      }
    }

    return methodNotAllowed(response, "POST");
  }

  if (resource === "members" && segments.length === 3 && resourceId) {
    if (request.method === "DELETE") {
      try {
        const result = await removeWalletMemberForUser(user.id, walletId, resourceId);
        return sendResult(response, result);
      } catch (error) {
        return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to remove wallet member." });
      }
    }

    return methodNotAllowed(response, "DELETE");
  }

  if (resource === "budgets") {
    if (segments.length === 2) {
      if (request.method === "POST") {
        try {
          const result = await createWalletBudgetForUser(user.id, walletId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to create wallet budget." });
        }
      }

      if (request.method === "PUT" || request.method === "DELETE") {
        return response.status(405).json({ error: "Wallet budget id is required." });
      }

      return methodNotAllowed(response, "POST");
    }

    if (segments.length === 3 && resourceId) {
      if (request.method === "PUT") {
        try {
          const result = await updateWalletBudgetForUser(user.id, walletId, resourceId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to update wallet budget." });
        }
      }

      if (request.method === "DELETE") {
        try {
          const result = await deleteWalletBudgetForUser(user.id, walletId, resourceId);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete wallet budget." });
        }
      }

      return methodNotAllowed(response, "PUT, DELETE");
    }
  }

  if (resource === "expenses") {
    if (segments.length === 2) {
      if (request.method === "POST") {
        try {
          const result = await createWalletExpenseForUser(user.id, walletId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to create shared expense." });
        }
      }

      if (request.method === "PUT" || request.method === "DELETE") {
        return response.status(405).json({ error: "Wallet expense id is required." });
      }

      return methodNotAllowed(response, "POST");
    }

    if (segments.length === 3 && resourceId) {
      if (request.method === "PUT") {
        try {
          const result = await updateWalletExpenseForUser(user.id, walletId, resourceId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to update shared expense." });
        }
      }

      if (request.method === "DELETE") {
        try {
          const result = await deleteWalletExpenseForUser(user.id, walletId, resourceId);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete shared expense." });
        }
      }

      return methodNotAllowed(response, "PUT, DELETE");
    }
  }

  if (resource === "settlements") {
    if (segments.length === 2) {
      if (request.method === "POST") {
        try {
          const result = await createWalletSettlementForUser(user.id, walletId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to record settlement." });
        }
      }

      if (request.method === "PUT" || request.method === "DELETE") {
        return response.status(405).json({ error: "Settlement id is required." });
      }

      return methodNotAllowed(response, "POST");
    }

    if (segments.length === 3 && resourceId) {
      if (request.method === "PUT") {
        try {
          const result = await updateWalletSettlementForUser(user.id, walletId, resourceId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to update settlement." });
        }
      }

      if (request.method === "DELETE") {
        try {
          const result = await deleteWalletSettlementForUser(user.id, walletId, resourceId);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete settlement." });
        }
      }

      return methodNotAllowed(response, "PUT, DELETE");
    }
  }

  return notFound(response);
  } catch (error) {
    console.error("Wallets handler error:", error);
    return response.status(500).json({ error: error instanceof Error ? error.message : "Internal server error." });
  }
};