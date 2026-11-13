export type InspectionAssessmentType =
  'INITIAL' | 'ROUTINE' | 'COMPLAINT_TRIGGERED' | 'RE_INSPECTION';

export type InspectionStatus =
  'SCHEDULED' | 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export type ChecklistCategory =
  | 'PERSONAL_HYGIENE'
  | 'FOOD_STORAGE_TEMPERATURE'
  | 'CROSS_CONTAMINATION_PREVENTION'
  | 'CLEANING_SANITATION'
  | 'PEST_CONTROL'
  | 'WASTE_MANAGEMENT_DRAINAGE';

export type FindingSeverity = 'PASS' | 'MINOR' | 'MAJOR' | 'CRITICAL';

export type EvidenceType =
  'PHOTO' | 'TEMPERATURE_LOG' | 'CERTIFICATE_DOCUMENT' | 'MANAGER_SIGNATURE';

export interface ChecklistItemDefinition {
  itemId: string;
  category: ChecklistCategory;
  title: string;
  description: string;
  maxScore: number;
  evidenceRequired: boolean;
  criticalViolationTrigger?: boolean;
}

export interface ChecklistTemplate {
  version: string;
  name: string;
  items: ChecklistItemDefinition[];
}

export const STANDARD_CHECKLIST_TEMPLATE_V1: ChecklistTemplate = {
  version: 'v1.0',
  name: 'BHOJORA Standard Commercial Kitchen Hygiene Checklist (Kolkata)',
  items: [
    {
      itemId: 'HYG_01',
      category: 'PERSONAL_HYGIENE',
      title: 'Protective Apparel & Grooming',
      description:
        'Clean uniforms, hair restraints/nets, and clean aprons worn by all food handlers.',
      maxScore: 10,
      evidenceRequired: false,
    },
    {
      itemId: 'HYG_02',
      category: 'PERSONAL_HYGIENE',
      title: 'Handwash Station Compliance',
      description:
        'Dedicated handwashing sink with potable running water, antibacterial soap, and single-use towels.',
      maxScore: 10,
      evidenceRequired: true,
    },
    {
      itemId: 'TEMP_01',
      category: 'FOOD_STORAGE_TEMPERATURE',
      title: 'Cold Storage / Chiller Temperatures (<= 4°C)',
      description:
        'Chilled items and dairy stored at or below 4°C with verified thermometer readout.',
      maxScore: 15,
      evidenceRequired: true,
    },
    {
      itemId: 'TEMP_02',
      category: 'FOOD_STORAGE_TEMPERATURE',
      title: 'Raw vs Ready-to-Eat Separation',
      description:
        'Raw meats and seafood stored physically below and separate from prepared or cooked foods.',
      maxScore: 15,
      evidenceRequired: false,
      criticalViolationTrigger: true,
    },
    {
      itemId: 'CONTAM_01',
      category: 'CROSS_CONTAMINATION_PREVENTION',
      title: 'Color-Coded Chopping Boards & Knives',
      description:
        'Distinct red/green/yellow boards and knives segregated for raw meat, veg, and dairy.',
      maxScore: 10,
      evidenceRequired: false,
    },
    {
      itemId: 'SAN_01',
      category: 'CLEANING_SANITATION',
      title: 'Food-Grade Sanitizers & Contact Surface Sanitation',
      description: 'Prep tables and equipment sanitized with approved food-contact sanitizers.',
      maxScore: 15,
      evidenceRequired: false,
    },
    {
      itemId: 'PEST_01',
      category: 'PEST_CONTROL',
      title: 'Pest Intrusion & Active Infestation Guard',
      description:
        'Zero evidence of rodents, roaches, or flies; screens, air curtains, and pest traps operational.',
      maxScore: 15,
      evidenceRequired: true,
      criticalViolationTrigger: true,
    },
    {
      itemId: 'WASTE_01',
      category: 'WASTE_MANAGEMENT_DRAINAGE',
      title: 'Grease Trap & Refuse Disposal',
      description:
        'Foot-operated covered waste bins, clean floor drains, and operational grease traps.',
      maxScore: 10,
      evidenceRequired: false,
    },
  ],
};

export interface InspectionEvidenceDto {
  id: string;
  inspectionId: string;
  itemId?: string;
  evidenceType: EvidenceType;
  sha256Hash: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
  capturedCoordinates: [number, number];
  storageKey: string;
  caption?: string;
}

export interface InspectionFindingDto {
  itemId: string;
  category: ChecklistCategory;
  score: number;
  maxScore: number;
  severity: FindingSeverity;
  comments?: string;
  evidenceIds: string[];
}

export interface InspectionDraftDto {
  findings: InspectionFindingDto[];
  notes?: string;
  clientDraftSavedAt?: string;
}

export interface InspectionEvidenceUploadDto {
  itemId?: string;
  evidenceType: EvidenceType;
  sha256Hash: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
  capturedCoordinates: [number, number];
  base64Data?: string;
  caption?: string;
}

export interface InspectionSubmitDto {
  managerSignatureDataUrl?: string;
  managerName?: string;
  managerDesignation?: string;
  signedAt?: string;
}

export interface InspectionRecordDto {
  id: string;
  outletId: string;
  restaurantId: string;
  inspectorId: string;
  assessmentType: InspectionAssessmentType;
  checklistVersion: string;
  status: InspectionStatus;
  startedAt: string;
  submittedAt?: string;
  clientDraftSavedAt?: string;
  findings: InspectionFindingDto[];
  evidence: InspectionEvidenceDto[];
  hasCriticalViolation: boolean;
  managerSignedAt?: string;
  managerName?: string;
  createdAt: string;
  updatedAt: string;
}
