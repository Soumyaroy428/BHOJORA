import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../config/logger';
import {
  getRequestIdFromResponse,
  sendError,
  type ApiErrorCode,
  type ApiErrorDetail,
} from '../contracts/api';

/**
 * Operational application error mapped directly onto standard API error responses.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details?: ApiErrorDetail[];
  public readonly isOperational: boolean = true;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

interface ExpressBodyParserError extends SyntaxError {
  status?: number;
  type?: string;
}

function isMalformedJsonError(error: unknown): error is ExpressBodyParserError {
  if (!(error instanceof SyntaxError)) {
    return false;
  }
  const parserError = error as ExpressBodyParserError;
  return parserError.status === 400 || parserError.type === 'entity.parse.failed';
}

function isPayloadTooLargeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const bodyError = error as { status?: number; type?: string };
  return bodyError.status === 413 || bodyError.type === 'entity.too.large';
}

function zodIssuesToDetails(error: ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'body',
    issue: issue.message,
    code: issue.code,
  }));
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} was not found`);
}

export function createErrorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = getRequestIdFromResponse(res);

    if (res.headersSent) {
      logger.error('http.error.after_headers_sent', {
        requestId,
        method: req.method,
        path: req.path,
        error: err,
      });
      return;
    }

    if (err instanceof AppError) {
      const logMethod = err.statusCode >= 500 ? logger.error : logger.warn;
      logMethod('http.error.operational', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: err.statusCode,
        errorCode: err.code,
        message: err.message,
      });
      sendError(res, err.statusCode, err.code, err.message, err.details);
      return;
    }

    if (err instanceof ZodError) {
      const details = zodIssuesToDetails(err);
      logger.warn('http.error.validation', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: 400,
        issueCount: details.length,
      });
      sendError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', details);
      return;
    }

    if (isMalformedJsonError(err)) {
      logger.warn('http.error.malformed_json', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: 400,
      });
      sendError(res, 400, 'VALIDATION_ERROR', 'Malformed JSON request body');
      return;
    }

    if (isPayloadTooLargeError(err)) {
      logger.warn('http.error.payload_too_large', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: 413,
      });
      sendError(res, 413, 'VALIDATION_ERROR', 'Request payload exceeds allowed size limit');
      return;
    }

    logger.error('http.error.unhandled', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: 500,
      error: err,
    });

    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected internal error occurred');
  };
}
