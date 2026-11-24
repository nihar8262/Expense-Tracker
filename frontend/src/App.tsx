import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppRoutes } from "./routes/AppRoutes";
import { LaunchScreen } from "./components/LaunchScreen";
import { OnboardingExperience } from "./components/OnboardingExperience";
import { isAndroidApp } from "./utils/platform";
import { consumeSystemNotificationLaunchTarget } from "./services/systemNotifications";

const ONBOARDING_STORAGE_KEY = "finance-space-onboarding-complete-v1";

export default function App() {
  const navigate = useNavigate();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => (
    !isAndroidApp || window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true"
  ));
  const [launchMinimumElapsed, setLaunchMinimumElapsed] = useState(!isAndroidApp);
  const [authReady, setAuthReady] = useState(!isAndroidApp);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const showLaunchScreen = isAndroidApp && (!launchMinimumElapsed || !authReady);

  useEffect(() => {
    if (!isAndroidApp) return;
    const timer = window.setTimeout(() => setLaunchMinimumElapsed(true), hasCompletedOnboarding ? 1350 : 3600);
    return () => window.clearTimeout(timer);
  }, [hasCompletedOnboarding]);

  useEffect(() => {
    if (!isAndroidApp || isAuthenticated !== true) return;
    const openNotificationTarget = () => {
      void consumeSystemNotificationLaunchTarget()
        .then(({ route }) => {
          if (route === "/alerts") navigate(route);
        })
        .catch(() => undefined);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") openNotificationTarget();
    };
    openNotificationTarget();
    window.addEventListener("focus", openNotificationTarget);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", openNotificationTarget);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthenticated, navigate]);

  const handleAuthReady = useCallback((authenticated: boolean) => {
    setIsAuthenticated(authenticated);
    setAuthReady(true);
  }, []);
  const handleSignedOut = useCallback(() => {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    setHasCompletedOnboarding(false);
    setIsAuthenticated(false);
    setOnboardingDismissed(false);
  }, []);

  const completeOnboarding = () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    setHasCompletedOnboarding(true);
    setOnboardingDismissed(true);
    navigate("/signin", { replace: true });
  };

  return (
    <>
      <AppRoutes onAuthReady={handleAuthReady} onSignedOut={handleSignedOut} />
      {isAndroidApp && !showLaunchScreen && isAuthenticated === false && !onboardingDismissed ? <OnboardingExperience onComplete={completeOnboarding} /> : null}
      {showLaunchScreen ? <LaunchScreen isFirstLaunch={!hasCompletedOnboarding} /> : null}
    </>
  );
}
