import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DXTradeClient, createDemoClient, createLiveClient } from '../../client.js';
import { MockWebSocketServer, MockFetch, MockHttpResponse } from '../mocks/mock-server.js';
import type { DXTradeClientConfig } from '../../client.js';

// Mock global fetch
const mockFetch = new MockFetch();
global.fetch = mockFetch.fetch;

describe('DXTradeClient', () => {
  let client: DXTradeClient;
  let config: DXTradeClientConfig;
  let mockServer: MockWebSocketServer;
  let serverPort: number;

  beforeEach(async () => {
    mockServer = new MockWebSocketServer();
    serverPort = await mockServer.start();

    config = {
      environment: 'demo',
      auth: {
        type: 'bearer',
        token: 'test-token',
      },
      websocket: {
        enabled: true,
        heartbeatInterval: 1000,
        reconnectDelay: 100,
        maxReconnectDelay: 1000,
        maxReconnectAttempts: 2,
      },
      enablePushAPI: true,
    };

    // Override WebSocket URL to use mock server
    client = new DXTradeClient(config);
    if (client.push) {
      // Replace the URL in the connection manager
      (client.push as any).connectionManager.config.url = `ws://localhost:${serverPort}`;
    }

    mockFetch.clear();
  });

  afterEach(async () => {
    if (client) {
      client.destroy();
    }
    
    if (mockServer) {
      await mockServer.stop();
    }
    
    mockFetch.clear();
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      expect(client).toBeDefined();
      expect(client.http).toBeDefined();
      expect(client.accounts).toBeDefined();
      expect(client.instruments).toBeDefined();
      expect(client.orders).toBeDefined();
      expect(client.positions).toBeDefined();
      expect(client.push).toBeDefined();
    });

    it('should initialize without WebSocket when disabled', () => {
      const configWithoutWS = { ...config, enablePushAPI: false };
      const clientWithoutWS = new DXTradeClient(configWithoutWS);
      
      expect(clientWithoutWS.push).toBeUndefined();
      
      clientWithoutWS.destroy();
    });

    it('should set correct base URL for demo environment', () => {
      expect(client.config.baseUrl).toBe('https://demo-api.dx.trade/api/v1');
    });

    it('should set correct base URL for live environment', () => {
      const liveConfig = { ...config, environment: 'live' as const };
      const liveClient = new DXTradeClient(liveConfig);
      
      expect(liveClient.config.baseUrl).toBe('https://api.dx.trade/api/v1');
      
      liveClient.destroy();
    });
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      // Mock time endpoint for clock sync
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));

      await client.connect();

      // WebSocket should connect and authenticate
      if (client.push) {
        await new Promise<void>((resolve) => {
          client.push!.once('authenticated', () => resolve());
        });

        expect(client.isReady()).toBe(true);
      }
    });

    it('should handle connection without WebSocket', async () => {
      const configWithoutWS = { ...config, enablePushAPI: false };
      const clientWithoutWS = new DXTradeClient(configWithoutWS);

      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));

      await clientWithoutWS.connect();

      expect(clientWithoutWS.isReady()).toBe(true);
      
      clientWithoutWS.destroy();
    });

    it('should disconnect gracefully', async () => {
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));

      await client.connect();

      if (client.push) {
        await new Promise<void>((resolve) => {
          client.push!.once('authenticated', () => resolve());
        });
      }

      await client.disconnect();

      expect(client.isReady()).toBe(false);
    });
  });

  describe('health check', () => {
    it('should perform comprehensive health check', async () => {
      // Mock health endpoint
      mockFetch.mockResponse('/health', new MockHttpResponse(200, { status: 'ok' }));

      const health = await client.healthCheck();

      expect(health).toHaveProperty('http');
      expect(health).toHaveProperty('overall');
      expect(health.http.healthy).toBe(true);
      expect(health.http.latency).toBeGreaterThan(0);

      if (client.push) {
        expect(health).toHaveProperty('websocket');
        expect(health.websocket).toBeDefined();
      }
    });

    it('should handle HTTP health check failure', async () => {
      mockFetch.mockResponse('/health', new MockHttpResponse(500, { error: 'Server error' }));

      const health = await client.healthCheck();

      expect(health.http.healthy).toBe(false);
      expect(health.http.error).toBeDefined();
      expect(health.overall).toBe(false);
    });
  });

  describe('status reporting', () => {
    it('should provide comprehensive status', () => {
      const status = client.getStatus();

      expect(status).toHaveProperty('http');
      expect(status).toHaveProperty('ready');
      expect(status.http).toHaveProperty('rateLimitStatus');
      expect(status.http).toHaveProperty('clockSyncStatus');

      if (client.push) {
        expect(status).toHaveProperty('websocket');
      }
    });

    it('should report ready status correctly', async () => {
      expect(client.isReady()).toBe(false);

      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));

      await client.connect();

      if (client.push) {
        await new Promise<void>((resolve) => {
          client.push!.once('authenticated', () => resolve());
        });

        expect(client.isReady()).toBe(true);
      }
    });
  });

  describe('authentication management', () => {
    it('should set session token', () => {
      const newToken = 'new-session-token';
      
      client.setSessionToken(newToken);
      
      // Token should be set on HTTP client
      // (Implementation detail - would need to verify actual behavior)
      expect(() => client.setSessionToken(newToken)).not.toThrow();
    });

    it('should clear session token', () => {
      client.setSessionToken('test-token');
      client.clearSessionToken();
      
      // Should not throw
      expect(() => client.clearSessionToken()).not.toThrow();
    });
  });

  describe('API modules', () => {
    it('should have all REST API modules', () => {
      expect(client.accounts).toBeDefined();
      expect(client.instruments).toBeDefined();
      expect(client.orders).toBeDefined();
      expect(client.positions).toBeDefined();
    });

    it('should have WebSocket client when enabled', () => {
      expect(client.push).toBeDefined();
    });

    it('should share HTTP client across modules', () => {
      // All modules should use the same HTTP client instance
      expect((client.accounts as any).httpClient).toBe(client.http);
      expect((client.instruments as any).httpClient).toBe(client.http);
      expect((client.orders as any).httpClient).toBe(client.http);
      expect((client.positions as any).httpClient).toBe(client.http);
    });
  });

  describe('factory functions', () => {
    afterEach(() => {
      // Clean up any clients created by factory functions
      mockFetch.clear();
    });

    it('should create demo client with defaults', () => {
      const demoClient = createDemoClient({
        type: 'bearer',
        token: 'demo-token',
      });

      expect(demoClient.config.environment).toBe('demo');
      expect(demoClient.config.baseUrl).toContain('demo');
      expect(demoClient.push).toBeDefined();

      demoClient.destroy();
    });

    it('should create live client with defaults', () => {
      const liveClient = createLiveClient({
        type: 'bearer',
        token: 'live-token',
      });

      expect(liveClient.config.environment).toBe('live');
      expect(liveClient.config.baseUrl).not.toContain('demo');
      expect(liveClient.push).toBeDefined();

      liveClient.destroy();
    });

    it('should override defaults in factory functions', () => {
      const customClient = createDemoClient(
        { type: 'bearer', token: 'test' },
        { timeout: 60000 }
      );

      expect(customClient.config.timeout).toBe(60000);

      customClient.destroy();
    });
  });

  describe('error handling', () => {
    it('should handle WebSocket URL generation', () => {
      // Should not throw when generating WebSocket URLs
      expect(() => new DXTradeClient(config)).not.toThrow();
    });

    it('should handle auth config mapping', () => {
      // Test different auth types
      const hmacConfig = {
        ...config,
        auth: {
          type: 'hmac' as const,
          apiKey: 'key',
          secret: 'secret',
        },
      };

      expect(() => new DXTradeClient(hmacConfig)).not.toThrow();
    });

    it('should validate configuration', () => {
      expect(() => {
        new DXTradeClient({
          environment: 'demo',
          auth: {
            type: 'bearer',
            token: '', // Empty token should be caught by Zod validation
          },
        });
      }).toThrow();
    });
  });

  describe('cleanup', () => {
    it('should destroy client and cleanup resources', async () => {
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));

      await client.connect();

      if (client.push) {
        await new Promise<void>((resolve) => {
          client.push!.once('authenticated', () => resolve());
        });
      }

      // Should not throw
      expect(() => client.destroy()).not.toThrow();
      
      // Client should no longer be ready
      expect(client.isReady()).toBe(false);
    });

    it('should handle destroy without connection', () => {
      // Should not throw even if never connected
      expect(() => client.destroy()).not.toThrow();
    });
  });

  describe('configuration validation', () => {
    it('should validate WebSocket configuration', () => {
      const invalidConfig = {
        ...config,
        websocket: {
          ...config.websocket,
          heartbeatInterval: -1, // Invalid
        },
      };

      expect(() => new DXTradeClient(invalidConfig)).toThrow();
    });

    it('should validate authentication configuration', () => {
      expect(() => {
        new DXTradeClient({
          ...config,
          auth: {
            type: 'invalid' as any,
          },
        });
      }).toThrow();
    });

    it('should validate environment configuration', () => {
      expect(() => {
        new DXTradeClient({
          ...config,
          environment: 'invalid' as any,
        });
      }).toThrow();
    });
  });
});