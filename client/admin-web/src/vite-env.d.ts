/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE?: string;
  }

  interface Window {
    BHOJORA_API_BASE?: string;
  }
}

export {};
