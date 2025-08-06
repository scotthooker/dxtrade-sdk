import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpClient } from '../../core/http-client.js';
import { NetworkError, AuthError, ValidationError, TimeoutError } from '../../errors/index.js';
import { MockFetch, MockHttpResponse } from '../mocks/mock-server.js';
import type { SDKConfig } from '../../types/common.js';

// Mock global fetch
const mockFetch = new MockFetch();
global.fetch = mockFetch.fetch;

describe('HttpClient', () => {
  let httpClient: HttpClient;
  let config: SDKConfig;

  beforeEach(() => {
    config = {
      environment: 'demo' as const,
      auth: {
        type: 'bearer' as const,
        token: 'test-token',
      },
      timeout: 30000,
      retries: 3,
      rateLimit: {
        requests: 100,
        window: 60000,
      },
    };

    mockFetch.clear();
    
    // Mock the time endpoint for clock sync
    mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));
    
    httpClient = new HttpClient(config);
    
    // Clear the request log after construction to remove clock sync request
    mockFetch.clearLog();
  });

  afterEach(() => {
    mockFetch.clear();
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      expect(httpClient).toBeDefined();
      expect(httpClient.getConfig()).toEqual({
        ...config,
        baseUrl: 'https://demo-api.dx.trade/api/v1',
      });
    });

    it('should use custom base URL when provided', () => {
      const customConfig = {
        ...config,
        baseUrl: 'https://custom-api.example.com/v1',
      };
      const client = new HttpClient(customConfig);
      expect(client.getConfig().baseUrl).toBe('https://custom-api.example.com/v1');
    });

    it('should set live environment base URL', () => {
      const liveConfig = { ...config, environment: 'live' as const };
      const client = new HttpClient(liveConfig);
      expect(client.getConfig().baseUrl).toBe('https://api.dx.trade/api/v1');
    });
  });

  describe('request method', () => {
    it('should make successful GET request', async () => {
      const responseData = { test: 'value' };
      mockFetch.mockResponse('/test', new MockHttpResponse(200, responseData));

      const result = await httpClient.get('/test');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(responseData);
      
      const requests = mockFetch.getRequestLog();
      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toContain('/test');
      expect(requests[0]?.options?.method).toBe('GET');
    });

    it('should make successful POST request with data', async () => {
      const requestData = { name: 'test' };
      const responseData = { id: 1 };
      mockFetch.mockResponse('/create', new MockHttpResponse(201, responseData));

      const result = await httpClient.post('/create', requestData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(responseData);
      
      const requests = mockFetch.getRequestLog();
      expect(requests).toHaveLength(1);
      expect(requests[0]?.options?.method).toBe('POST');
      expect(requests[0]?.options?.body).toBe(JSON.stringify(requestData));
    });

    it('should include authentication headers', async () => {
      mockFetch.mockResponse('/auth-test', new MockHttpResponse(200, { authenticated: true }));

      await httpClient.get('/auth-test');

      const requests = mockFetch.getRequestLog();
      const headers = requests[0]?.options?.headers as Record<string, string>;
      expect(headers?.['Authorization']).toBe('Bearer test-token');
    });

    it('should include idempotency key', async () => {
      mockFetch.mockResponse('/idempotent', new MockHttpResponse(200, { result: 'ok' }));

      await httpClient.post('/idempotent', {}, { idempotencyKey: 'test-key' });

      const requests = mockFetch.getRequestLog();
      const headers = requests[0]?.options?.headers as Record<string, string>;
      expect(headers?.['X-Idempotency-Key']).toBe('test-key');
    });

    it('should handle query parameters', async () => {
      mockFetch.mockResponse('/search', new MockHttpResponse(200, { results: [] }));

      await httpClient.get('/search', { q: 'test', page: 1 });

      const requests = mockFetch.getRequestLog();
      expect(requests[0]?.url).toContain('q=test');
      expect(requests[0]?.url).toContain('page=1');
    });
  });

  describe('error handling', () => {
    it('should throw NetworkError for HTTP errors', async () => {
      mockFetch.mockResponse('/error', new MockHttpResponse(500, { error: 'Server error' }));

      await expect(httpClient.get('/error')).rejects.toThrow(NetworkError);
    });

    it('should throw AuthError for 401 errors', async () => {
      mockFetch.mockResponse('/unauthorized', new MockHttpResponse(401, { error: 'Unauthorized' }));

      await expect(httpClient.get('/unauthorized')).rejects.toThrow(AuthError);
    });

    it('should throw ValidationError for 400 errors', async () => {
      mockFetch.mockResponse('/bad-request', new MockHttpResponse(400, { error: 'Bad request' }));

      await expect(httpClient.get('/bad-request')).rejects.toThrow(ValidationError);
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResponse('/malformed', {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.reject(new Error('Invalid JSON')),
        text: () => Promise.resolve('invalid json'),
      } as Response);

      await expect(httpClient.get('/malformed')).rejects.toThrow(NetworkError);
    });
  });

  describe('retry logic', () => {
    it('should retry on retryable errors', async () => {
      // First request fails, second succeeds
      mockFetch.mockResponse('/retry-test', new MockHttpResponse(503, { error: 'Service unavailable' }));
      mockFetch.mockResponse('/retry-test', new MockHttpResponse(200, { retried: true }));

      const result = await httpClient.get('/retry-test');

      expect(result.success).toBe(true);
      expect(mockFetch.getRequestLog()).toHaveLength(2);
    });

    it('should not retry non-retryable errors', async () => {
      mockFetch.mockResponse('/no-retry', new MockHttpResponse(400, { error: 'Bad request' }));

      await expect(httpClient.get('/no-retry')).rejects.toThrow(ValidationError);
      expect(mockFetch.getRequestLog()).toHaveLength(1);
    });

    it('should respect max retry attempts', async () => {
      // All requests fail
      for (let i = 0; i < 5; i++) {
        mockFetch.mockResponse('/max-retries', new MockHttpResponse(503, { error: 'Service unavailable' }));
      }

      await expect(httpClient.get('/max-retries')).rejects.toThrow(NetworkError);
      expect(mockFetch.getRequestLog()).toHaveLength(4); // 1 original + 3 retries
    });
  });

  describe('rate limiting', () => {
    it('should track rate limit status', () => {
      const status = httpClient.getRateLimitStatus();
      expect(status).toHaveProperty('limit', 100);
      expect(status).toHaveProperty('remaining');
      expect(status.remaining).toBeLessThanOrEqual(100);
    });

    it('should update rate limits from response headers', async () => {
      const headers = {
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': Math.floor((Date.now() + 60000) / 1000).toString(),
      };
      
      mockFetch.mockResponse('/rate-limit', new MockHttpResponse(200, { limited: false }, headers));

      await httpClient.get('/rate-limit');

      // Rate limiter should have been updated based on headers
      const status = httpClient.getRateLimitStatus();
      expect(status.remaining).toBeLessThan(100);
    });
  });

  describe('clock synchronization', () => {
    it('should get clock sync status', () => {
      const status = httpClient.getClockSyncStatus();
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('offset');
      expect(status).toHaveProperty('lastSync');
    });

    it('should sync clock with server', async () => {
      const serverTime = Date.now() + 5000; // 5 seconds ahead
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: serverTime }));

      await httpClient.syncClock();

      const status = httpClient.getClockSyncStatus();
      expect(status.lastSync).toBeGreaterThan(0);
      expect(Math.abs(status.offset)).toBeGreaterThan(0);
    });
  });

  describe('authentication types', () => {
    it('should handle session authentication', async () => {
      const sessionConfig = {
        ...config,
        auth: { type: 'session' as const, token: 'session-token' },
      };
      const client = new HttpClient(sessionConfig);
      client.setSessionToken('session-token');

      mockFetch.mockResponse('/session-test', new MockHttpResponse(200, { session: 'active' }));

      await client.get('/session-test');

      const requests = mockFetch.getRequestLog();
      const headers = requests[0]?.options?.headers as Record<string, string>;
      expect(headers?.['Authorization']).toBe('Session session-token');
    });

    it('should handle HMAC authentication', async () => {
      const hmacConfig = {
        ...config,
        auth: {
          type: 'hmac' as const,
          apiKey: 'test-key',
          secret: 'test-secret',
        },
      };
      const client = new HttpClient(hmacConfig);

      mockFetch.mockResponse('/hmac-test', new MockHttpResponse(200, { hmac: 'verified' }));

      await client.get('/hmac-test');

      const requests = mockFetch.getRequestLog();
      const headers = requests[0]?.options?.headers as Record<string, string>;
      expect(headers?.['X-API-Key']).toBe('test-key');
      expect(headers?.['X-Signature']).toBeDefined();
      expect(headers?.['X-Timestamp']).toBeDefined();
    });

    it('should handle credentials authentication', async () => {
      const credsConfig = {
        ...config,
        auth: {
          type: 'credentials' as const,
          username: 'testuser',
          password: 'testpass',
          domain: 'testdomain',
        },
      };

      // Mock login endpoint
      mockFetch.mockResponse('/auth/login', new MockHttpResponse(200, { token: 'session-token' }));

      const client = new HttpClient(credsConfig);

      // Should have performed login during initialization
      const requests = mockFetch.getRequestLog();
      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toContain('/auth/login');
    });
  });

  describe('request validation', () => {
    it('should validate empty URL', async () => {
      await expect(httpClient.request({
        method: 'GET',
        url: '',
      })).rejects.toThrow(ValidationError);
    });

    it('should validate timeout', async () => {
      await expect(httpClient.request({
        method: 'GET',
        url: '/test',
        timeout: 500, // Less than minimum
      })).rejects.toThrow(ValidationError);
    });
  });

  describe('idempotency handling', () => {
    it('should reject duplicate idempotency keys', async () => {
      const key = 'unique-key';
      
      mockFetch.mockResponse('/test', new MockHttpResponse(200, { value: 1 }));
      mockFetch.mockResponse('/test', new MockHttpResponse(200, { value: 2 }));

      await httpClient.post('/test', {}, { idempotencyKey: key });

      await expect(httpClient.post('/test', {}, { idempotencyKey: key }))
        .rejects.toThrow(ValidationError);
    });

    it('should generate unique idempotency keys', async () => {
      mockFetch.mockResponse('/test1', new MockHttpResponse(200, { id: 1 }));
      mockFetch.mockResponse('/test2', new MockHttpResponse(200, { id: 2 }));

      await httpClient.post('/test1', {});
      await httpClient.post('/test2', {});

      const requests = mockFetch.getRequestLog();
      const key1 = (requests[0]?.options?.headers as Record<string, string>)['X-Idempotency-Key'];
      const key2 = (requests[1]?.options?.headers as Record<string, string>)['X-Idempotency-Key'];
      
      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
    });
  });

  describe('convenience methods', () => {
    it('should support GET method', async () => {
      mockFetch.mockResponse('/get-test', new MockHttpResponse(200, { method: 'GET' }));

      const result = await httpClient.get('/get-test', { param: 'value' });

      expect(result.success).toBe(true);
      expect(result.data?.method).toBe('GET');
    });

    it('should support PUT method', async () => {
      mockFetch.mockResponse('/put-test', new MockHttpResponse(200, { method: 'PUT' }));

      const result = await httpClient.put('/put-test', { data: 'value' });

      expect(result.success).toBe(true);
      expect(result.data?.method).toBe('PUT');
    });

    it('should support DELETE method', async () => {
      mockFetch.mockResponse('/delete-test', new MockHttpResponse(200, { method: 'DELETE' }));

      const result = await httpClient.delete('/delete-test');

      expect(result.success).toBe(true);
      expect(result.data?.method).toBe('DELETE');
    });

    it('should support PATCH method', async () => {
      mockFetch.mockResponse('/patch-test', new MockHttpResponse(200, { method: 'PATCH' }));

      const result = await httpClient.patch('/patch-test', { data: 'value' });

      expect(result.success).toBe(true);
      expect(result.data?.method).toBe('PATCH');
    });
  });
});