const { randomUUID } = require("node:crypto");
const { z } = require("zod");
const { getSqlClient } = require("./db");

const createBankAccountSchema = z.object({
  bankId: z.string().trim().min(1, "Bank ID is required.").max(64),
  bankName: z.string().trim().min(1, "Bank name is required.").max(120),
  accountType: z.enum(["debit", "credit", "rupay_credit", "cash"]),
  accountLabel: z.string().trim().max(64).nullable().optional(),
  lastFourDigits: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Last 4 digits must be exactly 4 numbers.")
    .nullable()
    .optional()
    .or(z.literal("")),
  isDefault: z.boolean().optional().default(false)
});

const updateBankAccountSchema = z.object({
  accountLabel: z.string().trim().max(64).nullable().optional(),
  lastFourDigits: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Last 4 digits must be exactly 4 numbers.")
    .nullable()
    .optional()
    .or(z.literal("")),
  isDefault: z.boolean().optional()
});

const createFeedbackSchema = z.object({
  category: z.enum(["bug", "feature", "feedback"]).default("feedback"),
  message: z.string().trim().min(1, "Message is required.").max(2000, "Message is too long."),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  userName: z.string().trim().max(128).optional()
});

const updateFeedbackSchema = z.object({
  category: z.enum(["bug", "feature", "feedback"]).optional(),
  message: z.string().trim().min(1, "Message is required.").max(2000, "Message is too long.").optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  userName: z.string().trim().max(128).optional()
});

let schemaReady = false;

