import { createHmac } from 'crypto';
import {
  NetworkError,
  TimeoutError,
  AuthError,
  ValidationError,
  ErrorFactory,
  isRetryableError,
} from '../errors/index.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { ExponentialBackoff, retryWithBackoff } from '../utils/backoff.js';
import { ClockSynchronizer, TimestampGenerator } from '../utils/clock-sync.js';
import type {
  SDKConfig,
  RequestConfig,
  AuthConfig,
  HTTPMethod,
  ApiResponse,
} from '../types/common.js';

/**
 * HTTP client for DXtrade REST API
 */
export class HttpClient {
  private readonly config: Required<SDKConfig>;
  private readonly rateLimiter: RateLimiter;
  private readonly clockSync: ClockSynchronizer;
  private readonly timestampGenerator: TimestampGenerator;
  private sessionToken?: string;
  private readonly idempotencyKeys = new Set<string>();

  constructor(config: SDKConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? this.getDefaultBaseUrl(config.environment),
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      rateLimit: config.rateLimit ?? { requests: 100, window: 60000 },
    };

    this.rateLimiter = new RateLimiter(
      this.config.rateLimit.requests,
      this.config.rateLimit.window
    );

    this.clockSync = new ClockSynchronizer();
    this.timestampGenerator = new TimestampGenerator(this.clockSync);

