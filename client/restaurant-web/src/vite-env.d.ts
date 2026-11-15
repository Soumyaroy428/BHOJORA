/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE?: string;
    readonly VITE_PARTNER_EMAIL?: string;
    readonly VITE_PARTNER_PASSWORD?: string;
  }

  interface Window {
    BHOJORA_API_BASE?: string;
    BHOJORA_PARTNER_EMAIL?: string;
    BHOJORA_PARTNER_PASSWORD?: string;
  }
}

export {};