async function ensureSchema(sql) {
  if (schemaReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS user_bank_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bank_id TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      account_label TEXT,
      last_four_digits TEXT,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_user_id ON user_bank_accounts (user_id);`;

  await sql`
    CREATE TABLE IF NOT EXISTS user_feedbacks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_email TEXT,
      category TEXT NOT NULL DEFAULT 'feedback',
      message TEXT NOT NULL,
      rating INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    ALTER TABLE expenses 
    ADD COLUMN IF NOT EXISTS bank_account_id TEXT REFERENCES user_bank_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_name TEXT;
  `;

  await sql`
    ALTER TABLE wallet_expenses 
    ADD COLUMN IF NOT EXISTS bank_account_id TEXT REFERENCES user_bank_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_name TEXT;
  `;

  await sql`
    ALTER TABLE wallet_loans 
    ADD COLUMN IF NOT EXISTS bank_account_id TEXT REFERENCES user_bank_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_name TEXT;
  `;

  await sql`
    ALTER TABLE user_feedbacks
    ADD COLUMN IF NOT EXISTS user_name TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `;

  schemaReady = true;
}

function mapBankAccount(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    bank_id: row.bank_id,
    bank_name: row.bank_name,
    account_type: row.account_type,
    account_label: row.account_label,
    last_four_digits: row.last_four_digits,
    is_default: Boolean(row.is_default),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

function mapFeedback(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    user_email: row.user_email,
    user_name: row.user_name || null,
    category: row.category,
    message: row.message,
    rating: row.rating ? Number(row.rating) : null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at) : undefined
  };
}

async function listBankAccounts(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    SELECT id, user_id, bank_id, bank_name, account_type, account_label, last_four_digits, is_default, created_at
    FROM user_bank_accounts
    WHERE user_id = ${userId}
    ORDER BY is_default DESC, bank_name ASC
  `;

  return {
    status: 200,
    body: { bankAccounts: rows.map(mapBankAccount) }
  };
}

async function createBankAccount(rawBody, userId) {
  const result = createBankAccountSchema.safeParse(rawBody);
  if (!result.success) {
    return {
      status: 400,
      body: { error: "Invalid bank account details.", details: result.error.flatten() }
    };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);

  const input = result.data;
  const accountId = randomUUID();
  const lastDigits = input.lastFourDigits && input.lastFourDigits.trim() ? input.lastFourDigits.trim() : null;
  const label = input.accountLabel && input.accountLabel.trim() ? input.accountLabel.trim() : null;

  return await sql.begin(async (tx) => {
    let isDefault = Boolean(input.isDefault);

    if (isDefault) {
      await tx`
        UPDATE user_bank_accounts
        SET is_default = FALSE
        WHERE user_id = ${userId}
      `;
    } else {
      const countRows = await tx`
        SELECT COUNT(*)::int AS count FROM user_bank_accounts WHERE user_id = ${userId}
      `;
      if (Number(countRows[0]?.count ?? 0) === 0) {
        isDefault = true;
      }
    }

    const rows = await tx`
      INSERT INTO user_bank_accounts (id, user_id, bank_id, bank_name, account_type, account_label, last_four_digits, is_default, created_at)
      VALUES (${accountId}, ${userId}, ${input.bankId.trim()}, ${input.bankName.trim()}, ${input.accountType}, ${label}, ${lastDigits}, ${isDefault}, NOW())
      RETURNING id, user_id, bank_id, bank_name, account_type, account_label, last_four_digits, is_default, created_at
    `;

    return {
      status: 201,
      body: { bankAccount: mapBankAccount(rows[0]) }
    };
  });
}

async function updateBankAccount(rawBody, bankAccountId, userId) {
  const result = updateBankAccountSchema.safeParse(rawBody);
  if (!result.success) {
    return {
      status: 400,
      body: { error: "Invalid bank account update payload.", details: result.error.flatten() }
    };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);

  const input = result.data;

  return await sql.begin(async (tx) => {
    if (input.isDefault) {
      await tx`
        UPDATE user_bank_accounts
        SET is_default = FALSE
        WHERE user_id = ${userId}
      `;
    }

    const lastDigits = input.lastFourDigits !== undefined ? (input.lastFourDigits?.trim() || null) : undefined;
    const label = input.accountLabel !== undefined ? (input.accountLabel?.trim() || null) : undefined;

    const rows = await tx`
      UPDATE user_bank_accounts
      SET account_label = COALESCE(${label !== undefined ? label : null}, account_label),
          last_four_digits = ${lastDigits !== undefined ? lastDigits : tx`last_four_digits`},
          is_default = COALESCE(${input.isDefault ?? null}, is_default)
      WHERE id = ${bankAccountId} AND user_id = ${userId}
      RETURNING id, user_id, bank_id, bank_name, account_type, account_label, last_four_digits, is_default, created_at
    `;

    if (!rows[0]) {
      return {
        status: 404,
        body: { error: "Bank account not found." }
      };
    }

    return {
      status: 200,
      body: { bankAccount: mapBankAccount(rows[0]) }
    };
  });
}

async function deleteBankAccount(bankAccountId, userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  return await sql.begin(async (tx) => {
    const deleted = await tx`
      DELETE FROM user_bank_accounts
      WHERE id = ${bankAccountId} AND user_id = ${userId}
      RETURNING id, is_default
    `;

    if (deleted.length === 0) {
      return {
        status: 404,
        body: { error: "Bank account not found." }
      };
    }

    if (deleted[0].is_default) {
      await tx`
        UPDATE user_bank_accounts
        SET is_default = TRUE
        WHERE id = (
          SELECT id FROM user_bank_accounts
          WHERE user_id = ${userId}
          ORDER BY created_at ASC
          LIMIT 1
        )
      `;
    }

    return {
      status: 200,
      body: { message: "Bank account removed successfully." }
    };
  });
}

async function createFeedback(rawBody, userId, userEmail) {
  const result = createFeedbackSchema.safeParse(rawBody);
  if (!result.success) {
    return {
      status: 400,
      body: { error: "Invalid feedback input.", details: result.error.flatten() }
    };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);

  // Enforce 5 feedbacks per 24 hours
  const countRows = await sql`
    SELECT COUNT(*)::int AS count FROM user_feedbacks
    WHERE user_id = ${userId} AND created_at >= NOW() - INTERVAL '24 hours'
  `;
  if (Number(countRows[0]?.count ?? 0) >= 5) {
    return {
      status: 429,
      body: { error: "Daily limit reached. You can submit up to 5 feedbacks per day." }
    };
  }

  const feedbackId = randomUUID();
  const rows = await sql`
    INSERT INTO user_feedbacks (id, user_id, user_email, user_name, category, message, rating, created_at, updated_at)
    VALUES (${feedbackId}, ${userId}, ${userEmail ?? null}, ${result.data.userName?.trim() ?? null}, ${result.data.category}, ${result.data.message.trim()}, ${result.data.rating ?? null}, NOW(), NOW())
    RETURNING id, user_id, user_email, user_name, category, message, rating, created_at, updated_at
  `;

  const feedback = mapFeedback(rows[0]);

  // Dispatch email via Resend
  let emailSent = false;
  const resendApiKey = process.env.RESEND_API_KEY;
  const rawRecipient = process.env.EMAIL || "niharnics";
  const recipientEmail = rawRecipient.includes("@") ? rawRecipient : `${rawRecipient}@gmail.com`;
  const senderName = result.data.userName?.trim() || userEmail || "User";

  if (resendApiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "Expense Tracker Feedback <onboarding@resend.dev>",
          to: [recipientEmail],
          reply_to: userEmail || undefined,
          subject: `[Expense Tracker] New ${result.data.category.toUpperCase()} from ${senderName}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 12px; font-size: 20px;">New Feedback Received</h2>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 16px 0;">
                <p style="margin: 0 0 10px;"><strong>Category:</strong> <span style="text-transform: capitalize; padding: 3px 10px; background: #e0f2fe; color: #0369a1; border-radius: 6px; font-size: 13px; font-weight: 600;">${result.data.category}</span></p>
                <p style="margin: 0 0 10px;"><strong>Submitted By:</strong> ${result.data.userName ? `${result.data.userName} (${userEmail || "No email"})` : (userEmail || "User")}</p>
                ${result.data.rating ? `<p style="margin: 0 0 10px;"><strong>Rating:</strong> ${"⭐".repeat(result.data.rating)} (${result.data.rating}/5)</p>` : ""}
                <p style="margin: 12px 0 6px;"><strong>Message:</strong></p>
                <div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; white-space: pre-wrap; font-size: 14px;">${result.data.message}</div>
              </div>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">This automated alert was dispatched by Expense Tracker via the Resend API.</p>
            </div>
          `
        })
      });

      if (response.ok) {
        emailSent = true;
      } else {
        const errText = await response.text();
        console.warn("Resend email delivery returned non-200:", errText);
      }
    } catch (err) {
      console.error("Failed to dispatch feedback email via Resend:", err);
    }
  }

  return {
    status: 201,
    body: { feedback, emailSent }
  };
}

