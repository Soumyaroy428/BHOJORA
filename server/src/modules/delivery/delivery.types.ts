import crypto from 'node:crypto';
import type {
  DeliveryAssignmentStatus,
  DeliveryDocumentType,
  DeliveryExecutionStep,
  DeliveryIncidentDto,
  DeliveryIncidentType,
  DeliveryJobOfferDto,
  DeliveryLocationEventDto,
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

export const DELIVERY_ASSIGNMENT_STATUSES_RUNTIME = [
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'TIMEOUT',
  'CANCELLED',
  'COMPLETED',
] as const;

export const DELIVERY_EXECUTION_STEPS_RUNTIME = [
  'ACCEPTED',
  'ARRIVED_AT_PICKUP',
  'CONFIRMED_PICKUP',
  'ARRIVED_AT_DROP',
  'COMPLETED',
] as const satisfies readonly DeliveryExecutionStep[];

export const DELIVERY_INCIDENT_TYPES_RUNTIME = [
  'VEHICLE_BREAKDOWN',
  'ACCIDENT',
  'CUSTOMER_UNREACHABLE',
  'ADDRESS_INCORRECT',
  'ORDER_SPILLAGE',
  'RESTAURANT_DELAY',
] as const satisfies readonly DeliveryIncidentType[];

export const OFFER_COUNTDOWN_SECONDS = 45;
export const BASE_RIDER_PAYOUT_PAISE = 3500; // ₹35.00 base guaranteed payout
export const PER_KM_RIDER_PAYOUT_PAISE = 1500; // ₹15.00 per km
export const MAX_OTP_ATTEMPTS = 5;

export function calculateRiderPayoutPaise(distanceKm: number, deliveryFeePaise?: number): number {
  const distanceBased =
    BASE_RIDER_PAYOUT_PAISE + Math.round(distanceKm * PER_KM_RIDER_PAYOUT_PAISE);
  const feeBased = Math.round((deliveryFeePaise ?? 0) * 0.85);
  return Math.max(distanceBased, feeBased, BASE_RIDER_PAYOUT_PAISE);
}

export interface DeliveryOfferLocationRecord {
  name: string;
  addressLine: string;
  landmark: string | null;
  coordinates: [number, number];
}

export interface DeliveryOfferRecord {
  offerId: string;
  orderId: string;
  outletId: string;
  status: DeliveryAssignmentStatus;
  offeredToPartnerId: string;
  partnerId: string | null;
  pickupLocation: DeliveryOfferLocationRecord;
  dropLocation: DeliveryOfferLocationRecord;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  guaranteedPayoutPaise: number;
  offeredAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  reassignedFromOfferId: string | null;
  executionStep?: DeliveryExecutionStep;
  arrivedAtPickupAt?: Date | null;
  pickupConfirmedAt?: Date | null;
  arrivedAtDropAt?: Date | null;
  completedAt?: Date | null;
  failedOtpAttempts?: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryLocationEventRecord {
  eventId: string;
  assignmentId: string;
  orderId: string;
  partnerId: string;
  coordinates: [number, number];
  speedKmph: number | null;
  headingDegrees: number | null;
  recordedAt: Date;
}

export interface DeliveryIncidentRecord {
  incidentId: string;
  assignmentId: string;
  orderId: string;
  partnerId: string;
  incidentType: DeliveryIncidentType;
  description: string;
  coordinates: [number, number] | null;
  status: 'REPORTED' | 'UNDER_REVIEW' | 'RESOLVED';
  reportedAt: Date;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
}

export function toDeliveryLocationEventDto(
  record: DeliveryLocationEventRecord,
): DeliveryLocationEventDto {
  return {
    eventId: record.eventId,
    assignmentId: record.assignmentId,
    orderId: record.orderId,
    partnerId: record.partnerId,
    coordinates: [record.coordinates[0], record.coordinates[1]],
    speedKmph: record.speedKmph,
    headingDegrees: record.headingDegrees,
    recordedAt: record.recordedAt.toISOString(),
  };
}

export function toDeliveryIncidentDto(record: DeliveryIncidentRecord): DeliveryIncidentDto {
  return {
    incidentId: record.incidentId,
    assignmentId: record.assignmentId,
    orderId: record.orderId,
    partnerId: record.partnerId,
    incidentType: record.incidentType,
    description: record.description,
    coordinates: record.coordinates ? [record.coordinates[0], record.coordinates[1]] : null,
    status: record.status,
    reportedAt: record.reportedAt.toISOString(),
  };
}

export function toDeliveryJobOfferDto(record: DeliveryOfferRecord): DeliveryJobOfferDto {
  return {
    offerId: record.offerId,
    orderId: record.orderId,
    outletId: record.outletId,
    status: record.status,
    offeredToPartnerId: record.offeredToPartnerId,
    pickupLocation: {
      name: record.pickupLocation.name,
      addressLine: record.pickupLocation.addressLine,
      landmark: record.pickupLocation.landmark,
      coordinates: [record.pickupLocation.coordinates[0], record.pickupLocation.coordinates[1]],
    },
    dropLocation: {
      name: record.dropLocation.name,
      addressLine: record.dropLocation.addressLine,
      landmark: record.dropLocation.landmark,
      coordinates: [record.dropLocation.coordinates[0], record.dropLocation.coordinates[1]],
    },
    estimatedDistanceKm: record.estimatedDistanceKm,
    estimatedDurationMinutes: record.estimatedDurationMinutes,
    guaranteedPayoutPaise: record.guaranteedPayoutPaise,
    offeredAt: record.offeredAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    acceptedAt: record.acceptedAt ? record.acceptedAt.toISOString() : null,
    declinedAt: record.declinedAt ? record.declinedAt.toISOString() : null,
    declineReason: record.declineReason,
    reassignedFromOfferId: record.reassignedFromOfferId,
    executionStep: record.executionStep,
    failedOtpAttempts: record.failedOtpAttempts,
  };
}

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
