export type ComplianceDomain =
  | 'FSSAI_FOOD_SAFETY'
  | 'E_COMMERCE_CONSUMER_PROTECTION'
  | 'DPDP_PRIVACY'
  | 'PAYMENT_ESCROW_RBI'
  | 'GST_TAXATION'
  | 'GIG_WORKFORCE_LABOR'
  | 'INSPECTOR_ACCREDITATION';

export type AdviserSignOffStatus = 'CERTIFIED' | 'REJECTED' | 'CONDITIONAL_APPROVAL';

export type ComplianceItemStatus = 'COMPLIANT' | 'NON_COMPLIANT' | 'UNDER_REVIEW';

export type LaunchReadinessStatus = 'READY_FOR_PILOT' | 'BLOCKED_WITH_GAPS';

export interface AdviserSignOff {
  id: string;
  domain: ComplianceDomain;
  adviserName: string;
  professionalRegistrationNo: string;
  firmOrAgency: string;
  status: AdviserSignOffStatus;
  signedAt: string;
  expiresAt: string;
  remarks: string;
  auditChecksum: string;
}

export interface ComplianceCheckItem {
  id: string;
  domain: ComplianceDomain;
  title: string;
  statutoryReference: string;
  status: ComplianceItemStatus;
  verifiedAt?: string;
  notes?: string;
}

export interface StatutoryOfficers {
  grievanceOfficer: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  dataProtectionOfficer: {
    name: string;
    email: string;
  };
  nodalContact: {
    name: string;
    phone: string;
    email: string;
  };
  foodSafetySupervisor: {
    name: string;
    registrationNo: string;
    contact: string;
  };
}

export interface LaunchReadinessDossier {
  status: LaunchReadinessStatus;
  readinessScorePercent: number;
  evaluatedAt: string;
  mandatoryDomainsCovered: number;
  totalMandatoryDomains: number;
  signOffs: AdviserSignOff[];
  checkItems: ComplianceCheckItem[];
  blockers: string[];
  officers: StatutoryOfficers;
}

export interface SignOffRequest {
  domain: ComplianceDomain;
  adviserName: string;
  professionalRegistrationNo: string;
  firmOrAgency: string;
  status: AdviserSignOffStatus;
  remarks: string;
  validityDays?: number;
}

export interface FssaiVerifyRequest {
  fssaiNumber: string;
}

export interface FssaiVerifyResult {
  fssaiNumber: string;
  isValid: boolean;
  stateCode: string;
  licenseType: 'CENTRAL_LICENSE' | 'STATE_LICENSE' | 'REGISTRATION';
  expiryDate?: string;
  message: string;
}

export interface GstinVerifyRequest {
  gstin: string;
}

export interface GstinVerifyResult {
  gstin: string;
  isValid: boolean;
  stateCode: string;
  panNumber: string;
  entityType: string;
  checksumValid: boolean;
  message: string;
}