async function listUserFeedbacks(userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    SELECT id, user_id, user_email, user_name, category, message, rating, created_at, updated_at
    FROM user_feedbacks
    WHERE user_id = ${userId} AND created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
  `;

  return {
    status: 200,
    body: { feedbacks: rows.map(mapFeedback) }
  };
}

async function updateFeedback(rawBody, feedbackId, userId) {
  const result = updateFeedbackSchema.safeParse(rawBody);
  if (!result.success) {
    return {
      status: 400,
      body: { error: "Invalid feedback input.", details: result.error.flatten() }
    };
  }

  const sql = getSqlClient();
  await ensureSchema(sql);

  const existing = await sql`
    SELECT id, user_id, user_email, user_name, category, message, rating, created_at, updated_at
    FROM user_feedbacks
    WHERE id = ${feedbackId} AND user_id = ${userId}
    LIMIT 1
  `;

  if (existing.length === 0) {
    return {
      status: 404,
      body: { error: "Feedback not found." }
    };
  }

  const createdAt = new Date(existing[0].created_at).getTime();
  if (Date.now() - createdAt > 24 * 60 * 60 * 1000) {
    return {
      status: 400,
      body: { error: "Feedbacks can only be edited within 24 hours of submission." }
    };
  }

  const nextCategory = result.data.category ?? existing[0].category;
  const nextMessage = result.data.message !== undefined ? result.data.message.trim() : existing[0].message;
  const nextRating = result.data.rating !== undefined ? result.data.rating : existing[0].rating;
  const nextUserName = result.data.userName !== undefined ? result.data.userName.trim() : existing[0].user_name;

  const rows = await sql`
    UPDATE user_feedbacks
    SET
      category = ${nextCategory},
      message = ${nextMessage},
      rating = ${nextRating},
      user_name = ${nextUserName},
      updated_at = NOW()
    WHERE id = ${feedbackId} AND user_id = ${userId}
    RETURNING id, user_id, user_email, user_name, category, message, rating, created_at, updated_at
  `;

  return {
    status: 200,
    body: { feedback: mapFeedback(rows[0]) }
  };
}

async function deleteFeedback(feedbackId, userId) {
  const sql = getSqlClient();
  await ensureSchema(sql);

  const existing = await sql`
    SELECT id, user_id
    FROM user_feedbacks
    WHERE id = ${feedbackId} AND user_id = ${userId}
    LIMIT 1
  `;

  if (existing.length === 0) {
    return {
      status: 404,
      body: { error: "Feedback not found." }
    };
  }

  await sql`
    DELETE FROM user_feedbacks
    WHERE id = ${feedbackId} AND user_id = ${userId}
  `;

  return {
    status: 200,
    body: { message: "Feedback deleted successfully." }
  };
}

module.exports = {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  createFeedback,
  listUserFeedbacks,
  updateFeedback,
  deleteFeedback
};
