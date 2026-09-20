const {
  createWalletBudgetForUser,
  createWalletExpenseForUser,
  createWalletForUser,
  updateWalletForUser,
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
  updateWalletSettlementForUser,
  createWalletLoanForUser,
  updateWalletLoanForUser,
  deleteWalletLoanForUser,
  createWalletLoanRepaymentForUser,
  updateWalletLoanRepaymentForUser,
  deleteWalletLoanRepaymentForUser,
  listLoansForUser,
  createStandaloneLoanForUser,
  updateStandaloneLoanForUser,
  deleteStandaloneLoanForUser,
  createStandaloneLoanRepaymentForUser,
  updateStandaloneLoanRepaymentForUser,
  deleteStandaloneLoanRepaymentForUser,
  respondToWalletInvite
} = require("./_lib/finance");
const { authenticateUser, getPathSegments, getRoutedSegments, methodNotAllowed, notFound, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  try {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  const isInvitesApi = Boolean(
    request.query?.invitesRoute !== undefined ||
    (getPathSegments(request)[1] === "wallet-invites" && getPathSegments(request)[0] === "api")
  );

  if (isInvitesApi) {
    let inviteSegments = [];
    if (request.query?.invitesRoute) {
      const ir = request.query.invitesRoute;
      inviteSegments = Array.isArray(ir) ? ir.flatMap((s) => String(s).split("/").filter(Boolean)) : String(ir).split("/").filter(Boolean);
    } else {
      const allSegs = getPathSegments(request);
      const idx = allSegs.indexOf("wallet-invites");
      if (idx !== -1) {
        inviteSegments = allSegs.slice(idx + 1);
      }
    }

    if (inviteSegments.length === 2 && inviteSegments[0] && inviteSegments[1] === "respond") {
      if (request.method === "POST") {
        const result = await respondToWalletInvite(user, inviteSegments[0], request.body);
        return sendResult(response, result);
      }

      return methodNotAllowed(response, "POST");
    }

    return notFound(response);
  }

  const isLoansApi = Boolean(
    request.query?.loans === "true" ||
    request.query?.loansRoute !== undefined ||
    (getPathSegments(request)[1] === "loans" && getPathSegments(request)[0] === "api")
  );

  if (isLoansApi) {
    let loanSegments = [];
    if (request.query?.loansRoute) {
      const lr = request.query.loansRoute;
      loanSegments = Array.isArray(lr) ? lr.flatMap((s) => String(s).split("/").filter(Boolean)) : String(lr).split("/").filter(Boolean);
    } else {
      const allSegs = getPathSegments(request);
      const loansIdx = allSegs.indexOf("loans");
      if (loansIdx !== -1) {
        loanSegments = allSegs.slice(loansIdx + 1);
      }
    }

    if (loanSegments.length === 0) {
      if (request.method === "GET") {
        const result = await listLoansForUser(user.id, user.email, user.emailVerified);
        return sendResult(response, result);
      }
      if (request.method === "POST") {
        const result = await createStandaloneLoanForUser(user.id, request.body, user.name, user.email);
        return sendResult(response, result);
      }
      return methodNotAllowed(response, "GET, POST");
    }

    const loanId = loanSegments[0];
    if (loanSegments.length === 1) {
      if (request.method === "PUT") {
        try {
          const result = await updateStandaloneLoanForUser(user.id, loanId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to update loan." });
        }
      }
      if (request.method === "DELETE") {
        try {
          const result = await deleteStandaloneLoanForUser(user.id, loanId);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete loan." });
        }
      }
      return methodNotAllowed(response, "PUT, DELETE");
    }

    if (loanSegments.length === 2 && loanSegments[1] === "repayments") {
      if (request.method === "POST") {
        try {
          const result = await createStandaloneLoanRepaymentForUser(user.id, loanId, request.body, user.email, user.emailVerified);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to record loan repayment." });
        }
      }
      return methodNotAllowed(response, "POST");
    }

    if (loanSegments.length === 3 && loanSegments[1] === "repayments") {
      const repaymentId = loanSegments[2];
      if (request.method === "PUT") {
        try {
          const result = await updateStandaloneLoanRepaymentForUser(user.id, loanId, repaymentId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to update loan repayment." });
        }
      }
      if (request.method === "DELETE") {
        try {
          const result = await deleteStandaloneLoanRepaymentForUser(user.id, loanId, repaymentId);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete loan repayment." });
        }
      }
      return methodNotAllowed(response, "PUT, DELETE");
    }

    return notFound(response);
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
        const result = await getWalletForUser(user.id, walletId, request.query || {});
        return sendResult(response, result);
      } catch (error) {
        return response.status(404).json({ error: error instanceof Error ? error.message : "Wallet not found." });
      }
    }

    if (request.method === "PUT") {
      try {
        const result = await updateWalletForUser(user.id, walletId, request.body);
        return sendResult(response, result);
      } catch (error) {
        return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to update wallet." });
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

    return methodNotAllowed(response, "GET, PUT, DELETE");
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

  if (resource === "loans") {
    if (segments.length === 2) {
      if (request.method === "POST") {
        try {
          const result = await createWalletLoanForUser(user.id, walletId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to create loan." });
        }
      }

      return methodNotAllowed(response, "POST");
    }

    if (segments.length === 3 && resourceId) {
      if (request.method === "PUT") {
        try {
          const result = await updateWalletLoanForUser(user.id, walletId, resourceId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to update loan." });
        }
      }

      if (request.method === "DELETE") {
        try {
          const result = await deleteWalletLoanForUser(user.id, walletId, resourceId);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete loan." });
        }
      }

      return methodNotAllowed(response, "PUT, DELETE");
    }

    if (segments.length === 4 && resourceId && segments[2] === "repayments") {
      if (request.method === "POST") {
        try {
          const result = await createWalletLoanRepaymentForUser(user.id, walletId, resourceId, request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to record loan repayment." });
        }
      }

      return methodNotAllowed(response, "POST");
    }

    if (segments.length === 5 && resourceId && segments[2] === "repayments" && segments[3]) {
      if (request.method === "PUT") {
        try {
          const result = await updateWalletLoanRepaymentForUser(user.id, walletId, resourceId, segments[3], request.body);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to update loan repayment." });
        }
      }
      if (request.method === "DELETE") {
        try {
          const result = await deleteWalletLoanRepaymentForUser(user.id, walletId, resourceId, segments[3]);
          return sendResult(response, result);
        } catch (error) {
          return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete loan repayment." });
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
