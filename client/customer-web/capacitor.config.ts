import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bhojora.app',
  appName: 'BHOJORA',
  webDir: 'dist',
  server: {
    url: 'https://customer-web-phi-ten.vercel.app',
    cleartext: false,
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0f172a',
  },
};

export default config;
