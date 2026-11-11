import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';
import { useFormAriaValidation } from '../hooks/useFormAriaValidation';
import { apiRequest } from '../lib/apiClient';
import type {
  AuthPanelName,
  AuthSessionState,
  KolkataZoneId,
  LanguagePreference,
  LocationPermissionState,
} from '../types/domain';
import { CustomerAccountPanel } from './CustomerAccountPanel';

interface AuthDialogProps {
  open: boolean;
  session: AuthSessionState | null;
  selectedZone: KolkataZoneId;
  locationPermissionState: LocationPermissionState;
  onSessionChange: (session: AuthSessionState | null) => void;
  onSelectZone: (zone: KolkataZoneId) => void;
  onLocationPermissionChange: (state: LocationPermissionState) => void;
  onClose: () => void;
}

interface BannerState {
  text: string;
  kind: 'neutral' | 'success' | 'error';
}

interface PasswordFieldProps {
  id: string;
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  value: string;
  onChange: (value: string) => void;
  errorId: string;
  errorText: string;
  enterKeyHint?: 'next' | 'done';
  minLength?: number;
  pattern?: string;
  describedBy?: string;
  warningId?: string;
  children?: ReactNode;
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  value,
  onChange,
  errorId,
  errorText,
  enterKeyHint = 'done',
  minLength,
  pattern,
  describedBy,
  warningId,
  children,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-field">
      <label htmlFor={id}>
        {label} <span aria-hidden="true">*</span>
      </label>
      {children}
      {warningId ? (
        <span id={warningId} className="visually-hidden">
          Warning: revealing your password makes it visible on screen.
        </span>
      ) : null}
      <div className="auth-password-wrap">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          className="auth-input"
          autoComplete={autoComplete}
          minLength={minLength}
          pattern={pattern}
          enterKeyHint={enterKeyHint}
          aria-describedby={describedBy}
          data-error={errorId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button
          type="button"
          className="auth-toggle-pw"
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-describedby={warningId}
          onClick={() => setVisible((prev) => !prev)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      <div id={errorId} className="auth-field-error">
        <span role="img" aria-label="Error">
          ⚠️
        </span>{' '}
        {errorText}
      </div>
    </div>
  );
}

const STRONG_PASSWORD_PATTERN = '(?=.*\\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\\W_]).{8,}';
const INDIAN_MOBILE_PATTERN = '(?:\\+?91|0)?[6-9]\\d{9}';

export function AuthDialog({
  open,
  session,
  selectedZone,
  locationPermissionState,
  onSessionChange,
  onSelectZone,
  onLocationPermissionChange,
  onClose,
}: AuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const otpVerifyFormRef = useRef<HTMLFormElement | null>(null);
  const otpAbortRef = useRef<AbortController | null>(null);
  const resendTimerRef = useRef<number | null>(null);

  useDialogLightDismiss(dialogRef);

  const [activePanel, setActivePanel] = useState<AuthPanelName>('login');
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);

