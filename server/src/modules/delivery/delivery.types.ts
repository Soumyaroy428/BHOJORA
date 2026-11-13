import crypto from 'node:crypto';
import type {
  DeliveryDocumentType,
  DeliveryPartnerDto,
  DeliveryPartnerStatus,
  DeliveryShiftStatus,
  DocumentVerificationStatus,
  VehicleType,
} from '@bhojora/shared';
import type { KolkataZoneId } from '../customer/customer.types';

export const DELIVERY_PARTNER_STATUSES_RUNTIME = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const;

export const DELIVERY_SHIFT_STATUSES_RUNTIME = ['OFFLINE', 'ONLINE', 'ON_DELIVERY'] as const;

export const VEHICLE_TYPES_RUNTIME = [
  'BICYCLE',
  'ELECTRIC_SCOOTER',
  'MOTORCYCLE',
  'SCOOTER',
] as const;

export const DELIVERY_DOCUMENT_TYPES_RUNTIME = [
  'DRIVING_LICENSE',
  'VEHICLE_RC',
  'GOVERNMENT_ID',
  'PAN_CARD',
] as const;

export const FORBIDDEN_CLIENT_OVERRIDE_FIELDS = [
  'status',
  'shiftStatus',
  'rating',
  'totalDeliveries',
  'rejectionReason',
  'approvedAt',
  'reviewedByUserId',
  'reviewedAt',
] as const;

export interface DeliveryVehicleRecord {
  vehicleType: VehicleType;
  model: string;
  registrationNumberMasked: string | null;
  registrationNumberHash?: string | null;
}

export interface DeliveryDocumentRecord {
  documentId: string;
  type: DeliveryDocumentType;
  documentNumberMasked: string;
  documentNumberHash: string;
  fileUrl: string;
  mimeType: string;
  isPublic: false;
  verificationStatus: DocumentVerificationStatus;
  rejectionReason: string | null;
  uploadedAt: Date;
  verifiedAt: Date | null;
}

export interface BankPayoutRecord {
  accountHolderName: string;
  accountNumberMasked: string;
  accountNumberHash: string;
  ifscCode: string;
  bankName: string;
}

export interface EmergencyContactRecord {
  name: string;
  phoneMasked: string;
  relationship: string;
}

export interface DeliveryPartnerRecord {
  partnerId: string;
  userId: string;
  fullName: string;
  phoneMasked: string;
  email: string;
  city: 'Kolkata';
  preferredZones: KolkataZoneId[];
  vehicle: DeliveryVehicleRecord;
  status: DeliveryPartnerStatus;
  shiftStatus: DeliveryShiftStatus;
  documents: DeliveryDocumentRecord[];
  bankPayout: BankPayoutRecord | null;
  emergencyContact: EmergencyContactRecord | null;
  rejectionReason: string | null;
  rating: number;
  totalDeliveries: number;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  approvedAt: Date | null;
  lastCoordinates?: [number, number] | null;
  lastLocationAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function maskDocumentNumber(value: string): string {
  const clean = value.replace(/[\s-]/g, '').trim();
  if (clean.length <= 4) return 'XXXX';
  const prefix = 'X'.repeat(clean.length - 4);
  return `${prefix}${clean.slice(-4)}`;
}

export function maskRegistrationNumber(value: string): string {
  const clean = value.replace(/[\s-]/g, '').toUpperCase().trim();
  if (clean.length <= 4) return 'XXXX';
  return `${clean.slice(0, 2)}XX-XXXX-${clean.slice(-4)}`;
}

export function maskBankAccount(accountNumber: string): string {
  const clean = accountNumber.replace(/\s+/g, '');
  if (clean.length <= 4) return 'XXXX';
  const maskedLen = Math.max(4, clean.length - 4);
  return `${'X'.repeat(maskedLen)}${clean.slice(-4)}`;
}

export function hmacDigest(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function toDeliveryPartnerDto(record: DeliveryPartnerRecord): DeliveryPartnerDto {
  return {
    partnerId: record.partnerId,
    userId: record.userId,
    fullName: record.fullName,
    phoneMasked: record.phoneMasked,
    email: record.email,
    city: 'Kolkata',
    preferredZones: [...record.preferredZones],
    vehicle: {
      vehicleType: record.vehicle.vehicleType,
      model: record.vehicle.model,
      registrationNumberMasked: record.vehicle.registrationNumberMasked,
    },
    status: record.status,
    shiftStatus: record.shiftStatus,
    documents: record.documents.map((doc) => ({
      documentId: doc.documentId,
      type: doc.type,
      documentNumberMasked: doc.documentNumberMasked,
      fileUrl: doc.fileUrl,
      mimeType: doc.mimeType,
      isPublic: false,
      verificationStatus: doc.verificationStatus,
      rejectionReason: doc.rejectionReason,
      uploadedAt: doc.uploadedAt.toISOString(),
      verifiedAt: doc.verifiedAt ? doc.verifiedAt.toISOString() : null,
    })),
    bankPayout: record.bankPayout
      ? {
          accountHolderName: record.bankPayout.accountHolderName,
          accountNumberMasked: record.bankPayout.accountNumberMasked,
          ifscCode: record.bankPayout.ifscCode,
          bankName: record.bankPayout.bankName,
        }
      : null,
    emergencyContact: record.emergencyContact
      ? {
          name: record.emergencyContact.name,
          phoneMasked: record.emergencyContact.phoneMasked,
          relationship: record.emergencyContact.relationship,
        }
      : null,
    rejectionReason: record.rejectionReason,
    rating: record.rating,
    totalDeliveries: record.totalDeliveries,
    submittedAt: record.submittedAt ? record.submittedAt.toISOString() : null,
    reviewedAt: record.reviewedAt ? record.reviewedAt.toISOString() : null,
    approvedAt: record.approvedAt ? record.approvedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
