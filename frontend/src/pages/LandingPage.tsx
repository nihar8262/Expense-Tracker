import { SurfaceCard } from "../components/ui";
import { ProviderLogo } from "../components/ProviderLogo";
import { Sparkles, Brain, Terminal, Mail, ShieldCheck, ArrowRight, CheckCircle, TrendingUp, Wallet, BellRing } from "lucide-react";

type LandingPageProps = {
  onCreateAccount: () => void;
  onSignIn: () => void;
  formatCurrency: (amount: string) => string;
};

const productFeatures = [
  {
    icon: "TrendingUp",
    eyebrow: "analytics",
    title: "Intelligent Dashboard & Trends",
    description: "Visualize spending patterns with clear category breakdowns, budget summaries, and automatic currency conversion. Toggle seamlessly between personal logs and group wallets."
  },
  {
    icon: "Wallet",
    eyebrow: "collaboration",
    title: "Shared Group Wallets",
    description: "Collaborate with friends, roommates, or partners. Log joint expenses, split costs dynamically (equally, fixed amounts, or percentages), and record settlements securely."
  },
  {
    icon: "BellRing",
    eyebrow: "alerts",
    title: "Timezone-Aware Notifications",
    description: "Set up reminders for daily tracking, overspend alerts, budget thresholds, and recurring bills. Tailored to your local timezone to ensure quiet, timely delivery."
  }
];

