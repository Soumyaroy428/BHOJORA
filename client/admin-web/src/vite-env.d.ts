/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE?: string;
    readonly VITE_ADMIN_EMAIL?: string;
    readonly VITE_ADMIN_PASSWORD?: string;
  }

  interface Window {
    BHOJORA_API_BASE?: string;
    BHOJORA_ADMIN_EMAIL?: string;
    BHOJORA_ADMIN_PASSWORD?: string;
  }
}

export {};
