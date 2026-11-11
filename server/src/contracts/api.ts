import type { Response } from 'express';

export type ApiErrorCode =
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
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_SERVER_ERROR';

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

export interface ApiSuccessEnvelope<T> {
  success: true;
  requestId: string;
  timestamp: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  requestId: string;
  timestamp: string;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export function getRequestIdFromResponse(res: Response): string {
  const value = res.locals['requestId'];
  return typeof value === 'string' && value.length > 0 ? value : 'unknown-request';
}

export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  data: T,
  meta?: PaginationMeta,
): Response<ApiSuccessEnvelope<T>> {
  const payload: ApiSuccessEnvelope<T> = {
    success: true,
    requestId: getRequestIdFromResponse(res),
    timestamp: new Date().toISOString(),
    data,
  };

  if (meta !== undefined) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorDetail[],
): Response<ApiErrorEnvelope> {
  const payload: ApiErrorEnvelope = {
    success: false,
    requestId: getRequestIdFromResponse(res),
    timestamp: new Date().toISOString(),
    error: {
      code,
      message,
    },
  };

  if (details !== undefined && details.length > 0) {
    payload.error.details = details;
  }

  return res.status(statusCode).json(payload);
}
