import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

export interface NativeBackHandlerState {
  hasOpenModal: boolean;
  onCloseModal: () => void;
}

/**
 * Checks if the current environment is running inside a Capacitor native app shell.
 */
export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Configure native Android status bar styling to blend seamlessly with BHOJORA's cream theme.
 */
export async function initNativeStatusBar(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // Style.Light ensures readable dark icons on our light cream (#f7f1e6) header
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#f7f1e6' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (err) {
    console.warn('Native status bar init notice:', err);
  }
}

/**
 * Sets up Android hardware back button handler:
 * 1. If an in-app modal or kitchen detail drawer is open, closes it first.
 * 2. If web browser history can go back, navigates backward.
 * 3. Only exits the application when at the root route with no open modals.
 */
export function setupNativeBackButton(getState: () => NativeBackHandlerState): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  const handlePromise = CapApp.addListener('backButton', ({ canGoBack }) => {
    try {
      const { hasOpenModal, onCloseModal } = getState();

      if (hasOpenModal) {
        onCloseModal();
        return;
      }

      if (canGoBack || window.history.length > 1) {
        window.history.back();
      } else {
        CapApp.exitApp();
      }
    } catch {
      CapApp.exitApp();
    }
  });

  return () => {
    handlePromise.then((h) => h.remove()).catch(() => {});
  };
}
