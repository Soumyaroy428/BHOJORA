/**
 * BHOJORA Design System — Unified Token Architecture
 * Cross-platform exports for Next.js Web and React Native Expo.
 */

import colors from './colors.json';
import typography from './typography.json';
import spacing from './spacing.json';

export const BhojoraColors = colors;
export const BhojoraTypography = typography;
export const BhojoraSpacing = spacing;

export type SafetyStatusKey =
  | 'verifiedClean'
  | 'actionRequired'
  | 'suspended'
  | 'expired'
  | 'notInspected';

export interface SafetyStatusBadgeConfig {
  label: string;
  background: string;
  border: string;
  text: string;
  icon: string;
  isCompliant: boolean;
}

export const SAFETY_STATUS_REGISTRY: Record<SafetyStatusKey, SafetyStatusBadgeConfig> = {
  verifiedClean: {
    label: 'Verified Clean',
    background: colors.status.verifiedClean.background,
    border: colors.status.verifiedClean.border,
    text: colors.status.verifiedClean.text,
    icon: colors.status.verifiedClean.icon,
    isCompliant: true,
  },
  actionRequired: {
    label: 'Action Required',
    background: colors.status.actionRequired.background,
    border: colors.status.actionRequired.border,
    text: colors.status.actionRequired.text,
    icon: colors.status.actionRequired.icon,
    isCompliant: false,
  },
  suspended: {
    label: 'Suspended (Critical Violation)',
    background: colors.status.suspended.background,
    border: colors.status.suspended.border,
    text: colors.status.suspended.text,
    icon: colors.status.suspended.icon,
    isCompliant: false,
  },
  expired: {
    label: 'Assessment Expired',
    background: colors.status.expired.background,
    border: colors.status.expired.border,
    text: colors.status.expired.text,
    icon: colors.status.expired.icon,
    isCompliant: false,
  },
  notInspected: {
    label: 'Audit Due / Not Inspected',
    background: colors.status.notInspected.background,
    border: colors.status.notInspected.border,
    text: colors.status.notInspected.text,
    icon: colors.status.notInspected.icon,
    isCompliant: false,
  },
};

export const DIETARY_CONFIG = {
  PURE_VEG: {
    label: 'Pure Veg',
    border: colors.dietary.pureVeg.border,
    fill: colors.dietary.pureVeg.fill,
    shape: 'square-circle',
  },
  NON_VEG: {
    label: 'Non-Veg',
    border: colors.dietary.nonVeg.border,
    fill: colors.dietary.nonVeg.fill,
    shape: 'square-triangle',
  },
  EGG: {
    label: 'Contains Egg',
    border: colors.dietary.egg.border,
    fill: colors.dietary.egg.fill,
    shape: 'square-circle-yellow',
  },
} as const;

export default {
  colors: BhojoraColors,
  typography: BhojoraTypography,
  spacing: BhojoraSpacing,
  safetyStatuses: SAFETY_STATUS_REGISTRY,
  dietary: DIETARY_CONFIG,
};
