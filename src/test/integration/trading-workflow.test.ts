import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DXTradeClient } from '../../client.js';
import { MockWebSocketServer, MockFetch, MockHttpResponse } from '../mocks/mock-server.js';
import type { Account, Instrument, Order, Position } from '../../types/trading.js';

// Mock global fetch
const mockFetch = new MockFetch();
global.fetch = mockFetch.fetch;

describe('Trading Workflow Integration', () => {
  let client: DXTradeClient;
  let mockServer: MockWebSocketServer;
  let serverPort: number;

  // Sample data
  const mockAccount: Account = {
    id: 'ACC123',
    name: 'Test Account',
    type: 'LIVE',
    balance: 10000,
    equity: 10500,
    margin: 500,
    freeMargin: 9500,
    marginLevel: 2100,
    currency: 'USD',
    leverage: 100,
    isActive: true,
    server: 'demo-server',
  };

  const mockInstrument: Instrument = {
    symbol: 'EURUSD',
    name: 'Euro vs US Dollar',
    type: 'FOREX',
    baseAsset: 'EUR',
    quoteAsset: 'USD',
    minSize: 0.01,
    maxSize: 100,
    stepSize: 0.01,
    tickSize: 0.00001,
    digits: 5,
    tradable: true,
    marginRate: 0.01,
    swapLong: -2.5,
    swapShort: 0.5,
  };

  beforeEach(async () => {
    mockServer = new MockWebSocketServer();
    serverPort = await mockServer.start();

    client = new DXTradeClient({
      environment: 'demo',
      auth: {
        type: 'bearer',
        token: 'test-token',
      },
      enablePushAPI: true,
    });

    // Override WebSocket URL
    if (client.push) {
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

  describe('Complete Trading Flow', () => {
    it('should complete a full trading workflow', async () => {
      // Step 1: Connect and authenticate
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));
      
      await client.connect();
      
      if (client.push) {
        await new Promise<void>((resolve) => {
          client.push!.once('authenticated', () => resolve());
        });
      }

      expect(client.isReady()).toBe(true);

      // Step 2: Get account information
      mockFetch.mockResponse('/accounts', new MockHttpResponse(200, {
        success: true,
        data: [mockAccount],
      }));

      const accounts = await client.accounts.getAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.id).toBe('ACC123');

      // Step 3: Get account balance
      mockFetch.mockResponse(`/accounts/${mockAccount.id}/balance`, new MockHttpResponse(200, {
        success: true,
        data: {
          accountId: mockAccount.id,
          currency: 'USD',
          balance: 10000,
          availableBalance: 9500,
          equity: 10500,
          margin: 500,
          freeMargin: 9500,
          marginLevel: 2100,
          profit: 500,
          timestamp: Date.now(),
        },
      }));

      const balance = await client.accounts.getAccountBalance(mockAccount.id);
      expect(balance.balance).toBe(10000);
      expect(balance.equity).toBe(10500);

      // Step 4: Get available instruments
      mockFetch.mockResponse('/instruments', new MockHttpResponse(200, {
        success: true,
        data: {
          instruments: [mockInstrument],
          pagination: {
            page: 1,
            limit: 100,
            total: 1,
            totalPages: 1,
          },
        },
      }));

      const instruments = await client.instruments.getInstruments();
      expect(instruments.instruments).toHaveLength(1);
      expect(instruments.instruments[0]?.symbol).toBe('EURUSD');

      // Step 5: Get current quote
      mockFetch.mockResponse('/instruments/EURUSD/quote', new MockHttpResponse(200, {
        success: true,
        data: {
          symbol: 'EURUSD',
          bid: 1.1000,
          ask: 1.1010,
          spread: 0.0010,
          timestamp: Date.now(),
        },
      }));

      const quote = await client.instruments.getQuote('EURUSD');
      expect(quote.symbol).toBe('EURUSD');
      expect(quote.bid).toBe(1.1000);
      expect(quote.ask).toBe(1.1010);

      // Step 6: Subscribe to real-time quotes
      if (client.push) {
        const quoteReceived = new Promise<void>((resolve) => {
          client.push!.once('quote', (quoteData) => {
            expect(quoteData.symbol).toBe('EURUSD');
            resolve();
          });
        });

        client.push.subscribeToQuotes(['EURUSD']);
        
        await new Promise<void>((resolve) => {
          client.push!.once('subscribed', () => resolve());
        });

        await quoteReceived;
      }

      // Step 7: Calculate margin requirement
      mockFetch.mockResponse(`/accounts/${mockAccount.id}/margin-requirement`, new MockHttpResponse(200, {
        success: true,
        data: {
          marginRequired: 110,
          marginCurrency: 'USD',
          marginRate: 0.01,
          availableMargin: 9500,
          marginLevel: 2100,
        },
      }));

      const marginReq = await client.accounts.calculateMarginRequirement(
        mockAccount.id,
        'EURUSD',
        1.0,
        'BUY'
      );
      expect(marginReq.marginRequired).toBe(110);

      // Step 8: Place a market order
      const orderRequest = {
        symbol: 'EURUSD',
        side: 'BUY' as const,
        type: 'MARKET' as const,
        quantity: 1.0,
        clientOrderId: 'test-order-1',
      };

      const mockOrder: Order = {
        id: 'ORDER123',
        clientOrderId: 'test-order-1',
        symbol: 'EURUSD',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1.0,
        status: 'FILLED',
        timeInForce: 'GTC',
        filledQuantity: 1.0,
        remainingQuantity: 0,
        averagePrice: 1.1005,
        commission: 0.5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockFetch.mockResponse(`/accounts/${mockAccount.id}/orders`, new MockHttpResponse(200, {
        success: true,
        data: mockOrder,
      }));

      const placedOrder = await client.orders.placeOrder(orderRequest, mockAccount.id);
      expect(placedOrder.id).toBe('ORDER123');
      expect(placedOrder.status).toBe('FILLED');

      // Step 9: Check positions
      const mockPosition: Position = {
        id: 'POS123',
        symbol: 'EURUSD',
        side: 'LONG',
        size: 1.0,
        entryPrice: 1.1005,
        markPrice: 1.1015,
        unrealizedPnl: 10,
        realizedPnl: 0,
        margin: 110,
        commission: 0.5,
        openTime: Date.now(),
      };

      mockFetch.mockResponse(`/accounts/${mockAccount.id}/positions`, new MockHttpResponse(200, {
        success: true,
        data: {
          positions: [mockPosition],
        },
      }));

      const positions = await client.positions.getPositions({ accountId: mockAccount.id });
      expect(positions.positions).toHaveLength(1);
      expect(positions.positions[0]?.symbol).toBe('EURUSD');
      expect(positions.positions[0]?.side).toBe('LONG');

      // Step 10: Subscribe to position updates
      if (client.push) {
        const positionUpdateReceived = new Promise<void>((resolve) => {
          client.push!.once('position', (positionData) => {
            expect(positionData.symbol).toBe('EURUSD');
            resolve();
          });
        });

        client.push.subscribeToPositions(mockAccount.id);
        
        // Simulate position update
        setTimeout(() => {
          mockServer.broadcast({
            type: 'POSITION_UPDATE',
            data: {
              symbol: 'EURUSD',
              side: 'LONG',
              size: 1.0,
              entryPrice: 1.1005,
              markPrice: 1.1020,
              unrealizedPnl: 15,
              timestamp: Date.now(),
            },
            timestamp: Date.now(),
          });
        }, 100);

        await positionUpdateReceived;
      }

      // Step 11: Close position
      mockFetch.mockResponse(`/accounts/${mockAccount.id}/positions/POS123/close`, new MockHttpResponse(200, {
        success: true,
        data: {
          position: {
            ...mockPosition,
            size: 0,
            unrealizedPnl: 0,
            realizedPnl: 15,
          },
          orderId: 'CLOSE_ORDER123',
        },
      }));

      const closeResult = await client.positions.closePosition({
        positionId: 'POS123',
      }, mockAccount.id);

      expect(closeResult.position.size).toBe(0);
      expect(closeResult.position.realizedPnl).toBe(15);
      expect(closeResult.orderId).toBe('CLOSE_ORDER123');
    });

    it('should handle order rejections gracefully', async () => {
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));
      await client.connect();

      // Mock rejected order
      mockFetch.mockResponse('/orders', new MockHttpResponse(400, {
        success: false,
        message: 'Insufficient margin',
        errors: [{ field: 'quantity', message: 'Exceeds available margin' }],
      }));

      const orderRequest = {
        symbol: 'EURUSD',
        side: 'BUY' as const,
        type: 'MARKET' as const,
        quantity: 100.0, // Too large
      };

      await expect(client.orders.placeOrder(orderRequest)).rejects.toThrow('Insufficient margin');
    });

    it('should handle network failures with retries', async () => {
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));
      await client.connect();

      // First request fails, second succeeds
      mockFetch.mockResponse('/accounts', new MockHttpResponse(503, { error: 'Service unavailable' }));
      mockFetch.mockResponse('/accounts', new MockHttpResponse(200, {
        success: true,
        data: [mockAccount],
      }));

      const accounts = await client.accounts.getAccounts();
      expect(accounts).toHaveLength(1);
      
      // Should have made 2 requests (1 original + 1 retry)
      expect(mockFetch.getRequestLog()).toHaveLength(3); // Including time sync
    });

    it('should handle WebSocket reconnection during trading', async () => {
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));
      await client.connect();

      if (!client.push) {
        return; // Skip if WebSocket not enabled
      }

      await new Promise<void>((resolve) => {
        client.push!.once('authenticated', () => resolve());
      });

      // Subscribe to quotes
      client.push.subscribeToQuotes(['EURUSD']);
      
      await new Promise<void>((resolve) => {
        client.push!.once('subscribed', () => resolve());
      });

      // Force disconnection
      mockServer.disconnectAll();
      
      await new Promise<void>((resolve) => {
        client.push!.once('close', () => resolve());
      });

      // Should reconnect and resubscribe
      const reconnected = new Promise<boolean>((resolve) => {
        let reconnecting = false;
        
        client.push!.once('reconnecting', () => {
          reconnecting = true;
        });
        
        client.push!.once('reconnected', () => {
          resolve(reconnecting);
        });
        
        setTimeout(() => resolve(false), 3000);
      });

      expect(await reconnected).toBe(true);

      // Should automatically resubscribe
      await new Promise<void>((resolve) => {
        client.push!.once('subscribed', () => resolve());
      });

      expect(client.push.getSubscriptions()).toHaveLength(1);
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle partial order fills', async () => {
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));
      await client.connect();

      const partialOrder: Order = {
        id: 'ORDER123',
        clientOrderId: 'partial-order',
        symbol: 'EURUSD',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10.0,
        price: 1.1000,
        status: 'PARTIALLY_FILLED',
        timeInForce: 'GTC',
        filledQuantity: 5.0,
        remainingQuantity: 5.0,
        averagePrice: 1.1000,
        commission: 0.25,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockFetch.mockResponse('/orders', new MockHttpResponse(200, {
        success: true,
        data: partialOrder,
      }));

      const order = await client.orders.placeOrder({
        symbol: 'EURUSD',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10.0,
        price: 1.1000,
        clientOrderId: 'partial-order',
      });

      expect(order.status).toBe('PARTIALLY_FILLED');
      expect(order.filledQuantity).toBe(5.0);
      expect(order.remainingQuantity).toBe(5.0);

      // Cancel remaining quantity
      mockFetch.mockResponse('/orders/ORDER123/cancel', new MockHttpResponse(200, {
        success: true,
        data: {
          ...partialOrder,
          status: 'CANCELED',
          remainingQuantity: 0,
        },
      }));

      const canceledOrder = await client.orders.cancelOrder('ORDER123');
      expect(canceledOrder.status).toBe('CANCELED');
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));
      await client.connect();

      // Mock rate limit response
      mockFetch.mockResponse('/accounts', new MockHttpResponse(429, {
        error: 'Rate limit exceeded',
      }, {
        'retry-after': '5',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': Math.floor((Date.now() + 5000) / 1000).toString(),
      }));

      mockFetch.mockResponse('/accounts', new MockHttpResponse(200, {
        success: true,
        data: [mockAccount],
      }));

      // Should retry after rate limit
      const accounts = await client.accounts.getAccounts();
      expect(accounts).toHaveLength(1);
    });
  });

  describe('Real-time Data Processing', () => {
    it('should handle high-frequency quote updates', async () => {
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));
      await client.connect();

      if (!client.push) {
        return; // Skip if WebSocket not enabled
      }

      await new Promise<void>((resolve) => {
        client.push!.once('authenticated', () => resolve());
      });

      const quotesReceived: Array<{ symbol: string; bid: number; ask: number }> = [];
      const maxQuotes = 10;

      const quoteHandler = (quoteData: any) => {
        quotesReceived.push({
          symbol: quoteData.symbol,
          bid: quoteData.bid,
          ask: quoteData.ask,
        });
      };

      client.push.on('quote', quoteHandler);
      client.push.subscribeToQuotes(['EURUSD', 'GBPUSD']);

      await new Promise<void>((resolve) => {
        client.push!.once('subscribed', () => resolve());
      });

      // Simulate high-frequency updates
      mockServer.simulateQuoteUpdates('EURUSD', maxQuotes / 2, 50);
      mockServer.simulateQuoteUpdates('GBPUSD', maxQuotes / 2, 50);

      // Wait for quotes
      await new Promise<void>((resolve) => {
        const checkQuotes = () => {
          if (quotesReceived.length >= maxQuotes) {
            resolve();
          } else {
            setTimeout(checkQuotes, 100);
          }
        };
        checkQuotes();
      });

      expect(quotesReceived.length).toBeGreaterThanOrEqual(maxQuotes);
      
      const eurUsdQuotes = quotesReceived.filter(q => q.symbol === 'EURUSD');
      const gbpUsdQuotes = quotesReceived.filter(q => q.symbol === 'GBPUSD');
      
      expect(eurUsdQuotes.length).toBeGreaterThan(0);
      expect(gbpUsdQuotes.length).toBeGreaterThan(0);

      client.push.off('quote', quoteHandler);
    });

    it('should handle order book snapshots and updates', async () => {
      mockFetch.mockResponse('/time', new MockHttpResponse(200, { timestamp: Date.now() }));
      await client.connect();

      if (!client.push) {
        return;
      }

      await new Promise<void>((resolve) => {
        client.push!.once('authenticated', () => resolve());
      });

      const orderBookUpdates: any[] = [];

      client.push.on('orderbook', (orderBookData) => {
        orderBookUpdates.push(orderBookData);
      });

      client.push.subscribeToOrderBook({
        symbols: ['EURUSD'],
        depth: 5,
      });

      // Simulate order book updates
      setTimeout(() => {
        mockServer.simulateOrderBookUpdates('EURUSD', 3, 200);
      }, 100);

      await new Promise<void>((resolve) => {
        const checkUpdates = () => {
          if (orderBookUpdates.length >= 3) {
            resolve();
          } else {
            setTimeout(checkUpdates, 100);
          }
        };
        checkUpdates();
      });

      expect(orderBookUpdates.length).toBeGreaterThanOrEqual(3);
      
      for (const update of orderBookUpdates) {
        expect(update.symbol).toBe('EURUSD');
        expect(update.bids).toHaveLength(5);
        expect(update.asks).toHaveLength(5);
      }
    });
  });
});