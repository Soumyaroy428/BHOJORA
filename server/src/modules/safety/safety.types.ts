import type {
  CategoryScoreBreakdownDto,
  ChecklistCategory,
  PublicEvidencePhotoDto,
  PublicTrustProfileDto,
  TrustHistoryItemDto,
  TrustHistoryResponseDto,
  TrustQrCodeDto,
} from '@bhojora/shared';

export type {
  CategoryScoreBreakdownDto,
  PublicEvidencePhotoDto,
  PublicTrustProfileDto,
  TrustHistoryItemDto,
  TrustHistoryResponseDto,
  TrustQrCodeDto,
};

export const CHECKLIST_CATEGORY_DISPLAY_NAMES: Readonly<Record<ChecklistCategory, string>> = {
  PERSONAL_HYGIENE: 'Personal Hygiene & Food Handlers',
  FOOD_STORAGE_TEMPERATURE: 'Cold Chain & Temperature Storage',
  CROSS_CONTAMINATION_PREVENTION: 'Cross-Contamination Prevention',
  CLEANING_SANITATION: 'Cleaning & Surface Sanitation',
  PEST_CONTROL: 'Pest Exclusion & Monitoring',
  WASTE_MANAGEMENT_DRAINAGE: 'Waste Management & Drainage',
};

export const STATUTORY_DISCLAIMER_TEXT =
  'Independent Bhojora Assessment under Verification Protocol v2.1. Not an FSSAI statutory government certification.' as const;

export const AUDIT_VALIDITY_DAYS = 180; // 6 months standard hygiene cycle