    // Initialize authentication
    this.initializeAuth();
  }

  /**
   * Make HTTP request with full error handling and retry logic
   */
  async request<T>(config: RequestConfig): Promise<ApiResponse<T>> {
    // Validate configuration
    this.validateRequestConfig(config);

    // Check rate limiting
    await this.rateLimiter.consume();

    // Sync clock if needed
    if (this.clockSync.needsSync()) {
      await this.syncClock();
    }

    // Handle idempotency
    const idempotencyKey = config.idempotencyKey ?? this.generateIdempotencyKey();
    if (this.idempotencyKeys.has(idempotencyKey)) {
      throw new ValidationError('Duplicate idempotency key', [], 'idempotencyKey');
    }

    const backoff = new ExponentialBackoff({
      maxAttempts: config.retries ?? this.config.retries,
    });

    return retryWithBackoff(
      () => this.makeRequest<T>(config, idempotencyKey),
      {
        backoff,
        shouldRetry: (error, attempt) => {
          if (!isRetryableError(error) || attempt >= (config.retries ?? this.config.retries)) {
            return false;
          }

          // Don't retry POST/PUT/PATCH requests unless explicitly configured
          const isIdempotent = ['GET', 'HEAD', 'OPTIONS'].includes(config.method ?? 'GET');
          return isIdempotent || Boolean(config.idempotencyKey);
        },
        onRetry: (error, attempt, delay) => {
          console.warn(
            `Request retry ${attempt} after ${delay}ms delay:`,
            error instanceof Error ? error.message : String(error)
          );
        },
      }
    );
  }

  /**
   * GET request
   */
  async get<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'GET',
      url,
      params,
    });
  }

  /**
   * POST request
   */
  async post<T>(
    url: string,
    data?: unknown,
    options?: { idempotencyKey?: string }
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'POST',
      url,
      data,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  /**
   * PUT request
   */
  async put<T>(
    url: string,
    data?: unknown,
    options?: { idempotencyKey?: string }
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      url,
      data,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(url: string): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      url,
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(
    url: string,
    data?: unknown,
    options?: { idempotencyKey?: string }
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PATCH',
      url,
      data,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  /**
   * Get client configuration
   */
  getConfig(): Required<SDKConfig> {
    return { ...this.config };
  }

  /**
   * Get rate limiter status
   */
  getRateLimitStatus(): ReturnType<RateLimiter['getStatus']> {
    return this.rateLimiter.getStatus();
  }

  /**
   * Get clock synchronization status
   */
  getClockSyncStatus(): ReturnType<ClockSynchronizer['getStatus']> {
    return this.clockSync.getStatus();
  }

  /**
   * Manually sync clock with server
   */
  async syncClock(): Promise<void> {
    await this.clockSync.sync(async () => {
      const response = await this.makeRawRequest('/time', 'GET');
      const data = (await response.json()) as { timestamp: number };
      return data.timestamp;
    });
  }

  /**
   * Update session token
   */
  setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  /**
   * Clear session token
   */
  clearSessionToken(): void {
    this.sessionToken = undefined;
  }

  /**
   * Make the actual HTTP request
   */
  private async makeRequest<T>(
    config: RequestConfig,
    idempotencyKey: string
  ): Promise<ApiResponse<T>> {
    const url = new URL(config.url, this.config.baseUrl);
    
    // Add query parameters
    if (config.params) {
      Object.entries(config.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const headers = await this.buildHeaders(config, idempotencyKey);
    
    const requestConfig: RequestInit = {
      method: config.method ?? 'GET',
      headers,
      signal: AbortSignal.timeout(config.timeout ?? this.config.timeout),
    };

    // Add body for non-GET requests
    if (config.data && !['GET', 'HEAD'].includes(config.method ?? 'GET')) {
      requestConfig.body = JSON.stringify(config.data);
    }

    try {
      const response = await fetch(url.toString(), requestConfig);
      
      // Update rate limiter from headers
      this.rateLimiter.updateFromHeaders(this.headersToRecord(response.headers));
      
      // Mark idempotency key as used
      this.idempotencyKeys.add(idempotencyKey);
      
      return await this.handleResponse<T>(response);
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new TimeoutError(
          'Request timeout',
          config.timeout ?? this.config.timeout,
          { operation: `${config.method ?? 'GET'} ${config.url}` }
        );
      }
      
      throw new NetworkError('Network request failed', {
        cause: error as Error,
        details: { url: url.toString(), method: config.method },
      });
    }
  }

  /**
   * Make raw HTTP request without SDK features
   */
  private async makeRawRequest(
    path: string,
    method: HTTPMethod = 'GET'
  ): Promise<Response> {
    const url = new URL(path, this.config.baseUrl);
    
    const response = await fetch(url.toString(), {
      method,
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`, {
        statusCode: response.status,
      });
    }

    return response;
  }

  /**
   * Handle HTTP response
   */
  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('content-type') ?? '';
    
    let responseData: unknown;
    try {
      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
    } catch (error) {
      throw new NetworkError('Failed to parse response', {
        statusCode: response.status,
        cause: error as Error,
      });
    }

    if (!response.ok) {
      throw ErrorFactory.fromHttpStatus(
        response.status,
        this.extractErrorMessage(responseData),
        { response: responseData }
      );
    }

    // Validate response structure
    if (this.isApiResponse(responseData)) {
      return responseData as ApiResponse<T>;
    }

    // Wrap non-standard responses
    return {
      success: true,
      data: responseData as T,
      timestamp: this.timestampGenerator.generate(),
    };
  }

  /**
   * Build request headers
   */
  private async buildHeaders(
    config: RequestConfig,
    idempotencyKey: string
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'DXtrade-SDK/1.0.0',
      'X-Idempotency-Key': idempotencyKey,
      ...config.headers,
    };

    // Add authentication headers
    await this.addAuthHeaders(headers, config);

    // Add timestamp if clock sync is enabled
    if (this.clockSync.getStatus().enabled) {
      headers['X-Timestamp'] = this.timestampGenerator.generate().toString();
    }

    return headers;
  }

  /**
   * Add authentication headers based on auth type
   */
  private async addAuthHeaders(
    headers: Record<string, string>,
    config: RequestConfig
  ): Promise<void> {
    const auth = this.config.auth;

    switch (auth.type) {
      case 'session':
        if (this.sessionToken) {
          headers['Authorization'] = `Session ${this.sessionToken}`;
        } else {
          throw new AuthError('Session token not available');
        }
        break;

      case 'bearer':
        headers['Authorization'] = `Bearer ${auth.token}`;
        break;

      case 'hmac':
        await this.addHmacAuthHeaders(headers, config, auth);
        break;

      case 'credentials':
        // Credentials auth typically requires initial login request
        if (this.sessionToken) {
          headers['Authorization'] = `Session ${this.sessionToken}`;
        } else {
          throw new AuthError('Session token required for credentials auth');
        }
        break;
    }
  }

  /**
   * Add HMAC authentication headers
   */
  private async addHmacAuthHeaders(
    headers: Record<string, string>,
    config: RequestConfig,
    auth: Extract<AuthConfig, { type: 'hmac' }>
  ): Promise<void> {
    const timestamp = this.timestampGenerator.generate();
    const method = config.method ?? 'GET';
    const path = new URL(config.url, this.config.baseUrl).pathname;
    const body = config.data ? JSON.stringify(config.data) : '';

    // Create signature payload
    const payload = [
      method.toUpperCase(),
      path,
      timestamp.toString(),
      body,
    ].join('\n');

    // Generate HMAC signature
    const signature = createHmac('sha256', auth.secret)
      .update(payload)
      .digest('hex');

    headers['X-API-Key'] = auth.apiKey;
    headers['X-Timestamp'] = timestamp.toString();
    headers['X-Signature'] = signature;
  }

  /**
   * Initialize authentication
   */
  private async initializeAuth(): Promise<void> {
    if (this.config.auth.type === 'credentials') {
      await this.loginWithCredentials(this.config.auth);
    }
  }

  /**
   * Login with username/password credentials
   */
  private async loginWithCredentials(
    auth: Extract<AuthConfig, { type: 'credentials' }>
  ): Promise<void> {
    const loginData = {
      username: auth.username,
      password: auth.password,
      domain: auth.domain,
    };

    try {
      const response = await this.makeRawRequest('/auth/login', 'POST');
      const data = (await response.json()) as { token: string };
      
      this.sessionToken = data.token;
    } catch (error) {
      throw new AuthError('Failed to authenticate with credentials', {
        cause: error as Error,
      });
    }
  }

  /**
   * Get default base URL for environment
   */
  private getDefaultBaseUrl(environment: 'demo' | 'live'): string {
    return environment === 'demo' 
      ? 'https://demo-api.dx.trade/api/v1'
      : 'https://api.dx.trade/api/v1';
  }

  /**
   * Generate unique idempotency key
   */
  private generateIdempotencyKey(): string {
    return `sdk-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Convert Headers object to plain record
   */
  private headersToRecord(headers: Headers): Record<string, string> {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key.toLowerCase()] = value;
    });
    return record;
  }

  /**
   * Extract error message from response data
   */
  private extractErrorMessage(data: unknown): string {
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      
      if (typeof obj.message === 'string') {
        return obj.message;
      }
      
      if (typeof obj.error === 'string') {
        return obj.error;
      }
      
      if (Array.isArray(obj.errors) && obj.errors.length > 0) {
        const firstError = obj.errors[0];
        if (typeof firstError === 'object' && firstError !== null) {
          const errorObj = firstError as Record<string, unknown>;
          if (typeof errorObj.message === 'string') {
            return errorObj.message;
          }
        }
      }
    }
    
    return 'Unknown error occurred';
  }

  /**
   * Type guard for API response
   */
  private isApiResponse(data: unknown): data is ApiResponse<unknown> {
    return (
      typeof data === 'object' &&
      data !== null &&
      'success' in data &&
      typeof (data as { success: unknown }).success === 'boolean'
    );
  }

  /**
   * Validate request configuration
   */
  private validateRequestConfig(config: RequestConfig): void {
    if (!config.url) {
      throw new ValidationError('URL is required', [
        { field: 'url', message: 'URL cannot be empty' },
      ]);
    }

    if (config.timeout && config.timeout < 1000) {
      throw new ValidationError('Timeout too short', [
        { field: 'timeout', message: 'Timeout must be at least 1000ms' },
      ]);
    }
  }
}