/**
 * Base error class for all DXtrade SDK errors
 */
export abstract class DXError extends Error {
  public readonly name: string;
  public readonly timestamp: number;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    this.code = options.code;
    this.details = options.details;

    if (options.cause) {
      this.cause = options.cause;
    }

    // Ensure the prototype chain is maintained
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serialize error to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Configuration validation errors
 */
export class ConfigError extends DXError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'CONFIG_ERROR', details });
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthError extends DXError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'AUTH_ERROR', details });
  }
}

/**
 * Network and connectivity errors
 */
export class NetworkError extends DXError {
  public readonly statusCode?: number;
  public readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, { code: 'NETWORK_ERROR', details: options.details, cause: options.cause });
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? this.isRetryableStatusCode(options.statusCode);
  }

  private isRetryableStatusCode(statusCode?: number): boolean {
    if (!statusCode) return true; // Unknown errors are retryable
    
    // Retryable HTTP status codes
    const retryableCodes = [408, 429, 500, 502, 503, 504];
    return retryableCodes.includes(statusCode);
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
      retryable: this.retryable,
    };
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends DXError {
  public readonly retryAfter?: number;
  public readonly limit?: number;
  public readonly remaining?: number;
  public readonly resetTime?: number;

  constructor(
    message: string,
    options: {
      retryAfter?: number;
      limit?: number;
      remaining?: number;
      resetTime?: number;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message, { code: 'RATE_LIMIT_ERROR', details: options.details });
    this.retryAfter = options.retryAfter;
    this.limit = options.limit;
    this.remaining = options.remaining;
    this.resetTime = options.resetTime;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
      limit: this.limit,
      remaining: this.remaining,
      resetTime: this.resetTime,
    };
  }
}

/**
 * Request validation errors
 */
export class ValidationError extends DXError {
  public readonly field?: string;
  public readonly errors: Array<{ field?: string; message: string }>;

  constructor(
    message: string,
    errors: Array<{ field?: string; message: string }> = [],
    field?: string
  ) {
    super(message, { code: 'VALIDATION_ERROR', details: { field, errors } });
    this.field = field;
    this.errors = errors;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      field: this.field,
      errors: this.errors,
    };
  }
}

/**
 * Trading-specific errors
 */
export class TradingError extends DXError {
  public readonly orderRef?: string;
  public readonly symbol?: string;
  public readonly rejectionReason?: string;

  constructor(
    message: string,
    options: {
      orderRef?: string;
      symbol?: string;
      rejectionReason?: string;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message, { code: 'TRADING_ERROR', details: options.details });
    this.orderRef = options.orderRef;
    this.symbol = options.symbol;
    this.rejectionReason = options.rejectionReason;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      orderRef: this.orderRef,
      symbol: this.symbol,
      rejectionReason: this.rejectionReason,
    };
  }
}

/**
 * WebSocket connection errors
 */
export class WebSocketError extends DXError {
  public readonly connectionState?: string;
  public readonly lastPing?: number;
  public readonly reconnectAttempt?: number;

  constructor(
    message: string,
    options: {
      connectionState?: string;
      lastPing?: number;
      reconnectAttempt?: number;
      details?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, { code: 'WEBSOCKET_ERROR', details: options.details, cause: options.cause });
    this.connectionState = options.connectionState;
    this.lastPing = options.lastPing;
    this.reconnectAttempt = options.reconnectAttempt;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      connectionState: this.connectionState,
      lastPing: this.lastPing,
      reconnectAttempt: this.reconnectAttempt,
    };
  }
}

/**
 * Market data errors
 */
export class MarketDataError extends DXError {
  public readonly symbol?: string;
  public readonly subscriptionType?: string;

  constructor(
    message: string,
    options: {
      symbol?: string;
      subscriptionType?: string;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message, { code: 'MARKET_DATA_ERROR', details: options.details });
    this.symbol = options.symbol;
    this.subscriptionType = options.subscriptionType;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      symbol: this.symbol,
      subscriptionType: this.subscriptionType,
    };
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends DXError {
  public readonly timeout: number;
  public readonly operation?: string;

  constructor(
    message: string,
    timeout: number,
    options: {
      operation?: string;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message, { code: 'TIMEOUT_ERROR', details: options.details });
    this.timeout = timeout;
    this.operation = options.operation;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      timeout: this.timeout,
      operation: this.operation,
    };
  }
}

/**
 * Clock synchronization errors
 */
export class ClockSyncError extends DXError {
  public readonly serverTime: number;
  public readonly clientTime: number;
  public readonly drift: number;

  constructor(
    message: string,
    serverTime: number,
    clientTime: number,
    drift: number
  ) {
    super(message, {
      code: 'CLOCK_SYNC_ERROR',
      details: { serverTime, clientTime, drift },
    });
    this.serverTime = serverTime;
    this.clientTime = clientTime;
    this.drift = drift;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      serverTime: this.serverTime,
      clientTime: this.clientTime,
      drift: this.drift,
    };
  }
}

/**
 * Error factory for creating specific error types based on HTTP status codes
 */
export class ErrorFactory {
  static fromHttpStatus(
    status: number,
    message: string,
    details?: Record<string, unknown>
  ): DXError {
    switch (status) {
      case 400:
        return new ValidationError(message, [], undefined);
      case 401:
      case 403:
        return new AuthError(message, details);
      case 408:
        return new TimeoutError(message, 0, { details });
      case 429:
        return new RateLimitError(message, { details });
      case 500:
      case 502:
      case 503:
      case 504:
        return new NetworkError(message, { statusCode: status, details });
      default:
        return new NetworkError(message, { statusCode: status, details });
    }
  }

  static fromWebSocketError(
    error: Error,
    connectionState?: string,
    reconnectAttempt?: number
  ): WebSocketError {
    return new WebSocketError(error.message, {
      connectionState,
      reconnectAttempt,
      cause: error,
    });
  }

  static fromValidationError(errors: Array<{ field?: string; message: string }>): ValidationError {
    const message = errors.length === 1 
      ? errors[0]?.message ?? 'Validation failed'
      : `Validation failed with ${errors.length} errors`;
    
    return new ValidationError(message, errors);
  }
}

/**
 * Type guard functions for error types
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isTradingError(error: unknown): error is TradingError {
  return error instanceof TradingError;
}

export function isWebSocketError(error: unknown): error is WebSocketError {
  return error instanceof WebSocketError;
}

export function isRetryableError(error: unknown): boolean {
  if (isNetworkError(error)) {
    return error.retryable;
  }
  
  return (
    error instanceof TimeoutError ||
    error instanceof WebSocketError ||
    error instanceof ClockSyncError
  );
}