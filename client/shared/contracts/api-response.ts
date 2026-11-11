/**
 * BHOJORA — Standardized API Response & Error Contracts
 * Shared across backend services (server/) and all 6 frontend applications (client/).
 */

export interface ApiSuccessResponse<T> {
  success: true;
  requestId: string;
  timestamp: string; // UTC ISO 8601
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  cursor?: string | null;
  nextCursor?: string | null;
  hasMore: boolean;
  limit: number;
  totalCount?: number;
}

export interface ApiErrorDetail {
  field?: string;
  issue: string;
  code?: string;
}

export interface ApiErrorResponse {
  success: false;
  requestId: string;
  timestamp: string; // UTC ISO 8601
  error: {
    code:
      | 'VALIDATION_ERROR'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'RATE_LIMITED'
      | 'IDEMPOTENCY_CONFLICT'
      | 'ITEM_PRICE_CHANGED'
      | 'OUTLET_OUT_OF_ZONE'
      | 'CRITICAL_VIOLATION_SUSPENDED'
      | 'SELF_APPROVAL_PROHIBITED'
      | 'INTERNAL_SERVER_ERROR';
    message: string;
    details?: ApiErrorDetail[];
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
