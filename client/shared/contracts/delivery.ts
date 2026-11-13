import type { KolkataZoneId } from './customer';
import type { DocumentVerificationStatus } from './restaurant';

export const DELIVERY_PARTNER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const;
export type DeliveryPartnerStatus = (typeof DELIVERY_PARTNER_STATUSES)[number];

export const DELIVERY_SHIFT_STATUSES = ['OFFLINE', 'ONLINE', 'ON_DELIVERY'] as const;
export type DeliveryShiftStatus = (typeof DELIVERY_SHIFT_STATUSES)[number];

export const VEHICLE_TYPES = ['BICYCLE', 'ELECTRIC_SCOOTER', 'MOTORCYCLE', 'SCOOTER'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const DELIVERY_DOCUMENT_TYPES = [
  'DRIVING_LICENSE',
  'VEHICLE_RC',
  'GOVERNMENT_ID',
  'PAN_CARD',
] as const;
export type DeliveryDocumentType = (typeof DELIVERY_DOCUMENT_TYPES)[number];

export interface DeliveryVehicleDto {
  vehicleType: VehicleType;
  model: string;
  registrationNumberMasked: string | null;
}

export interface DeliveryDocumentDto {
  documentId: string;
  type: DeliveryDocumentType;
  documentNumberMasked: string;
  documentNumberHash?: string;
  fileUrl: string;
  mimeType: string;
  isPublic: false;
  verificationStatus: DocumentVerificationStatus;
  rejectionReason: string | null;
  uploadedAt: string;
  verifiedAt: string | null;
}

export interface BankPayoutDto {
  accountHolderName: string;
  accountNumberMasked: string;
  ifscCode: string;
  bankName: string;
}

export interface EmergencyContactDto {
  name: string;
  phoneMasked: string;
  relationship: string;
}

export interface DeliveryPartnerDto {
  partnerId: string;
  userId: string;
  fullName: string;
  phoneMasked: string;
  email: string;
  city: 'Kolkata';
  preferredZones: KolkataZoneId[];
  vehicle: DeliveryVehicleDto;
  status: DeliveryPartnerStatus;
  shiftStatus: DeliveryShiftStatus;
  documents: DeliveryDocumentDto[];
  bankPayout: BankPayoutDto | null;
  emergencyContact: EmergencyContactDto | null;
  rejectionReason: string | null;
  rating: number;
  totalDeliveries: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliveryApplicationRequestDto {
  fullName: string;
  preferredZones: KolkataZoneId[];
  vehicleType: VehicleType;
  vehicleModel: string;
  vehicleRegistrationNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
}

export interface UpdateDeliveryProfileRequestDto {
  fullName?: string;
  preferredZones?: KolkataZoneId[];
  vehicleType?: VehicleType;
  vehicleModel?: string;
  vehicleRegistrationNumber?: string;
  bankAccountHolderName?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  bankName?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
}

export interface UploadDeliveryDocumentRequestDto {
  type: DeliveryDocumentType;
  documentNumber: string;
  fileUrl: string;
  mimeType: string;
}

export interface UpdateShiftStatusRequestDto {
  shiftStatus: DeliveryShiftStatus;
  coordinates?: [number, number];
}

export interface ReviewDeliveryApplicationRequestDto {
  action: 'APPROVE' | 'REJECT';
  reason?: string;
}

export interface DeliveryApplicationListResponseDto {
  applications: DeliveryPartnerDto[];
  totalCount: number;
}
