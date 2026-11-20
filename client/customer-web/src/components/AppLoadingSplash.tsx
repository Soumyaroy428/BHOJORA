import { useEffect, useState } from 'react';

interface AppLoadingSplashProps {
  isLoading: boolean;
  onFinished: () => void;
}

export function AppLoadingSplash({ isLoading, onFinished }: AppLoadingSplashProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    // 3 seconds exact duration with blinking logo
    const timer = setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(() => {
        onFinished();
      }, 300); // 300ms smooth fadeout transition
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [isLoading, onFinished]);

  if (!isLoading && !isFadingOut) {
    return null;
  }

  return (
    <div
      className={`app-loading-splash-overlay ${isFadingOut ? 'fade-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Application loading"
    >
      <div className="splash-modal-card">
        <div className="splash-brand-emblem-wrap">
          <div className="splash-pulse-ring" aria-hidden="true" />
          <img
            src="./logo.png"
            alt="BHOJORA Emblem"
            className="splash-brand-logo splash-brand-logo-blinking"
            width="100"
            height="100"
          />
        </div>
        <h1 className="splash-brand-title">BHOJORA</h1>
      </div>
    </div>
  );
}
