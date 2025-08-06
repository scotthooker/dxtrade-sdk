import { z } from 'zod';

/**
 * Base response schema for all DXtrade API responses
 */
export const BaseResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  timestamp: z.number().optional(),
});

/**
 * Paginated response schema
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  BaseResponseSchema.extend({
    data: z.array(dataSchema),
    pagination: z
      .object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      })
      .optional(),
  });

/**
 * Environment types for API endpoints
 */
export const EnvironmentSchema = z.enum(['demo', 'live']);
export type Environment = z.infer<typeof EnvironmentSchema>;

/**
 * Authentication configuration
 */
export const AuthConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session'),
    token: z.string(),
  }),
  z.object({
    type: z.literal('bearer'),
    token: z.string(),
  }),
  z.object({
    type: z.literal('hmac'),
    apiKey: z.string(),
    secret: z.string(),
  }),
  z.object({
    type: z.literal('credentials'),
    username: z.string(),
    password: z.string(),
    domain: z.string().optional(),
  }),
]);

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

/**
 * SDK configuration
 */
export const SDKConfigSchema = z.object({
  environment: EnvironmentSchema.default('demo'),
  auth: AuthConfigSchema,
  baseUrl: z.string().url().optional(),
  timeout: z.number().min(1000).max(60000).default(30000),
  retries: z.number().min(0).max(10).default(3),
  rateLimit: z
    .object({
      requests: z.number().min(1),
      window: z.number().min(1000),
    })
    .default({ requests: 100, window: 60000 }),
});

export type SDKConfig = z.infer<typeof SDKConfigSchema>;

/**
 * HTTP methods
 */
export const HTTPMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
export type HTTPMethod = z.infer<typeof HTTPMethodSchema>;

/**
 * Request configuration
 */
export const RequestConfigSchema = z.object({
  method: HTTPMethodSchema.default('GET'),
  url: z.string(),
  headers: z.record(z.string()).optional(),
  params: z.record(z.unknown()).optional(),
  data: z.unknown().optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
  idempotencyKey: z.string().optional(),
});

export type RequestConfig = z.infer<typeof RequestConfigSchema>;

/**
 * Clock sync configuration
 */
export const ClockSyncSchema = z.object({
  enabled: z.boolean().default(true),
  maxDrift: z.number().default(5000), // 5 seconds
  syncInterval: z.number().default(300000), // 5 minutes
});

export type ClockSync = z.infer<typeof ClockSyncSchema>;

/**
 * Rate limiter state
 */
export const RateLimiterStateSchema = z.object({
  requests: z.array(z.number()),
  resetTime: z.number().optional(),
});

export type RateLimiterState = z.infer<typeof RateLimiterStateSchema>;

/**
 * Exponential backoff configuration
 */
export const BackoffConfigSchema = z.object({
  initialDelay: z.number().default(1000),
  maxDelay: z.number().default(30000),
  multiplier: z.number().default(2),
  jitter: z.boolean().default(true),
  maxAttempts: z.number().default(5),
});

export type BackoffConfig = z.infer<typeof BackoffConfigSchema>;

/**
 * Generic API response type
 */
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  timestamp?: number;
  errors?: Array<{ field?: string; message: string }>;
};

/**
 * Utility type for making properties optional except for specified keys
 */
export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

/**
 * Utility type for strict object keys
 */
export type StrictRecord<K extends string | number | symbol, V> = {
  [P in K]: V;
};