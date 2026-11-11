/**
 * BHOJORA Backend Skeleton Entry Metadata (Checkpoint 04 Baseline).
 * Runtime HTTP bootstrap, health endpoints, and config validation are added in Checkpoint 05.
 */
export const SERVER_BASELINE = {
  service: 'bhojora-api',
  checkpoint: '04',
  runtime: 'node-22-lts',
  currency: 'INR',
  currencyUnit: 'paise',
  timezone: 'Asia/Kolkata',
} as const;