export function LandingPage({ onCreateAccount, onSignIn, formatCurrency }: LandingPageProps) {
  return (
    <main className="relative min-h-screen w-full bg-[radial-gradient(rgba(30,122,84,0.04)_1.5px,transparent_1.5px)] [background-size:24px_24px] bg-background text-foreground flex flex-col items-center py-5 px-4 sm:py-8 sm:px-6 lg:px-8 overflow-hidden">
      {/* Decorative Radial Glows (Vibrant Golden and Green gradients) */}
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(212,168,87,0.48)_0%,transparent_75%)] blur-[100px] pointer-events-none" />
      <div className="absolute top-[20%] -left-60 w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(30,122,83,0.40)_0%,transparent_75%)] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 -right-40 w-[700px] h-[700px] bg-[radial-gradient(circle,rgba(30,122,83,0.46)_0%,transparent_75%)] blur-[110px] pointer-events-none" />
      <div className="absolute -bottom-40 left-[15%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(212,168,87,0.44)_0%,transparent_75%)] blur-[100px] pointer-events-none" />

      <div className="w-full max-w-[1240px] space-y-12 sm:space-y-16 lg:space-y-20 relative z-10">
        
        {/* Floating Glass Header */}
        <header className="surface-card flex items-center justify-between gap-4 p-4 rounded-[28px] border border-white/60 bg-white/20 shadow-sm backdrop-blur-xl transition-all duration-300 hover:shadow-md">
          <div className="flex items-center gap-2.5 pl-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-200/80 bg-white shadow-2xs shrink-0">
              <img src="/expense-tracker.avif" alt="Expense Tracker Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted leading-none mb-0.5">finance space</p>
              <h1 className="font-display text-xl font-bold tracking-tight text-ink leading-none">Expense Tracker</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              type="button" 
              className="ui-button-secondary py-2 px-4 text-xs font-semibold cursor-pointer transition hover:scale-[1.02] active:scale-[0.98]" 
              onClick={onSignIn}
            >
              Sign in
            </button>
            <button 
              type="button" 
              className="ui-button-primary py-2 px-4 text-xs font-semibold cursor-pointer transition hover:scale-[1.02] active:scale-[0.98]" 
              onClick={onCreateAccount}
            >
              Create account
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 pt-4 lg:pt-8">
          <div className="space-y-6 lg:space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Now powered by vector search & assistant AI</span>
              </div>
              <h2 className="font-display text-[2.8rem] sm:text-[4rem] lg:text-[5rem] leading-[1.05] tracking-[-0.04em] text-ink">
                Track your money in a space that feels calm, personal, and precise.
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-secondary sm:text-lg">
                Keep everyday expenses private, collaborate with shared wallets, and consult your transaction history using secure, context-aware AI tools inside a premium interface.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                type="button" 
                className="ui-button-primary min-w-[180px] shadow-[0_12px_24px_rgba(30,122,83,0.18)] hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2" 
                onClick={onCreateAccount}
              >
                <span>Get started</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button 
                type="button" 
                className="ui-button-secondary min-w-[180px] hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer" 
                onClick={onSignIn}
              >
                Sign in to account
              </button>
            </div>

            {/* Quick Badges */}
            <div className="pt-2 flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-200/50">
              <div className="flex items-center gap-2 text-xs text-secondary">
                <ShieldCheck className="w-4.5 h-4.5 text-primary" />
                <span>Firebase Authentication</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-secondary">
                <CheckCircle className="w-4.5 h-4.5 text-primary" />
                <span>SSE Streamable MCP Server</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-secondary">
                <Brain className="w-4.5 h-4.5 text-primary" />
                <span>Postgres pgvector DB</span>
              </div>
            </div>
          </div>

          {/* Interactive UI Mockup */}
          <SurfaceCard className="relative overflow-hidden border-white/50 bg-[linear-gradient(145deg,rgba(255,255,255,0.85),rgba(255,255,255,0.6))] p-5 sm:p-6 lg:p-8 shadow-[var(--shadow)] hover:shadow-lg transition-shadow duration-300">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,168,87,0.18),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(30,122,83,0.14),transparent_38%)]" />
            <div className="relative space-y-6">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">Private Dashboard</span>
                <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted border border-zinc-150 shadow-2xs">April summary</span>
              </div>

              <div className="rounded-[26px] bg-[linear-gradient(135deg,#1e7a53,#d4a857)] p-6 text-white shadow-[0_20px_48px_rgba(30,122,83,0.2)]">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-bold">Monthly spending</p>
                <strong className="mt-2 block text-4xl font-semibold tracking-tight sm:text-5xl">{formatCurrency("18460.00")}</strong>
                <p className="mt-3 text-xs text-white/90 flex items-center gap-1.5">
                  <span className="inline-block px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-semibold">+12%</span>
                  <span>from previous month limit</span>
                </p>
              </div>

              {/* Progress bars representing budgets */}
              <div className="grid gap-3.5">
                {[
                  { label: "Groceries & House", value: "5320.00", share: "29%", color: "bg-primary" },
                  { label: "Dining & Coffee", value: "4180.00", share: "23%", color: "bg-gold" },
                  { label: "Transit & Travel", value: "2740.00", share: "15%", color: "bg-ink" }
                ].map((item) => (
                  <div key={item.label} className="rounded-[22px] border border-white/80 bg-white/90 p-4 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-secondary uppercase tracking-[0.05em]">{item.label}</p>
                        <strong className="text-lg text-ink font-semibold mt-0.5 block">{formatCurrency(item.value)}</strong>
                      </div>
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-ink border border-zinc-200">{item.share}</span>
                    </div>
                    {/* Visual indicators of budget caps */}
                    <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: item.share }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SurfaceCard>
        </section>

        {/* Product Features Section (Dashboard, Shared Wallets, Alerts) */}
        <section className="border-t border-zinc-300/60 pt-12 sm:pt-16 space-y-10 sm:space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <p className="section-eyebrow">PRODUCT CAPABILITIES</p>
            <h3 className="font-display text-[2.2rem] sm:text-[3rem] tracking-[-0.03em] text-ink leading-tight">
              Calm, Connected Finance Tools
            </h3>
            <p className="text-sm sm:text-base text-secondary leading-relaxed">
              A comprehensive set of financial utilities designed to keep personal logs private, shared wallets simple, and insights clear.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {productFeatures.map((feat) => {
              const Icon = feat.icon === "TrendingUp" ? TrendingUp : feat.icon === "Wallet" ? Wallet : BellRing;
              return (
                <SurfaceCard key={feat.title} className="hover:shadow-md hover:border-zinc-300/80 transition-all duration-300 flex flex-col justify-between p-6 sm:p-8">
                  <div>
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-5 shadow-2xs">
                      <Icon className="w-5 h-5" />
                    </div>
                    <p className="section-eyebrow">{feat.eyebrow}</p>
                    <h4 className="mt-2 text-xl font-bold tracking-tight text-ink font-display">{feat.title}</h4>
                    <p className="mt-3 text-xs sm:text-sm leading-relaxed text-secondary">{feat.description}</p>
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        </section>

        {/* Recent Additions Showcase (AI Chatbot, RAG, MCP, Semantic Search) */}
        <section className="border-t border-zinc-300/60 pt-12 sm:pt-16 space-y-10 sm:space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <p className="section-eyebrow">RECENT INNOVATIONS</p>
            <h3 className="font-display text-[2.2rem] sm:text-[3rem] tracking-[-0.03em] text-ink leading-tight">
              Powerful Intelligence & Integration
            </h3>
            <p className="text-sm sm:text-base text-secondary leading-relaxed">
              We have recently upgraded the tracker core with semantic database storage, real-time chat assistants, and standardized APIs.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            
            {/* AI Chatbot & RAG */}
            <div className="rounded-[28px] border border-white/60 bg-white/70 p-6 sm:p-8 shadow-sm backdrop-blur-md flex flex-col justify-between hover:translate-y-[-2px] hover:shadow-md transition-all duration-300">
              <div className="space-y-4">
                <div className="flex items-center gap-3.5">
                  {/* Chatbot Image (Avatar style) */}
                  <div className="relative shrink-0 w-12 h-12 rounded-full overflow-hidden border border-white/90 ring-2 ring-primary/20 shadow-md shadow-primary/5">
                    <img src="/ai-chatbot.jpg" alt="AI Chatbot Avatar" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border border-white shadow-xs" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink text-base">AI Finance Chatbot</h4>
                    <p className="text-xs text-secondary flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                      <span>Retrieval-Augmented (RAG)</span>
                    </p>
                  </div>
                </div>
                <h5 className="font-display text-xl font-bold tracking-tight text-ink">Conversational Advisor</h5>
                <p className="text-sm leading-6 text-secondary">
                  Ask details, check balances, or log transactions directly via our chat panel. Grounded securely in your own data, the assistant references your database variables using bounded conversation histories to control cost and avoid general AI hallucinations.
                </p>
              </div>
            </div>

            {/* Semantic Search */}
            <div className="rounded-[28px] border border-white/60 bg-white/70 p-6 sm:p-8 shadow-sm backdrop-blur-md flex flex-col justify-between hover:translate-y-[-2px] hover:shadow-md transition-all duration-300">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 shadow-2xs">
                  <Brain className="w-6 h-6" />
                </div>
                <h4 className="font-display text-2xl font-bold tracking-tight text-ink">Semantic Query Search</h4>
                <p className="text-sm leading-6 text-secondary">
                  Powered by PostgreSQL <code className="px-1.5 py-0.5 rounded bg-zinc-100 text-[11px] border border-zinc-200 font-mono text-primary font-bold">pgvector</code> embeddings. Search your expenses by overall meaning instead of exact keywords. Searching for <em>"restaurant expenditures overseas"</em> naturally fetches taxi bills, hotel receipts, and foreign café logs.
                </p>
              </div>
            </div>

            {/* Model Context Protocol (MCP) */}
            <div className="rounded-[28px] border border-white/60 bg-white/70 p-6 sm:p-8 shadow-sm backdrop-blur-md flex flex-col justify-between hover:translate-y-[-2px] hover:shadow-md transition-all duration-300">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-2xs">
                  <Terminal className="w-6 h-6" />
                </div>
                <h4 className="font-display text-2xl font-bold tracking-tight text-ink">Model Context Protocol (MCP)</h4>
                <p className="text-sm leading-6 text-secondary">
                  Connect external AI tools (like Claude Desktop or Cursor IDE) directly to your finance data. Query your transaction logs securely using streamable SSE transport and encrypted personal access tokens.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* Secure Authentication Methods */}
        <section className="border-t border-zinc-300/60 pt-12 sm:pt-16 space-y-10 sm:space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <p className="section-eyebrow">SECURITY PLATFORM</p>
            <h3 className="font-display text-[2.2rem] sm:text-[3rem] tracking-[-0.03em] text-ink leading-tight">
              Flexible Authentication Methods
            </h3>
            <p className="text-sm sm:text-base text-secondary leading-relaxed">
              Connect to your calm personal workspace using modern social credentials or traditional encrypted email logins, managed entirely by Firebase.
            </p>
          </div>

          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {[
              { id: "google", name: "Google", desc: "Single tap sign-in using your trusted Google ID popup credentials." },
              { id: "github", name: "GitHub", desc: "Connect developer workspaces using GitHub credentials." },
              { id: "facebook", name: "Facebook", desc: "Access wallets easily with your standard social profile login." },
              { id: "email", name: "Secure Email", desc: "Sign in with password credentials protected by encrypted validation." }
            ].map((provider) => (
              <div 
                key={provider.id} 
                className="rounded-[24px] border border-white/60 bg-white/50 p-5 shadow-xs hover:bg-white/90 hover:border-primary/25 hover:shadow-md transition-all duration-300 flex flex-col items-center text-center group cursor-pointer"
                onClick={provider.id === "email" ? onSignIn : undefined}
              >
                <div className="w-12 h-12 flex items-center justify-center rounded-full bg-white border border-zinc-200/80 shadow-2xs group-hover:scale-105 transition-transform duration-300 mb-4 shrink-0">
                  {provider.id === "email" ? (
                    <Mail className="w-5 h-5 text-zinc-500" />
                  ) : (
                    <div className="w-6 h-6 flex items-center justify-center">
                      <ProviderLogo providerId={provider.id as any} />
                    </div>
                  )}
                </div>
                <h4 className="font-semibold text-ink text-sm mb-1">{provider.name} Authentication</h4>
                <p className="text-[11px] leading-relaxed text-secondary/90">{provider.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full border-t border-zinc-400/60 pt-8 pb-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-secondary/80">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full overflow-hidden border border-zinc-200 bg-white shadow-3xs shrink-0">
              <img src="/expense-tracker.avif" alt="Expense Tracker Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="font-semibold text-ink">Expense Tracker</span>
              <span className="ml-2 font-normal text-muted">&copy; {new Date().getFullYear()} Inc. All rights reserved.</span>
            </div>
          </div>
          <div className="flex gap-6 font-medium">
            <a href="https://www.termsfeed.com/live/b64010e0-7d08-4823-9547-491292507340" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition cursor-pointer">Privacy Policy</a>
            <a href="#" className="hover:text-ink transition cursor-pointer">Terms of Service</a>
            <a href="#" className="hover:text-ink transition cursor-pointer">Security Standards</a>
            <a href="https://github.com/nihar8262/Expense-Tracker" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition cursor-pointer">GitHub Project</a>
          </div>
        </footer>

      </div>
    </main>
  );
}