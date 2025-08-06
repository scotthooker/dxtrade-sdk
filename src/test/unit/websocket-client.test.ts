import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PushClient } from '../../websocket/push-client.js';
import { MockWebSocketServer } from '../mocks/mock-server.js';
import { WebSocketError, AuthError } from '../../errors/index.js';
import type { PushClientConfig } from '../../websocket/push-client.js';

describe('PushClient', () => {
  let mockServer: MockWebSocketServer;
  let pushClient: PushClient;
  let config: PushClientConfig;
  let serverPort: number;

  beforeEach(async () => {
    mockServer = new MockWebSocketServer();
    serverPort = await mockServer.start();

    config = {
      websocket: {
        url: `ws://localhost:${serverPort}`,
        heartbeatInterval: 1000,
        reconnectDelay: 100,
        maxReconnectDelay: 1000,
        maxReconnectAttempts: 3,
        pingTimeout: 5000,
        pongTimeout: 2000,
        maxQueueSize: 100,
        enableBackfill: true,
        backfillLimit: 50,
      },
      auth: {
        type: 'bearer',
        token: 'test-token',
      },
      autoResubscribe: true,
      bufferUpdates: false, // Disable for easier testing
      bufferInterval: 50,
    };

    pushClient = new PushClient(config);
  });

  afterEach(async () => {
    if (pushClient) {
      pushClient.destroy();
    }
    
    if (mockServer) {
      await mockServer.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      expect(pushClient).toBeDefined();
      expect(pushClient.isReady()).toBe(false);
    });

    it('should validate configuration', () => {
      expect(() => {
        new PushClient({
          websocket: {
            url: 'invalid-url',
          },
          auth: {
            type: 'bearer',
            token: 'test',
          },
        });
      }).toThrow();
    });
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      const connectPromise = pushClient.connect();
      
      // Wait for connection event on server
      await new Promise<void>((resolve) => {
        mockServer.once('connection', () => resolve());
      });

      await connectPromise;
      
      // Should trigger authentication automatically
      await new Promise<void>((resolve) => {
        pushClient.once('authenticated', () => resolve());
      });

      expect(pushClient.isReady()).toBe(true);
    });

    it('should handle connection failure', async () => {
      await mockServer.stop();
      
      await expect(pushClient.connect()).rejects.toThrow();
    });

    it('should disconnect gracefully', async () => {
      await pushClient.connect();
      
      await new Promise<void>((resolve) => {
        pushClient.once('authenticated', () => resolve());
      });

      await pushClient.disconnect();
      
      expect(pushClient.isReady()).toBe(false);
    });

    it('should handle server disconnection', async () => {
      await pushClient.connect();
      
      await new Promise<void>((resolve) => {
        pushClient.once('authenticated', () => resolve());
      });

      // Server disconnects client
      mockServer.disconnectAll();
      
      await new Promise<void>((resolve) => {
        pushClient.once('close', () => resolve());
      });

      expect(pushClient.isReady()).toBe(false);
    });
  });

  describe('authentication', () => {
    it('should authenticate with valid token', async () => {
      await pushClient.connect();
      
      const authenticated = await new Promise<boolean>((resolve) => {
        pushClient.once('authenticated', () => resolve(true));
        pushClient.once('error', () => resolve(false));
        
        setTimeout(() => resolve(false), 2000); // Timeout
      });

      expect(authenticated).toBe(true);
    });

    it('should handle authentication failure', async () => {
      const badConfig = {
        ...config,
        auth: { type: 'bearer' as const, token: '' },
      };
      const badClient = new PushClient(badConfig);

      await badClient.connect();
      
      const authFailed = await new Promise<boolean>((resolve) => {
        badClient.once('error', (error) => {
          resolve(error.message.includes('Invalid token'));
        });
        
        setTimeout(() => resolve(false), 2000);
      });

      expect(authFailed).toBe(true);
      badClient.destroy();
    });
  });

  describe('subscriptions', () => {
    beforeEach(async () => {
      await pushClient.connect();
      
      await new Promise<void>((resolve) => {
        pushClient.once('authenticated', () => resolve());
      });
    });

    it('should subscribe to quotes', async () => {
      const symbols = ['EURUSD', 'GBPUSD'];
      
      const subscribed = new Promise<void>((resolve) => {
        pushClient.once('subscribed', (channel, subscribedSymbols) => {
          expect(channel).toBe('quotes');
          expect(subscribedSymbols).toEqual(symbols);
          resolve();
        });
      });

      pushClient.subscribeToQuotes(symbols);
      
      await subscribed;
    });

    it('should receive quote updates', async () => {
      const symbols = ['EURUSD'];
      
      pushClient.subscribeToQuotes(symbols);
      
      await new Promise<void>((resolve) => {
        pushClient.once('subscribed', () => resolve());
      });

      const quoteReceived = new Promise<void>((resolve) => {
        pushClient.once('quote', (quoteData) => {
          expect(quoteData.symbol).toBe('EURUSD');
          expect(quoteData.bid).toBeTypeOf('number');
          expect(quoteData.ask).toBeTypeOf('number');
          expect(quoteData.timestamp).toBeTypeOf('number');
          resolve();
        });
      });

      // Server will automatically start sending quotes after subscription
      await quoteReceived;
    });

    it('should subscribe to order book', async () => {
      const config = {
        symbols: ['EURUSD'],
        depth: 5,
        aggregateLevel: 0,
      };
      
      const subscribed = new Promise<void>((resolve) => {
        mockServer.once('subscribe', (client, channel, symbols) => {
          expect(channel).toBe('orderbook');
          expect(symbols).toEqual(['EURUSD']);
          resolve();
        });
      });

      pushClient.subscribeToOrderBook(config);
      
      await subscribed;
    });

    it('should unsubscribe from channels', async () => {
      const symbols = ['EURUSD'];
      
      pushClient.subscribeToQuotes(symbols);
      
      await new Promise<void>((resolve) => {
        pushClient.once('subscribed', () => resolve());
      });

      const unsubscribed = new Promise<void>((resolve) => {
        pushClient.once('unsubscribed', (channel, unsubscribedSymbols) => {
          expect(channel).toBe('quotes');
          expect(unsubscribedSymbols).toEqual(symbols);
          resolve();
        });
      });

      pushClient.unsubscribeFromQuotes(symbols);
      
      await unsubscribed;
    });

    it('should validate subscription parameters', () => {
      expect(() => {
        pushClient.subscribeToQuotes([]);
      }).toThrow('At least one symbol is required');

      expect(() => {
        pushClient.subscribeToQuotes(new Array(101).fill('SYMBOL'));
      }).toThrow('Too many symbols');
    });
  });

  describe('heartbeat mechanism', () => {
    beforeEach(async () => {
      await pushClient.connect();
      
      await new Promise<void>((resolve) => {
        pushClient.once('authenticated', () => resolve());
      });
    });

    it('should send and receive heartbeats', async () => {
      const heartbeatReceived = new Promise<void>((resolve) => {
        pushClient.once('heartbeat', (timestamp) => {
          expect(timestamp).toBeTypeOf('number');
          expect(timestamp).toBeGreaterThan(0);
          resolve();
        });
      });

      // Heartbeat should be sent automatically
      await heartbeatReceived;
    });

    it('should handle heartbeat timeout', async () => {
      // Create client with very short ping timeout
      const timeoutConfig = {
        ...config,
        websocket: {
          ...config.websocket,
          heartbeatInterval: 100,
          pingTimeout: 50,
          pongTimeout: 50,
        },
      };
      
      const timeoutClient = new PushClient(timeoutConfig);
      await timeoutClient.connect();
      
      await new Promise<void>((resolve) => {
        timeoutClient.once('authenticated', () => resolve());
      });

      // Stop server from responding to heartbeats
      mockServer.removeAllListeners('message');

      const errorReceived = new Promise<boolean>((resolve) => {
        timeoutClient.once('error', (error) => {
          resolve(error.message.includes('timeout') || error.message.includes('Heartbeat'));
        });
        
        setTimeout(() => resolve(false), 1000);
      });

      expect(await errorReceived).toBe(true);
      timeoutClient.destroy();
    });
  });

  describe('reconnection logic', () => {
    it('should reconnect after disconnection', async () => {
      await pushClient.connect();
      
      await new Promise<void>((resolve) => {
        pushClient.once('authenticated', () => resolve());
      });

      // Force disconnection
      mockServer.disconnectAll();
      
      await new Promise<void>((resolve) => {
        pushClient.once('close', () => resolve());
      });

      // Should attempt reconnection
      const reconnected = new Promise<boolean>((resolve) => {
        let reconnecting = false;
        
        pushClient.once('reconnecting', () => {
          reconnecting = true;
        });
        
        pushClient.once('reconnected', () => {
          resolve(reconnecting);
        });
        
        setTimeout(() => resolve(false), 2000);
      });

      expect(await reconnected).toBe(true);
    });

    it('should respect max reconnection attempts', async () => {
      const limitedConfig = {
        ...config,
        websocket: {
          ...config.websocket,
          maxReconnectAttempts: 1,
          reconnectDelay: 50,
        },
      };
      
      const limitedClient = new PushClient(limitedConfig);
      await limitedClient.connect();
      
      await new Promise<void>((resolve) => {
        limitedClient.once('authenticated', () => resolve());
      });

      // Stop server to prevent reconnection
      await mockServer.stop();

      const maxAttemptsReached = new Promise<boolean>((resolve) => {
        let reconnectAttempts = 0;
        
        limitedClient.on('reconnecting', () => {
          reconnectAttempts++;
        });
        
        limitedClient.once('error', (error) => {
          const isMaxAttemptsError = error.message.includes('Max') || 
                                    error.message.includes('attempts') ||
                                    reconnectAttempts >= 1;
          resolve(isMaxAttemptsError);
        });
        
        setTimeout(() => resolve(false), 2000);
      });

      expect(await maxAttemptsReached).toBe(true);
      limitedClient.destroy();
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await pushClient.connect();
      
      await new Promise<void>((resolve) => {
        pushClient.once('authenticated', () => resolve());
      });
    });

    it('should handle malformed messages gracefully', async () => {
      const errorReceived = new Promise<boolean>((resolve) => {
        pushClient.once('error', (error) => {
          resolve(error.message.includes('parse'));
        });
      });

      // Send invalid JSON from server
      for (const client of mockServer['clients']) {
        client.send('invalid json');
      }

      expect(await errorReceived).toBe(true);
    });

    it('should handle error messages from server', async () => {
      const errorReceived = new Promise<void>((resolve) => {
        pushClient.once('error', (error) => {
          expect(error.message).toBe('Test error');
          resolve();
        });
      });

      // Send error message from server
      mockServer.broadcast({
        type: 'ERROR',
        data: {
          code: 400,
          message: 'Test error',
        },
        timestamp: Date.now(),
      });

      await errorReceived;
    });
  });

  describe('statistics and status', () => {
    it('should provide connection statistics', () => {
      const stats = pushClient.getStats();
      
      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('reconnectAttempt');
      expect(stats).toHaveProperty('authenticated');
      expect(stats).toHaveProperty('queueSize');
      expect(stats).toHaveProperty('subscriptions');
      expect(stats).toHaveProperty('bufferSize');
    });

    it('should track subscriptions', async () => {
      await pushClient.connect();
      
      await new Promise<void>((resolve) => {
        pushClient.once('authenticated', () => resolve());
      });

      expect(pushClient.getSubscriptions()).toHaveLength(0);

      pushClient.subscribeToQuotes(['EURUSD']);
      
      await new Promise<void>((resolve) => {
        pushClient.once('subscribed', () => resolve());
      });

      const subscriptions = pushClient.getSubscriptions();
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0]?.channel).toBe('quotes');
      expect(subscriptions[0]?.symbols).toContain('EURUSD');
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources on destroy', async () => {
      await pushClient.connect();
      
      await new Promise<void>((resolve) => {
        pushClient.once('authenticated', () => resolve());
      });

      const stats = pushClient.getStats();
      expect(stats.state).toBe('OPEN');

      pushClient.destroy();

      // Should be cleaned up
      expect(pushClient.getSubscriptions()).toHaveLength(0);
      expect(pushClient.getStats().queueSize).toBe(0);
      expect(pushClient.isReady()).toBe(false);
    });
  });
});