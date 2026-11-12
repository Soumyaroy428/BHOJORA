/// <reference types="vite/client" />

import 'react';

declare module 'react' {
  // React 19 + WHATWG closedby attribute typing for native <dialog>
  interface DialogHTMLAttributes<T> extends HTMLAttributes<T> {
    closedby?: 'any' | 'closerequest' | 'none';
  }
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE?: string;
  }

  interface Window {
    BHOJORA_API_BASE?: string;
  }

  interface CredentialRequestOptions {
    otp?: {
      transport: readonly ('sms' | string)[];
    };
  }

  interface OTPCredential extends Credential {
    readonly code: string;
  }
}

export {};
