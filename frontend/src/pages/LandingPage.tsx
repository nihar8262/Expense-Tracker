import { SurfaceCard } from "../components/ui";

type LandingPageProps = {
  onCreateAccount: () => void;
  onSignIn: () => void;
  formatCurrency: (amount: string) => string;
};

const featureCards = [
  {
    eyebrow: "Private by account",
    title: "Every expense stays tied to the person who created it.",
    description: "Personal tracking remains calm and private, while shared wallets live in a clearly separate surface when you need them."
  },
  {
    eyebrow: "Reliable capture",
    title: "Resilient saves protect the moments when you are moving quickly.",
    description: "Idempotent submissions and lightweight workflows keep capture dependable even when you refresh or switch contexts."
  },
  {
    eyebrow: "Focused review",
    title: "Review totals, categories, and momentum without dashboard noise.",
    description: "The layout prioritizes hierarchy, breathing room, and crisp signals so spending feels legible instead of overwhelming."
  }
];

export function LandingPage({ onCreateAccount, onSignIn, formatCurrency }: LandingPageProps) {
  return (
    <main className="mx-auto min-h-screen max-w-[1280px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-10">
      <div className="surface-card overflow-hidden p-4 sm:p-5 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[26px] border border-white/60 bg-white/70 px-5 py-4 shadow-sm backdrop-blur-xl">
          <div>
            <p className="section-eyebrow">Expense Tracker</p>
            <h1 className="font-display text-[2rem] leading-none tracking-[-0.04em] text-ink">Calm personal finance</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-button-secondary" onClick={onSignIn}>
              Sign in
            </button>
            <button type="button" className="ui-button-primary" onClick={onCreateAccount}>
              Create account
            </button>
          </div>
        </header>

        <section className="grid gap-6 px-1 py-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:items-center lg:gap-8 lg:px-3 lg:py-12">
          <div className="space-y-6 px-2 sm:px-4 lg:px-6">
            <div className="space-y-4">
              <p className="section-eyebrow">Expense Tracker</p>
              <h2 className="max-w-3xl font-display text-[3.25rem] leading-[0.9] tracking-[-0.05em] text-ink sm:text-[4.3rem] lg:text-[5rem]">
                Track your money in a space that feels calm, personal, and precise.
              </h2>
              <p className="max-w-xl text-base leading-8 text-secondary sm:text-lg">
                Keep everyday expenses private, step into shared wallets when needed, and review clean financial signals inside a premium editorial interface.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="ui-button-primary min-w-[180px]" onClick={onCreateAccount}>
                Create account
              </button>
              <button type="button" className="ui-button-secondary min-w-[180px]" onClick={onSignIn}>
                Sign in
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/60 bg-white/70 p-4 shadow-sm">
                <p className="section-eyebrow">Private</p>
                <strong className="mt-2 block text-lg text-ink">Single-account clarity</strong>
              </div>
              <div className="rounded-[22px] border border-white/60 bg-white/70 p-4 shadow-sm">
                <p className="section-eyebrow">Shared</p>
                <strong className="mt-2 block text-lg text-ink">Wallets for trips and homes</strong>
              </div>
              <div className="rounded-[22px] border border-white/60 bg-white/70 p-4 shadow-sm">
                <p className="section-eyebrow">Alerts</p>
                <strong className="mt-2 block text-lg text-ink">Bills and budget nudges</strong>
              </div>
            </div>
          </div>

          <SurfaceCard className="relative overflow-hidden border-white/50 bg-[linear-gradient(145deg,rgba(255,255,255,0.82),rgba(255,255,255,0.58))] p-5 sm:p-6 lg:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,168,87,0.22),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(30,122,83,0.18),transparent_38%)]" />
            <div className="relative space-y-6">
              <div className="flex items-center justify-between gap-3">
                <span className="data-pill tone-positive">Private dashboard</span>
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">April snapshot</span>
              </div>

              <div className="rounded-[26px] bg-[linear-gradient(135deg,#1e7a53,#d4a857)] p-6 text-white shadow-[0_24px_60px_rgba(30,122,83,0.24)]">
                <p className="text-sm uppercase tracking-[0.2em] text-white/80">Monthly total</p>
                <strong className="mt-3 block text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{formatCurrency("18460.00")}</strong>
                <p className="mt-3 text-sm text-white/80">+12% from last month</p>
              </div>

              <div className="grid gap-3">
                {[
                  { label: "Groceries", value: "5320.00", share: "29%" },
                  { label: "Food", value: "4180.00", share: "23%" },
                  { label: "Travel", value: "2740.00", share: "15%" }
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-[22px] border border-white/70 bg-white/80 px-4 py-4 shadow-sm">
                    <div>
                      <p className="text-sm font-medium text-secondary">{item.label}</p>
                      <strong className="text-lg text-ink">{formatCurrency(item.value)}</strong>
                    </div>
                    <span className="data-pill">{item.share}</span>
                  </div>
                ))}
              </div>
            </div>
          </SurfaceCard>
        </section>

        <section className="grid gap-4 pb-2 lg:grid-cols-3">
          {featureCards.map((card, index) => (
            <SurfaceCard
              key={card.eyebrow}
              className={index === 2 ? "bg-[linear-gradient(160deg,rgba(255,255,255,0.82),rgba(248,235,203,0.72))]" : ""}
            >
              <p className="section-eyebrow">{card.eyebrow}</p>
              <h3 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-secondary">{card.description}</p>
            </SurfaceCard>
          ))}
        </section>
      </div>
    </main>
  );
}