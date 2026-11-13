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

export const DELIVERY_ASSIGNMENT_STATUSES = [
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'TIMEOUT',
  'CANCELLED',
  'COMPLETED',
] as const;
export type DeliveryAssignmentStatus = (typeof DELIVERY_ASSIGNMENT_STATUSES)[number];

export interface DeliveryOfferLocationDto {
  name: string;
  addressLine: string;
  landmark?: string | null;
  coordinates: [number, number]; // [lng, lat]
}

export interface DeliveryJobOfferDto {
  offerId: string;
  orderId: string;
  outletId: string;
  status: DeliveryAssignmentStatus;
  offeredToPartnerId: string;
  pickupLocation: DeliveryOfferLocationDto;
  dropLocation: DeliveryOfferLocationDto;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  guaranteedPayoutPaise: number;
  offeredAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  declineReason?: string | null;
  reassignedFromOfferId?: string | null;
  executionStep?: DeliveryExecutionStep;
  failedOtpAttempts?: number;
}

export interface DeliveryJobInboxResponseDto {
  activeOffers: DeliveryJobOfferDto[];
  activeAssignment: DeliveryJobOfferDto | null;
}

export interface DeclineDeliveryJobRequestDto {
  reason: string;
}

export interface TriggerDispatchOfferRequestDto {
  orderId: string;
  outletId: string;
  pickupLocation: DeliveryOfferLocationDto;
  dropLocation: DeliveryOfferLocationDto;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  deliveryFeePaise: number;
}

export const DELIVERY_EXECUTION_STEPS = [
  'ACCEPTED',
  'ARRIVED_AT_PICKUP',
  'CONFIRMED_PICKUP',
  'ARRIVED_AT_DROP',
  'COMPLETED',
] as const;
export type DeliveryExecutionStep = (typeof DELIVERY_EXECUTION_STEPS)[number];

export interface LocationPingRequestDto {
  coordinates: [number, number];
  speedKmph?: number;
  headingDegrees?: number;
}

export interface DeliveryLocationEventDto {
  eventId: string;
  assignmentId: string;
  orderId: string;
  partnerId: string;
  coordinates: [number, number];
  speedKmph: number | null;
  headingDegrees: number | null;
  recordedAt: string;
}

export interface CompleteDeliveryRequestDto {
  deliveryOtp: string;
  proofImageUrl?: string;
  notes?: string;
}

export interface CompleteDeliveryResponseDto {
  assignment: DeliveryJobOfferDto;
  orderStatus: string;
  deliveredAt: string;
  payoutCreditedPaise: number;
}

export const DELIVERY_INCIDENT_TYPES = [
  'VEHICLE_BREAKDOWN',
  'ACCIDENT',
  'CUSTOMER_UNREACHABLE',
  'ADDRESS_INCORRECT',
  'ORDER_SPILLAGE',
  'RESTAURANT_DELAY',
] as const;
export type DeliveryIncidentType = (typeof DELIVERY_INCIDENT_TYPES)[number];

export interface ReportDeliveryIncidentRequestDto {
  incidentType: DeliveryIncidentType;
  description: string;
  coordinates?: [number, number];
}

export interface DeliveryIncidentDto {
  incidentId: string;
  assignmentId: string;
  orderId: string;
  partnerId: string;
  incidentType: DeliveryIncidentType;
  description: string;
  coordinates: [number, number] | null;
  status: 'REPORTED' | 'UNDER_REVIEW' | 'RESOLVED';
  reportedAt: string;
}

export interface LiveTrackingRiderDto {
  partnerId: string;
  fullName: string;
  phoneMasked: string;
  vehicleModel: string;
  vehicleType: string;
  currentCoordinates: [number, number] | null;
  lastLocationAt: string | null;
}

export interface OrderLiveTrackingResponseDto {
  orderId: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  deliveryOtp: string | null;
  pickupLocation: DeliveryOfferLocationDto;
  dropLocation: DeliveryOfferLocationDto;
  rider: LiveTrackingRiderDto | null;
  estimatedMinutesRemaining: number;
  updatedAt: string;
}
