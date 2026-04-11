import { FormEvent, useEffect, useMemo, useState } from "react";

type Expense = {
  id: string;
  amount: string;
  category: string;
  description: string;
  date: string;
  created_at: string;
};

type ExpenseForm = {
  amount: string;
  category: string;
  description: string;
  date: string;
};

type PendingSubmission = {
  idempotencyKey: string;
  payload: ExpenseForm;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4101";
const PENDING_SUBMISSION_STORAGE_KEY = "expense-tracker.pending-submission";

const initialFormState: ExpenseForm = {
  amount: "",
  category: "",
  description: "",
  date: ""
};

function buildExpensesUrl(category: string, sortNewestFirst: boolean): string {
  const url = new URL(`${API_BASE_URL}/expenses`);

  if (category) {
    url.searchParams.set("category", category);
  }

  if (sortNewestFirst) {
    url.searchParams.set("sort", "date_desc");
  }

  return url.toString();
}

function readPendingSubmission(): PendingSubmission | null {
  const storedValue = window.localStorage.getItem(PENDING_SUBMISSION_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as PendingSubmission;
  } catch {
    window.localStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
    return null;
  }
}

function writePendingSubmission(submission: PendingSubmission | null) {
  if (!submission) {
    window.localStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(PENDING_SUBMISSION_STORAGE_KEY, JSON.stringify(submission));
}

function formatCurrency(amount: string): string {
  const value = Number(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

class ApiError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.retryable = status >= 500;
  }
}

async function createExpense(payload: ExpenseForm, idempotencyKey: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? "Failed to save expense.", response.status);
  }
}

export default function App() {
  const [form, setForm] = useState<ExpenseForm>(initialFormState);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const categories = useMemo(() => {
    return [...new Set(expenses.map((expense) => expense.category))].sort((left, right) => left.localeCompare(right));
  }, [expenses]);

  async function loadExpenses(activeCategory = selectedCategory, activeSort = sortNewestFirst) {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(buildExpensesUrl(activeCategory, activeSort));

      if (!response.ok) {
        throw new Error("Failed to load expenses.");
      }

      const body = (await response.json()) as { expenses: Expense[] };
      setExpenses(body.expenses);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load expenses.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadExpenses();
  }, []);

  useEffect(() => {
    void loadExpenses(selectedCategory, sortNewestFirst);
  }, [selectedCategory, sortNewestFirst]);

  useEffect(() => {
    const pendingSubmission = readPendingSubmission();

    if (!pendingSubmission) {
      return;
    }

    setStatusMessage("Retrying your last submission after refresh.");
    setIsSubmitting(true);

    void createExpense(pendingSubmission.payload, pendingSubmission.idempotencyKey)
      .then(async () => {
        writePendingSubmission(null);
        setForm(initialFormState);
        setStatusMessage("Expense saved.");
        await loadExpenses();
      })
      .catch((error) => {
        if (error instanceof ApiError && !error.retryable) {
          writePendingSubmission(null);
        }
        setErrorMessage(error instanceof Error ? error.message : "Failed to resume submission.");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setIsSubmitting(true);

    const idempotencyKey = crypto.randomUUID();
    const pendingSubmission = { idempotencyKey, payload: form };
    writePendingSubmission(pendingSubmission);

    try {
      await createExpense(form, idempotencyKey);
      writePendingSubmission(null);
      setForm(initialFormState);
      setStatusMessage("Expense saved.");
      await loadExpenses(selectedCategory, sortNewestFirst);
    } catch (error) {
      if (error instanceof ApiError && !error.retryable) {
        writePendingSubmission(null);
      }
      setErrorMessage(error instanceof Error ? error.message : "Failed to save expense.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const total = useMemo(() => {
    const amount = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    return formatCurrency(amount.toFixed(2));
  }, [expenses]);

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Personal Finance</p>
        <h1>Expense Tracker</h1>
        <p className="lede">Record expenses, recover cleanly from retries, and inspect the current spend at a glance.</p>
        <div className="total-card">
          <span>Current total</span>
          <strong>{total}</strong>
        </div>
      </section>

      <section className="content-grid">
        <form className="card form-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <h2>Add expense</h2>
            <p>Duplicate submits are safe. The client reuses the same idempotency key after refresh.</p>
          </div>

          <label>
            <span>Amount</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            />
          </label>

          <label>
            <span>Category</span>
            <input
              type="text"
              required
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            />
          </label>

          <label>
            <span>Description</span>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>

          <label>
            <span>Date</span>
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save expense"}
          </button>

          {statusMessage ? <p className="status-message success">{statusMessage}</p> : null}
          {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}
        </form>

        <section className="card list-card">
          <div className="section-heading controls-row">
            <div>
              <h2>Expenses</h2>
              <p>Filter by category and keep the list sorted by the latest date.</p>
            </div>

            <div className="controls">
              <label>
                <span>Category</span>
                <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Sort</span>
                <select
                  value={sortNewestFirst ? "date_desc" : "none"}
                  onChange={(event) => setSortNewestFirst(event.target.value === "date_desc")}
                >
                  <option value="date_desc">Newest first</option>
                  <option value="none">Created order</option>
                </select>
              </label>
            </div>
          </div>

          {isLoading ? <p className="empty-state">Loading expenses...</p> : null}
          {!isLoading && expenses.length === 0 ? <p className="empty-state">No expenses match the current filters.</p> : null}

          {!isLoading && expenses.length > 0 ? (
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{expense.date}</td>
                      <td>{expense.category}</td>
                      <td>{expense.description}</td>
                      <td>{formatCurrency(expense.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}