export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export const ErrorCode = {
  ValidationError: 'validation_error',
  PolicyDeny: 'policy_deny',
  PolicyConfirm: 'policy_confirm',
  NotFound: 'not_found',
  Conflict: 'conflict',
  RateLimited: 'rate_limited',
  InternalError: 'internal_error'
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly severity: ErrorSeverity;

  constructor(message: string, code: ErrorCode, statusCode = 500, details?: Record<string, unknown>, severity: ErrorSeverity = 'medium') {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.severity = severity;
  }
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: ErrorCode;
}

export function toProblem(error: unknown, fallbackStatus = 500): ProblemDetails {
  if (error instanceof AppError) {
    return {
      type: error.code,
      title: error.name,
      status: error.statusCode,
      detail: error.message,
      code: error.code
    };
  }

  return {
    type: 'internal_error',
    title: 'InternalError',
    status: fallbackStatus,
    detail: String(error)
  };
}
