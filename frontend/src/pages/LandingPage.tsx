type LandingPageProps = {
  onCreateAccount: () => void;
  onSignIn: () => void;
  formatCurrency: (amount: string) => string;
};

export function LandingPage({ onCreateAccount, onSignIn, formatCurrency }: LandingPageProps) {
  return (
    <main className="app-shell landing-shell">
      <>
        <section className="landing-hero">
          <div className="landing-copy">
            <p className="eyebrow">Expense Tracker</p>
            <h1>Track your money in a space that feels calm, personal, and precise.</h1>
            <p className="lede">Keep every expense inside a private account, review clean totals at a glance, and move from quick capture to clear decisions without visual clutter.</p>

            <div className="landing-actions">
              <button type="button" className="primary-button" onClick={onCreateAccount}>
                Create account
              </button>
              <button type="button" className="ghost-button" onClick={onSignIn}>
                Sign in
              </button>
            </div>
          </div>

          <section className="card landing-preview">
            <div className="preview-stack">
              <div className="preview-badge">Private dashboard</div>
              <div className="preview-total">
                <span>This month</span>
                <strong>{formatCurrency("18460.00")}</strong>
              </div>
              <div className="preview-list">
                <div>
                  <span>Groceries</span>
                  <strong>{formatCurrency("5320.00")}</strong>
                </div>
                <div>
                  <span>Commute</span>
                  <strong>{formatCurrency("2180.00")}</strong>
                </div>
                <div>
                  <span>Subscriptions</span>
                  <strong>{formatCurrency("1199.00")}</strong>
                </div>
              </div>
            </div>
          </section>
        </section>

        <section className="landing-grid">
          <article className="card landing-card">
            <p className="eyebrow">Private by account</p>
            <h2>Every expense stays attached to the person who created it.</h2>
            <p>No shared ledger confusion. Sign in and your own categories, totals, and recent activity are the only things returned.</p>
          </article>

          <article className="card landing-card">
            <p className="eyebrow">Reliable capture</p>
            <h2>Resilient saves keep submissions safe even across refreshes.</h2>
            <p>The tracker keeps idempotent expense creation in place so repeated requests do not duplicate the same entry.</p>
          </article>

          <article className="card landing-card accent-card">
            <p className="eyebrow">Focused review</p>
            <h2>See totals, leading categories, and recent activity right after login.</h2>
            <p>The dashboard is designed to feel light, but still useful enough for daily spending review.</p>
          </article>
        </section>
      </>
    </main>
  );
}
