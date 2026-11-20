import { useEffect, useState } from 'react';

interface AppLoadingSplashProps {
  isLoading: boolean;
  onFinished: () => void;
}

export function AppLoadingSplash({ isLoading, onFinished }: AppLoadingSplashProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Initializing Kolkata Food Network...');
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const startTime = performance.now();
    const duration = 3000; // 3 seconds exact requirement

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      if (pct < 35) {
        setStatusText('Initializing Kolkata Food Network...');
      } else if (pct < 75) {
        setStatusText('Verifying Safe Corridors & Real-Time Kitchens...');
      } else {
        setStatusText('Ready! Welcome to Bhojora.');
      }

      if (elapsed >= duration) {
        clearInterval(interval);
        setIsFadingOut(true);
        setTimeout(() => {
          onFinished();
        }, 300); // 300ms fadeout transition
      }
    }, 50);

    return () => {
      clearInterval(interval);
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
      aria-label="Application loading view"
    >
      <div className="splash-modal-card">
        <div className="splash-brand-emblem-wrap">
          <div className="splash-pulse-ring" aria-hidden="true" />
          <img
            src="./logo.png"
            alt="BHOJORA Emblem"
            className="splash-brand-logo"
            width="80"
            height="80"
          />
        </div>

        <h1 className="splash-brand-title">BHOJORA</h1>
        <p className="splash-brand-subtitle">
          বিশুদ্ধ খাবার, অডিট করা হেঁশেল · Pure Food, Verified Kitchens
        </p>

        <div className="splash-progress-track" aria-hidden="true">
          <div className="splash-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="splash-status-meta">
          <span className="splash-status-text">{statusText}</span>
          <span className="splash-status-pct">{progress}%</span>
        </div>
      </div>
    </div>
  );
}