  // Form states
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [otpPhone, setOtpPhone] = useState('');
  const [otpLang, setOtpLang] = useState<LanguagePreference>('en-IN');
  const [otpStepVisible, setOtpStepVisible] = useState(false);
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpActiveIdentifier, setOtpActiveIdentifier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resendRemaining, setResendRemaining] = useState(0);

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regLang, setRegLang] = useState<LanguagePreference>('en-IN');
  const [regAcceptTerms, setRegAcceptTerms] = useState(false);

  const [recoverIdentifier, setRecoverIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  const stopSmsOtpListener = useCallback(() => {
    if (otpAbortRef.current) {
      otpAbortRef.current.abort();
      otpAbortRef.current = null;
    }
  }, []);

  const clearResendCountdown = useCallback(() => {
    if (resendTimerRef.current !== null) {
      window.clearInterval(resendTimerRef.current);
      resendTimerRef.current = null;
    }
  }, []);

  const startResendCountdown = useCallback(
    (seconds: number) => {
      clearResendCountdown();
      let remaining = seconds > 0 ? seconds : 60;
      setResendRemaining(remaining);
      resendTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearResendCountdown();
          setResendRemaining(0);
        } else {
          setResendRemaining(remaining);
        }
      }, 1000);
    },
    [clearResendCountdown],
  );

  const startSmsOtpListener = useCallback(async () => {
    if (!('OTPCredential' in window)) {
      return;
    }
    stopSmsOtpListener();
    const ac = new AbortController();
    otpAbortRef.current = ac;
    try {
      const credential = (await navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal,
      })) as OTPCredential | null;
      if (credential && typeof credential.code === 'string') {
        setOtpCode(credential.code);
        window.requestAnimationFrame(() => {
          otpVerifyFormRef.current?.requestSubmit();
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
    }
  }, [stopSmsOtpListener]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      stopSmsOtpListener();
      clearResendCountdown();
    };
  }, [stopSmsOtpListener, clearResendCountdown]);

  useFormAriaValidation(dialogRef, [open, activePanel, session]);

  const switchPanel = (panel: AuthPanelName): void => {
    stopSmsOtpListener();
    setBanner(null);
    setActivePanel(panel);
  };

  const handleDialogClose = (): void => {
    stopSmsOtpListener();
    clearResendCountdown();
    onClose();
  };

  const handleApiError = (error: unknown, previewFallback: string): void => {
    const message = error instanceof Error ? error.message : 'Request failed';
    if (message === 'PREVIEW_NO_API') {
      setBanner({ text: previewFallback, kind: 'neutral' });
    } else {
      setBanner({ text: message, kind: 'error' });
    }
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) {
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest<AuthSessionState>('/auth/login', {
        body: {
          identifier: loginIdentifier.trim(),
          password: loginPassword,
        },
      });
      onSessionChange(data);
      setBanner({
        text: 'Signed in cleanly. Access & rotating refresh session active.',
        kind: 'success',
      });
    } catch (error) {
      handleApiError(
        error,
        'Static frontend preview active — start Bhojora API server on /api/v1 for live token verification.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleOtpSendSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) {
      return;
    }
    const identifier = otpPhone.trim();
    setBusy(true);
    try {
      const data = await apiRequest<{
        challengeId: string;
        maskedDestination: string;
        resendAfterSeconds: number;
      }>('/auth/otp/send', { body: { identifier, channel: 'sms' } });
      setOtpChallengeId(data.challengeId);
      setOtpActiveIdentifier(identifier);
      setOtpStepVisible(true);
      startResendCountdown(data.resendAfterSeconds);
      setBanner({ text: `6-digit OTP sent to ${data.maskedDestination}.`, kind: 'success' });
      void startSmsOtpListener();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'PREVIEW_NO_API') {
        setOtpStepVisible(true);
        startResendCountdown(60);
        setBanner({
          text: 'Static UI preview: 6-digit OTP step opened (connect /api/v1/auth/otp/send for live SMS dispatch).',
          kind: 'neutral',
        });
      } else {
        setBanner({ text: msg || 'Request failed', kind: 'error' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleOtpVerifySubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    stopSmsOtpListener();
    if (!event.currentTarget.reportValidity()) {
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest<AuthSessionState>('/auth/otp/verify', {
        body: {
          challengeId: otpChallengeId ?? '00000000-0000-0000-0000-000000000000',
          identifier: otpActiveIdentifier || otpPhone.trim(),
          otp: otpCode.trim(),
          languagePreference: otpLang,
        },
      });
      onSessionChange(data);
      setBanner({ text: 'Phone OTP verified. Active session established.', kind: 'success' });
    } catch (error) {
      handleApiError(
        error,
        'Static frontend preview active — start Bhojora API server on /api/v1 to verify OTP codes.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) {
      return;
    }
    setBusy(true);
    try {
      const phoneVal = regPhone.trim();
      const data = await apiRequest<AuthSessionState>('/auth/register', {
        body: {
          name: regName.trim(),
          email: regEmail.trim(),
          ...(phoneVal ? { phone: phoneVal } : {}),
          password: regPassword,
          languagePreference: regLang,
          acceptTerms: true,
        },
      });
      onSessionChange(data);
      setBanner({ text: 'BHOJORA account created and signed in.', kind: 'success' });
    } catch (error) {
      handleApiError(
        error,
        'Static frontend preview active — start Bhojora API server on /api/v1 to create accounts.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRecoverRequestSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) {
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest<{ message: string }>('/auth/forgot-password', {
        body: { identifier: recoverIdentifier.trim() },
      });
      setBanner({ text: data.message, kind: 'success' });
    } catch (error) {
      handleApiError(
        error,
        'Static frontend preview active — connect /api/v1/auth/forgot-password to dispatch recovery tokens.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRecoverResetSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) {
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/auth/reset-password', {
        body: {
          identifier: recoverIdentifier.trim(),
          token: resetToken.trim(),
          newPassword: resetNewPassword,
        },
      });
      switchPanel('login');
      setBanner({
        text: 'Password updated and previous sessions revoked. Sign in with your new password.',
        kind: 'success',
      });
    } catch (error) {
      handleApiError(
        error,
        'Static frontend preview active — connect /api/v1/auth/reset-password for live reset.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async (allDevices: boolean): Promise<void> => {
    const token = session?.tokens.accessToken;
    try {
      if (token) {
        await apiRequest(allDevices ? '/auth/logout-all' : '/auth/logout', { body: {}, token });
      }
    } catch {
      // Clear local session cleanly even if server session already expired
    }
    onSessionChange(null);
    switchPanel('login');
    setBanner({
      text: allDevices
        ? 'Signed out across all devices.'
        : 'Signed out and current session revoked.',
      kind: 'success',
    });
  };

  return (
    <dialog
      ref={dialogRef}
      id="authModal"
      className="trust-dialog"
      closedby="any"
      aria-labelledby="authModalTitle"
      onClose={handleDialogClose}
    >
      <div className="modal-header">
        <div>
          <h2 id="authModalTitle" style={{ fontSize: '18px' }}>
            Sign in to BHOJORA
          </h2>
          <p id="authModalSubtitle" style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
            Protected Kolkata delivery &amp; trust session (/api/v1/auth)
          </p>
        </div>
        <form method="dialog">
          <button type="submit" className="modal-close" aria-label="Close account dialog">
            &times;
          </button>
        </form>
      </div>

      {banner ? (
        <div
          id="authStatusBanner"
          className={`auth-status-banner ${banner.kind === 'success' ? 'is-success' : ''} ${banner.kind === 'error' ? 'is-error' : ''}`}
          role="status"
          aria-live="polite"
        >
          {banner.text}
        </div>
      ) : (
        <div
          id="authStatusBanner"
          className="auth-status-banner"
          role="status"
          aria-live="polite"
          hidden
        />
      )}

      <div id="authGuestContainer" hidden={Boolean(session)}>
        <div className="auth-tabs" role="tablist" aria-label="Authentication methods">
          {(
            [
              { key: 'login', tabId: 'tabBtnLogin', panelId: 'panelLogin', label: 'Sign In' },
              { key: 'otp', tabId: 'tabBtnOtp', panelId: 'panelOtp', label: 'Phone OTP' },
              {
                key: 'register',
                tabId: 'tabBtnRegister',
                panelId: 'panelRegister',
                label: 'Register',
              },
              { key: 'recover', tabId: 'tabBtnRecover', panelId: 'panelRecover', label: 'Recover' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="auth-tab"
              id={tab.tabId}
              role="tab"
              aria-selected={activePanel === tab.key}
              aria-controls={tab.panelId}
              onClick={() => switchPanel(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section
          id="panelLogin"
          role="tabpanel"
          aria-labelledby="tabBtnLogin"
          hidden={activePanel !== 'login'}
        >
          <form
            id="authLoginForm"
            className="auth-form"
            method="POST"
            action="/api/v1/auth/login"
            onSubmit={(event) => void handleLoginSubmit(event)}
          >
            <div className="auth-field">
              <label htmlFor="loginIdentifier">
                Email or Indian mobile number <span aria-hidden="true">*</span>
              </label>
              <p id="loginIdentifierHint" className="auth-hint">
                Example: you@example.com or 9830012345
              </p>
              <input
                id="loginIdentifier"
                name="identifier"
                type="text"
                className="auth-input"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
                aria-describedby="loginIdentifierHint"
                data-error="loginIdentifierError"
                value={loginIdentifier}
                onChange={(event) => setLoginIdentifier(event.target.value)}
                required
                autoFocus
              />
              <div id="loginIdentifierError" className="auth-field-error">
                <span role="img" aria-label="Error">
                  ⚠️
                </span>{' '}
                Enter your registered email or 10-digit mobile number.
              </div>
            </div>

            <PasswordField
              id="loginPassword"
              name="password"
              label="Password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={setLoginPassword}
              errorId="loginPasswordError"
              errorText="Enter your current password."
              warningId="loginPwWarning"
            />

            <div className="auth-row-actions">
              <button
                type="button"
                id="goRecoverFromLoginBtn"
                className="auth-link-btn"
                onClick={() => switchPanel('recover')}
              >
                Forgot password?
              </button>
              <button
                type="button"
                id="goOtpFromLoginBtn"
                className="auth-link-btn"
                onClick={() => switchPanel('otp')}
              >
                Sign in with 6-digit SMS OTP
              </button>
            </div>

            <button
              type="submit"
              id="loginSubmitBtn"
              className="btn btn-primary"
              style={{ width: '100%', minHeight: '48px' }}
              disabled={busy}
            >
              Sign In
            </button>
          </form>
        </section>

        <section
          id="panelOtp"
          role="tabpanel"
          aria-labelledby="tabBtnOtp"
          hidden={activePanel !== 'otp'}
        >
          <form
            id="authOtpSendForm"
            className="auth-form"
            method="POST"
            action="/api/v1/auth/otp/send"
            style={{ marginBottom: '16px' }}
            onSubmit={(event) => void handleOtpSendSubmit(event)}
          >
            <div className="auth-field">
              <label htmlFor="otpPhoneInput">
                Indian mobile number <span aria-hidden="true">*</span>
              </label>
              <p id="otpPhoneHint" className="auth-hint">
                10-digit mobile number (e.g. 9830012345). We send a 6-digit OTP valid for 5 minutes.
              </p>
              <input
                id="otpPhoneInput"
                name="identifier"
                type="tel"
                className="auth-input"
                inputMode="tel"
                autoComplete="tel"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                pattern={INDIAN_MOBILE_PATTERN}
                enterKeyHint="done"
                aria-describedby="otpPhoneHint"
                data-error="otpPhoneError"
                value={otpPhone}
                onChange={(event) => setOtpPhone(event.target.value)}
                required
              />
              <div id="otpPhoneError" className="auth-field-error">
                <span role="img" aria-label="Error">
                  ⚠️
                </span>{' '}
                Enter a valid 10-digit Indian mobile number starting with 6–9.
              </div>
            </div>

            <fieldset className="auth-fieldset">
              <legend>Preferred app language</legend>
              <label className="auth-radio-item" htmlFor="otpLangEn">
                <input
                  id="otpLangEn"
                  type="radio"
                  name="otpLanguagePreference"
                  value="en-IN"
                  checked={otpLang === 'en-IN'}
                  onChange={() => setOtpLang('en-IN')}
                />
                <span>English (en-IN)</span>
              </label>
              <label className="auth-radio-item" htmlFor="otpLangBn">
                <input
                  id="otpLangBn"
                  type="radio"
                  name="otpLanguagePreference"
                  value="bn-IN"
                  checked={otpLang === 'bn-IN'}
                  onChange={() => setOtpLang('bn-IN')}
                />
                <span lang="bn">বাংলা (bn-IN)</span>
              </label>
            </fieldset>

            <button
              type="submit"
              id="otpSendBtn"
              className="btn btn-primary"
              style={{ width: '100%', minHeight: '48px' }}
              disabled={busy}
            >
              Get 6-digit OTP
            </button>
          </form>

          <form
            ref={otpVerifyFormRef}
            id="authOtpVerifyForm"
            className="auth-form"
            method="POST"
            action="/api/v1/auth/otp/verify"
            hidden={!otpStepVisible}
            onSubmit={(event) => void handleOtpVerifySubmit(event)}
          >
            <div className="auth-field">
              <label htmlFor="otpCodeInput">
                Verification code <span aria-hidden="true">*</span>
              </label>
              <p id="otpFormatHint" className="auth-hint">
                Enter the 6-digit OTP sent via origin-bound SMS. Supports browser one-time-code
                autofill.
              </p>
              <input
                id="otpCodeInput"
                name="otp"
                type="text"
                className="auth-input auth-input-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                enterKeyHint="done"
                aria-describedby="otpFormatHint"
                data-error="otpCodeError"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                required
              />
              <div id="otpCodeError" className="auth-field-error">
                <span role="img" aria-label="Error">
                  ⚠️
                </span>{' '}
                Enter the exact 6-digit numeric code.
              </div>
            </div>

            <div className="auth-row-actions">
              <button
                type="button"
                id="otpResendBtn"
                className="auth-link-btn"
                disabled={resendRemaining > 0}
                onClick={() => {
                  const sendForm = document.getElementById('authOtpSendForm');
                  if (sendForm instanceof HTMLFormElement) {
                    sendForm.requestSubmit();
                  }
                }}
              >
                {resendRemaining > 0 ? `Resend OTP in ${resendRemaining}s` : 'Resend OTP'}
              </button>
              <button
                type="button"
                id="otpChangeNumberBtn"
                className="auth-link-btn"
                onClick={() => {
                  stopSmsOtpListener();
                  setOtpStepVisible(false);
                  document.getElementById('otpPhoneInput')?.focus();
                }}
              >
                Change mobile number
              </button>
            </div>

            <button
              type="submit"
              id="otpVerifyBtn"
              className="btn btn-primary"
              style={{ width: '100%', minHeight: '48px' }}
              disabled={busy}
            >
              Verify &amp; Continue
            </button>
          </form>
        </section>

        <section
          id="panelRegister"
          role="tabpanel"
          aria-labelledby="tabBtnRegister"
          hidden={activePanel !== 'register'}
        >
          <form
            id="authRegisterForm"
            className="auth-form"
            method="POST"
            action="/api/v1/auth/register"
            onSubmit={(event) => void handleRegisterSubmit(event)}
          >
            <div className="auth-field">
              <label htmlFor="regName">
                Full name <span aria-hidden="true">*</span>
              </label>
              <p id="regNameHint" className="auth-hint">
                Supports English or Bengali Unicode scripts.
              </p>
              <input
                id="regName"
                name="name"
                type="text"
                className="auth-input"
                autoComplete="name"
                enterKeyHint="next"
                maxLength={120}
                aria-describedby="regNameHint"
                data-error="regNameError"
                value={regName}
                onChange={(event) => setRegName(event.target.value)}
                required
              />
              <div id="regNameError" className="auth-field-error">
                <span role="img" aria-label="Error">
                  ⚠️
                </span>{' '}
                Enter your full name.
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="regEmail">
                Email address <span aria-hidden="true">*</span>
              </label>
              <p id="regEmailHint" className="auth-hint">
                Format: name@example.com
              </p>
              <input
                id="regEmail"
                name="email"
                type="email"
                className="auth-input"
                autoComplete="username"
                spellCheck={false}
                enterKeyHint="next"
                aria-describedby="regEmailHint"
                data-error="regEmailError"
                value={regEmail}
                onChange={(event) => setRegEmail(event.target.value)}
                required
              />
              <div id="regEmailError" className="auth-field-error">
                <span role="img" aria-label="Error">
                  ⚠️
                </span>{' '}
                Enter an email address in the format you@example.com.
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="regPhone">Indian mobile number (optional)</label>
              <p id="regPhoneHint" className="auth-hint">
                Used for order status &amp; delivery updates.
              </p>
              <input
                id="regPhone"
                name="phone"
                type="tel"
                className="auth-input"
                autoComplete="tel"
                inputMode="tel"
                pattern={INDIAN_MOBILE_PATTERN}
                enterKeyHint="next"
                aria-describedby="regPhoneHint"
                data-error="regPhoneError"
                value={regPhone}
                onChange={(event) => setRegPhone(event.target.value)}
              />
              <div id="regPhoneError" className="auth-field-error">
                <span role="img" aria-label="Error">
                  ⚠️
                </span>{' '}
                Enter a valid 10-digit Indian mobile number or leave blank.
              </div>
            </div>

            <PasswordField
              id="regPassword"
              name="password"
              label="Create password"
              autoComplete="new-password"
              value={regPassword}
              onChange={setRegPassword}
              errorId="regPasswordError"
              errorText="Password must satisfy all requirements listed above."
              minLength={8}
              pattern={STRONG_PASSWORD_PATTERN}
              describedBy="regPasswordRules"
              warningId="regPwWarning"
            >
              <ul id="regPasswordRules" className="auth-rules-list">
                <li>At least 8 characters</li>
                <li>One uppercase letter and one lowercase letter</li>
                <li>One number and one special character</li>
              </ul>
            </PasswordField>

            <fieldset className="auth-fieldset">
              <legend>Language preference</legend>
              <label className="auth-radio-item" htmlFor="regLangEn">
                <input
                  id="regLangEn"
                  type="radio"
                  name="regLanguagePreference"
                  value="en-IN"
                  checked={regLang === 'en-IN'}
                  onChange={() => setRegLang('en-IN')}
                />
                <span>English (en-IN)</span>
              </label>
              <label className="auth-radio-item" htmlFor="regLangBn">
                <input
                  id="regLangBn"
                  type="radio"
                  name="regLanguagePreference"
                  value="bn-IN"
                  checked={regLang === 'bn-IN'}
                  onChange={() => setRegLang('bn-IN')}
                />
                <span lang="bn">বাংলা (bn-IN)</span>
              </label>
            </fieldset>

            <label className="auth-checkbox-row" htmlFor="regAcceptTerms">
              <input
                id="regAcceptTerms"
                name="acceptTerms"
                type="checkbox"
                checked={regAcceptTerms}
                onChange={(event) => setRegAcceptTerms(event.target.checked)}
                required
              />
              <span>I accept BHOJORA Terms of Service and DPDP Privacy Notice.</span>
            </label>

            <button
              type="submit"
              id="registerSubmitBtn"
              className="btn btn-primary"
              style={{ width: '100%', minHeight: '48px' }}
              disabled={busy}
            >
              Create Bhojora Account
            </button>
          </form>
        </section>

        <section
          id="panelRecover"
          role="tabpanel"
          aria-labelledby="tabBtnRecover"
          hidden={activePanel !== 'recover'}
        >
          <form
            id="authRecoverRequestForm"
            className="auth-form"
            method="POST"
            action="/api/v1/auth/forgot-password"
            style={{ marginBottom: '18px' }}
            onSubmit={(event) => void handleRecoverRequestSubmit(event)}
          >
            <div className="auth-field">
              <label htmlFor="recoverIdentifier">
                Registered email or mobile number <span aria-hidden="true">*</span>
              </label>
              <p id="recoverIdentifierHint" className="auth-hint">
                Receive a single-use recovery code valid for 15 minutes.
              </p>
              <input
                id="recoverIdentifier"
                name="identifier"
                type="text"
                className="auth-input"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="recoverIdentifierHint"
                data-error="recoverIdentifierError"
                value={recoverIdentifier}
                onChange={(event) => setRecoverIdentifier(event.target.value)}
                required
              />
              <div id="recoverIdentifierError" className="auth-field-error">
                <span role="img" aria-label="Error">
                  ⚠️
                </span>{' '}
                Enter your registered email or mobile number.
              </div>
            </div>
            <button
              type="submit"
              id="recoverRequestBtn"
              className="btn btn-outline"
              style={{ width: '100%', minHeight: '48px' }}
              disabled={busy}
            >
              Send Recovery Code
            </button>
          </form>

          <form
            id="authRecoverResetForm"
            className="auth-form"
            method="POST"
            action="/api/v1/auth/reset-password"
            onSubmit={(event) => void handleRecoverResetSubmit(event)}
          >
            <div className="auth-field">
              <label htmlFor="resetTokenInput">
                Single-use recovery code / token <span aria-hidden="true">*</span>
              </label>
              <input
                id="resetTokenInput"
                name="token"
                type="text"
                className="auth-input"
                autoComplete="one-time-code"
                minLength={6}
                data-error="resetTokenError"
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
                required
              />
              <div id="resetTokenError" className="auth-field-error">
                <span role="img" aria-label="Error">
                  ⚠️
                </span>{' '}
                Enter the recovery code sent to your email or phone.
              </div>
            </div>

            <PasswordField
              id="resetNewPassword"
              name="newPassword"
              label="New password"
              autoComplete="new-password"
              value={resetNewPassword}
              onChange={setResetNewPassword}
              errorId="resetPasswordError"
              errorText="Must be at least 8 characters with uppercase, lowercase, number, and symbol."
              minLength={8}
              pattern={STRONG_PASSWORD_PATTERN}
            />

            <button
              type="submit"
              id="recoverResetBtn"
              className="btn btn-primary"
              style={{ width: '100%', minHeight: '48px' }}
              disabled={busy}
            >
              Reset Password &amp; Revoke Sessions
            </button>
          </form>
        </section>
      </div>

      <section id="authSessionPanel" hidden={!session}>
        {session ? (
          <>
            <div className="score-banner" style={{ marginBottom: '16px' }}>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--trust-green)',
                    textTransform: 'uppercase',
                  }}
                >
                  Active Session
                </div>
                <div
                  id="sessionUserName"
                  style={{ fontSize: '16px', fontWeight: 700, color: 'var(--neutral-950)' }}
                >
                  {session.user.name}
                </div>
                <div id="sessionUserMeta" style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
                  Role: {session.user.activeRole} • {session.user.languagePreference}
                </div>
              </div>
              <button
                type="button"
                id="sessionLogoutBtn"
                className="btn btn-outline"
                style={{ minHeight: '44px', padding: '8px 14px' }}
                onClick={() => void handleLogout(false)}
              >
                Sign Out
              </button>
            </div>
            <div id="activeSessionsList">
              <div className="session-card">
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>
                    {session.session.deviceName} (Current Session)
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
                    Expires {new Date(session.session.expiresAt).toLocaleDateString('en-IN')}
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              id="sessionLogoutAllBtn"
              className="btn btn-outline"
              style={{ width: '100%', minHeight: '48px', marginTop: '8px' }}
              onClick={() => void handleLogout(true)}
            >
              Sign Out All Devices
            </button>

            <CustomerAccountPanel
              session={session}
              selectedZone={selectedZone}
              locationPermissionState={locationPermissionState}
              onSessionUpdate={onSessionChange}
              onZoneSelect={onSelectZone}
              onLocationPermissionChange={onLocationPermissionChange}
              onStatusMessage={setBanner}
            />
          </>
        ) : null}
      </section>
    </dialog>
  );
}
