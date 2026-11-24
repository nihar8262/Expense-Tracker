type LaunchScreenProps = {
  isFirstLaunch: boolean;
};

export function LaunchScreen({ isFirstLaunch }: LaunchScreenProps) {
  return (
    <div
      className={`launch-screen${isFirstLaunch ? "" : " launch-screen--short"}`}
      role="status"
      aria-label="Opening Finance Space Expense Tracker"
    >
      <img className="launch-screen__background" src="/Launch.png" alt="" draggable={false} />
      <div className="launch-screen__content">
        <div className="launch-screen__logo-stage">
          <span className="launch-screen__logo-glow" aria-hidden="true" />
          <img className="launch-screen__logo" src="/Glossy-logo.png" alt="" draggable={false} />
          <span className="launch-screen__logo-shadow" aria-hidden="true" />
        </div>

        <div className="launch-screen__brand">
          <p className="launch-screen__kicker">FINANCE SPACE</p>
          <h1 className="launch-screen__name">Expense Tracker</h1>
          <span className="launch-screen__underline" aria-hidden="true" />
          <p className="launch-screen__tagline">Track <span>·</span> Analyze <span>·</span> Manage</p>
          <span className="launch-screen__progress" aria-hidden="true"><span /></span>
        </div>
      </div>
    </div>
  );
}
