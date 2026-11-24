import { useCallback, useEffect, useRef, useState } from "react";

type OnboardingExperienceProps = { onComplete: () => void };
type Slide = { image: string | null; imageAlt: string; lead: string; accent: string; description: string; className: string };

const slides: Slide[] = [
  { image: "/Splash 1.png", imageAlt: "Wallet, receipt, cards, and rupee coins", lead: "Track Your", accent: "Expenses Effortlessly", description: "Capture every expense in seconds and keep your daily spending beautifully organized.", className: "expenses" },
  { image: "/Splash 2.png", imageAlt: "Friendly financial assistant with an analytics panel", lead: "AI-Powered", accent: "Financial Assistant", description: "Ask questions, uncover patterns, and get clear guidance shaped around your finances.", className: "assistant" },
  { image: "/Shared wallet.png", imageAlt: "Two wallets sharing rupee coins", lead: "Share Expenses,", accent: "Not Stress", description: "Create shared wallets, split costs fairly, and keep every balance transparent.", className: "sharing" },
  { image: "/Splash 3.png", imageAlt: "Three-dimensional spending analytics dashboard", lead: "Understand", accent: "Your Spending", description: "Turn everyday transactions into simple insights that help you make confident decisions.", className: "analytics" },
  { image: "/Splash 5.png", imageAlt: "Budget calendar, progress chart, reminder bell, and rupee coins", lead: "Stay Ahead of", accent: "Your Spending", description: "Set thoughtful budgets and reminders before small expenses become big surprises.", className: "budgets" },
  { image: "/Splash 4.png", imageAlt: "Secure green shield and padlock", lead: "Your Data,", accent: "Private & Secure", description: "Your financial records stay protected and in your control, on your own device.", className: "privacy" },
];

export function OnboardingExperience({ onComplete }: OnboardingExperienceProps) {
  const [page, setPage] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const currentPage = useRef(page);
  currentPage.current = page;

  const finish = useCallback(() => {
    if (isLeaving) return;
    setIsLeaving(true);
    window.setTimeout(onComplete, 380);
  }, [isLeaving, onComplete]);

  const goTo = useCallback((nextPage: number) => {
    setPage(Math.max(0, Math.min(slides.length - 1, nextPage)));
    setDragX(0);
  }, []);

  useEffect(() => {
    const next = slides[page + 1];
    if (!next?.image) return;
    const image = new Image();
    image.src = next.image;
  }, [page]);

  useEffect(() => {
    window.history.pushState({ financeSpaceOnboarding: true }, "", window.location.href);
    const handleBack = () => {
      if (currentPage.current > 0) setPage((value) => value - 1);
      window.history.pushState({ financeSpaceOnboarding: true }, "", window.location.href);
    };
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerStart.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStart.current === null) return;
    const movement = event.clientX - pointerStart.current;
    const resisted = (page === 0 && movement > 0) || (page === slides.length - 1 && movement < 0);
    setDragX((resisted ? 0.28 : 1) * movement);
  };
  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStart.current === null) return;
    const movement = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (movement < -52 && page < slides.length - 1) goTo(page + 1);
    else if (movement > 52 && page > 0) goTo(page - 1);
    else setDragX(0);
  };

  return (
    <main className={`onboarding${isLeaving ? " onboarding--leaving" : ""}`} aria-label="Welcome to Finance Space">
      <div className="onboarding__texture" aria-hidden="true" />
      <header className="onboarding__topbar">
        <span className="onboarding__brand">FINANCE SPACE</span>
        <button type="button" className="onboarding__skip" onClick={finish}>Skip</button>
      </header>

      <div className="onboarding__viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <div className="onboarding__track" style={{ transform: `translate3d(calc(${-page * 100}% + ${dragX}px), 0, 0)` }}>
          {slides.map((slide, index) => (
            <section className={`onboarding__slide onboarding__slide--${slide.className}${index === page ? " is-active" : ""}`} key={slide.accent} aria-hidden={index !== page}>
              <div className="onboarding__art-wrap">
                <span className="onboarding__art-halo" aria-hidden="true" />
                {slide.image ? <img className="onboarding__art" src={slide.image} alt={slide.imageAlt} draggable={false} /> : (
                  <div className="sharing-art" role="img" aria-label={slide.imageAlt}>
                    <img src="/Glossy-logo.png" alt="" className="sharing-art__wallet sharing-art__wallet--left" draggable={false} />
                    <img src="/Glossy-logo.png" alt="" className="sharing-art__wallet sharing-art__wallet--right" draggable={false} />
                    <span className="sharing-art__path" aria-hidden="true" />
                    <span className="sharing-art__coin sharing-art__coin--one" aria-hidden="true">₹</span>
                    <span className="sharing-art__coin sharing-art__coin--two" aria-hidden="true">₹</span>
                    <span className="sharing-art__coin sharing-art__coin--three" aria-hidden="true">₹</span>
                  </div>
                )}
              </div>
              <div className="onboarding__copy">
                <h1><span>{slide.lead}</span><strong>{slide.accent}</strong></h1>
                <p>{slide.description}</p>
              </div>
            </section>
          ))}
        </div>
      </div>

      <footer className="onboarding__footer">
        <div className="onboarding__dots" role="tablist" aria-label="Onboarding pages">
          {slides.map((slide, index) => <button type="button" key={slide.accent} className={index === page ? "is-active" : ""} aria-label={`Go to page ${index + 1}`} aria-selected={index === page} role="tab" onClick={() => goTo(index)} />)}
        </div>
        <button type="button" className="onboarding__next" onClick={() => page === slides.length - 1 ? finish() : goTo(page + 1)}>
          <span>{page === slides.length - 1 ? "Get Started" : "Next"}</span><span aria-hidden="true">→</span>
        </button>
      </footer>
    </main>
  );
}
