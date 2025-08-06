/**
 * DXTrade WebSocket Client - Dual Connection Implementation
 * 
 * Provides real-time streaming of market data and portfolio data
 * via separate WebSocket connections, mirroring the Python implementation.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { SDKConfig } from '../types/common.js';
import { getWebSocketUrl } from '../config/env-config.js';

export interface WebSocketSubscription {
  type: 'prices' | 'candles' | 'portfolio';
  symbols?: string[];
  account?: string;
  active: boolean;
}

export interface WebSocketStatus {
  isRunning: boolean;
  connectionAttempts: number;
  messagesReceived: number;
  mdWebSocketConnected: boolean;
  portfolioWebSocketConnected: boolean;
  lastPingSent: { md: number; portfolio: number };
  lastPingReceived: { md: number; portfolio: number };
  subscriptionsActive: Record<string, boolean>;
  initialDataLoaded: boolean;
}

export interface PingMessage {
  type: 'Ping';
  session: string;
  timestamp: string;
}

export interface SubscriptionRequest {
  type: string;
  requestId: string;
  session: string;
  payload: any;
}

/**
 * DXTrade WebSocket Client with dual connection support
 * 
 * Events emitted:
 * - 'connected': When WebSocket connections are established
 * - 'disconnected': When WebSocket connections are lost
 * - 'authenticated': When authentication is successful
 * - 'quote': Raw quote/price data
 * - 'candle': Raw candle data  
 * - 'portfolio': Raw portfolio data
 * - 'trade': Raw trade data
 * - 'position': Raw position data
 * - 'error': Error messages
 * - 'ping': Ping/pong status updates
 * - 'subscription': Subscription status changes
 * - 'raw_message': All raw WebSocket messages
 */
export class DXWebSocketClient extends EventEmitter {
  private readonly config: SDKConfig;
  private readonly sessionToken: string;
  private readonly account: string;
  
  // WebSocket connections
  private mdWebSocket: WebSocket | null = null;
  private portfolioWebSocket: WebSocket | null = null;
  
  // Connection management
  private isRunning: boolean = false;
  private connectionAttempts: number = 0;
  // private readonly maxRetries: number = 5; // Reserved for future use
  
  // Performance tracking
  private messagesReceived: number = 0;
  private quotesProcessed: number = 0;
  private candlesProcessed: number = 0;
  private portfoliosProcessed: number = 0;
  private tradesProcessed: number = 0;
  private positionsProcessed: number = 0;
  
  // Ping tracking
  private lastPingSent: { md: number; portfolio: number } = { md: 0, portfolio: 0 };
  private lastPingReceived: { md: number; portfolio: number } = { md: 0, portfolio: 0 };
  private pingIntervals: { md?: NodeJS.Timeout; portfolio?: NodeJS.Timeout } = {};
  
  // Subscription tracking
  private subscriptionsActive: Record<string, boolean> = {
    prices: false,
    candles: false,
    portfolios: false
  };
  
  // Configuration
  // private readonly symbols: string[] = []; // Reserved for future use
  private initialDataLoaded: boolean = false;
  private readonly pingIntervalMs: number = 45000; // 45 seconds
  private readonly pingTimeoutMs: number = 120000; // 2 minutes timeout
  
  constructor(config: SDKConfig, sessionToken: string, account: string = 'default:dealtest') {
    super();
    this.config = config;
    this.sessionToken = sessionToken;
    this.account = account;
    
    // Set up error handling
    this.on('error', (error) => {
      console.error('DXWebSocketClient error:', error);
    });
  }
  
  /**
   * Connect to both WebSocket endpoints
   */
  async connect(): Promise<boolean> {
    this.connectionAttempts++;
    this.emit('connecting', { attempt: this.connectionAttempts });
    
    try {
      // Connect to market data WebSocket
      const mdUrl = getWebSocketUrl(this.config, 'marketData');
      if (mdUrl) {
        this.mdWebSocket = await this.connectWebSocket('md', mdUrl);
      }
      
      // Connect to portfolio WebSocket  
      const portfolioUrl = getWebSocketUrl(this.config, 'portfolio');
      if (portfolioUrl) {
        this.portfolioWebSocket = await this.connectWebSocket('portfolio', portfolioUrl);
      }
      
      // Check if we have at least one successful connection
      const hasConnection = this.mdWebSocket || this.portfolioWebSocket;
      
      if (hasConnection) {
        this.isRunning = true;
        this.connectionAttempts = 0;
        this.emit('connected', {
          mdConnected: !!this.mdWebSocket,
          portfolioConnected: !!this.portfolioWebSocket
        });
        
        // Start ping intervals for active connections
        this.startPingIntervals();
        
        return true;
      } else {
        this.emit('error', new Error('Failed to establish any WebSocket connections'));
        return false;
      }
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }
  
  /**
   * Connect to a specific WebSocket endpoint
   */
  private async connectWebSocket(type: 'md' | 'portfolio', url: string): Promise<WebSocket | null> {
    const maxAttempts = 3;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        const ws = new WebSocket(url, {
          headers: {
            'Authorization': this.sessionToken
          }
        });
        
        // Set up WebSocket event handlers
        this.setupWebSocketHandlers(ws, type);
        
        // Wait for connection to open
        await this.waitForConnection(ws);
        
        // Send initial authentication ping
        const authMessage: PingMessage = {
          type: 'Ping',
          session: this.sessionToken,
          timestamp: new Date().toISOString()
        };
        
        ws.send(JSON.stringify(authMessage));
        this.lastPingSent[type] = Date.now();
        
        // Wait for ping response
        const authenticated = await this.waitForPingResponse(ws, type);
        if (authenticated) {
          this.emit('authenticated', { type });
          return ws;
        }
        
      } catch (error) {
        this.emit('error', { type, error, attempt: attempts });
        if (attempts < maxAttempts) {
          await this.sleep(3000);
        }
      }
    }
    
    return null;
  }
  
  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(ws: WebSocket, type: 'md' | 'portfolio'): void {
    ws.on('open', () => {
      this.emit('websocket_open', { type });
    });
    
    ws.on('message', (data: Buffer) => {
      this.handleWebSocketMessage(data.toString(), type);
    });
    
    ws.on('close', (code: number, reason: string) => {
      this.emit('websocket_close', { type, code, reason: reason.toString() });
      this.handleConnectionClose(type);
    });
    
    ws.on('error', (error: Error) => {
      this.emit('websocket_error', { type, error });
    });
    
    ws.on('pong', () => {
      this.lastPingReceived[type] = Date.now();
      this.emit('ping', { type, status: 'pong_received' });
    });
  }
  
  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(message: string, type: 'md' | 'portfolio'): void {
    try {
      this.messagesReceived++;
      const data = JSON.parse(message);
      
      // Always emit raw message
      this.emit('raw_message', { type, data });
      
      const messageType = data.type;
      
      // Handle ping responses
      if (messageType === 'Pong') {
        this.lastPingReceived[type] = Date.now();
        this.emit('ping', { type, status: 'pong', data });
        return;
      }
      
      // Handle rejection
      if (messageType === 'Reject') {
        this.emit('error', { type, error: 'Authentication rejected', data });
        return;
      }
      
      // Route messages based on type
      if (type === 'md') {
        this.handleMarketDataMessage(data);
      } else if (type === 'portfolio') {
        this.handlePortfolioMessage(data);
      }
      
    } catch (error) {
      this.emit('error', { type, error: 'JSON parse error', message });
    }
  }
  
  /**
   * Handle market data messages (quotes and candles)
   */
  private handleMarketDataMessage(data: any): void {
    const messageType = data.type;
    
    if (messageType === 'MarketData' || messageType === 'MarketDataEvent') {
      const events = data.payload?.events || [];
      
      for (const event of events) {
        // Check if this is quote data (has bid/ask)
        if ('bid' in event && 'ask' in event) {
          this.quotesProcessed++;
          this.emit('quote', event);
        }
        // Check if this is candle data (has OHLC)
        else if ('open' in event && 'close' in event && 'high' in event && 'low' in event) {
          this.candlesProcessed++;
          this.emit('candle', event);
        }
      }
      
      // Emit the full market data event as well
      this.emit('market_data', data);
    }
  }
  
  /**
   * Handle portfolio messages (positions, orders, trades)
   */
  private handlePortfolioMessage(data: any): void {
    const messageType = data.type;
    
    if (messageType === 'AccountPortfolios' || messageType === 'PortfolioEvent' || messageType === 'Portfolio') {
      let portfolios = [];
      
      if (data.payload?.portfolios) {
        portfolios = data.payload.portfolios;
      } else if (data.payload && 'account' in data.payload) {
        portfolios = [data.payload];
      }
      
      for (const portfolio of portfolios) {
        this.portfoliosProcessed++;
        
        // Emit positions if present
        const positions = portfolio.positions || [];
        for (const position of positions) {
          this.positionsProcessed++;
          this.emit('position', position);
        }
        
        // Emit orders/trades if present
        const orders = portfolio.orders || [];
        for (const order of orders) {
          if (order.status === 'COMPLETED') {
            this.tradesProcessed++;
            this.emit('trade', order);
          } else {
            this.emit('order', order);
          }
        }
        
        // Emit the full portfolio data
        this.emit('portfolio', portfolio);
      }
    }
  }
  
  /**
   * Start ping intervals for active connections
   */
  private startPingIntervals(): void {
    if (this.mdWebSocket) {
      this.pingIntervals.md = setInterval(() => {
        this.sendPing('md');
      }, this.pingIntervalMs);
    }
    
    if (this.portfolioWebSocket) {
      this.pingIntervals.portfolio = setInterval(() => {
        this.sendPing('portfolio');
      }, this.pingIntervalMs);
    }
  }
  
  /**
   * Send ping message to maintain connection
   */
  private sendPing(type: 'md' | 'portfolio'): void {
    const ws = type === 'md' ? this.mdWebSocket : this.portfolioWebSocket;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Check if connection is still healthy (received pong within timeout)
    const now = Date.now();
    if (this.lastPingSent[type] > 0 && 
        (now - this.lastPingReceived[type]) > this.pingTimeoutMs) {
      this.emit('error', { type, error: 'Ping timeout - connection may be dead' });
      this.handleConnectionClose(type);
      return;
    }
    
    try {
      const pingMessage: PingMessage = {
        type: 'Ping',
        session: this.sessionToken,
        timestamp: new Date().toISOString()
      };
      
      ws.send(JSON.stringify(pingMessage));
      this.lastPingSent[type] = now;
      this.emit('ping', { type, status: 'ping_sent' });
    } catch (error) {
      this.emit('error', { type, error: 'Failed to send ping' });
    }
  }
  
  /**
   * Subscribe to market data (prices and candles)
   */
  async subscribeToMarketData(symbols: string[] = ['EUR/USD', 'XAU/USD']): Promise<boolean> {
    if (!this.mdWebSocket || this.mdWebSocket.readyState !== WebSocket.OPEN) {
      this.emit('error', new Error('Market data WebSocket not connected'));
      return false;
    }
    
    try {
      // Subscribe to prices
      const priceMessage: SubscriptionRequest = {
        type: 'MarketDataSubscriptionRequest',
        requestId: 'unified_prices',
        session: this.sessionToken,
        payload: {
          account: this.account,
          symbols: symbols,
          eventTypes: [{
            type: 'Quote',
            format: 'COMPACT'
          }]
        }
      };
      
      this.mdWebSocket.send(JSON.stringify(priceMessage));
      this.subscriptionsActive.prices = true;
      this.emit('subscription', { type: 'prices', active: true, symbols });
      
      // Subscribe to candles
      const candleMessage: SubscriptionRequest = {
        type: 'MarketDataSubscriptionRequest',
        requestId: 'unified_candles', 
        session: this.sessionToken,
        payload: {
          account: this.account,
          symbols: symbols,
          eventTypes: [{
            type: 'Candle',
            candleType: '1d',
            fromTime: '2025-07-09T09:50:48Z',
            toTime: new Date().toISOString(),
            format: 'COMPACT'
          }]
        }
      };
      
      this.mdWebSocket.send(JSON.stringify(candleMessage));
      this.subscriptionsActive.candles = true;
      this.emit('subscription', { type: 'candles', active: true, symbols });
      
      return true;
    } catch (error) {
      this.emit('error', { error: 'Failed to subscribe to market data' });
      return false;
    }
  }
  
  /**
   * Subscribe to portfolio data
   */
  async subscribeToPortfolioData(): Promise<boolean> {
    if (!this.portfolioWebSocket || this.portfolioWebSocket.readyState !== WebSocket.OPEN) {
      this.emit('error', new Error('Portfolio WebSocket not connected'));
      return false;
    }
    
    try {
      const portfolioMessage: SubscriptionRequest = {
        type: 'AccountPortfoliosSubscriptionRequest',
        requestId: 'unified_portfolios',
        session: this.sessionToken,
        payload: {
          requestType: 'ALL',
          includeOffset: 'true'
        }
      };
      
      this.portfolioWebSocket.send(JSON.stringify(portfolioMessage));
      this.subscriptionsActive.portfolios = true;
      this.emit('subscription', { type: 'portfolios', active: true });
      
      return true;
    } catch (error) {
      this.emit('error', { error: 'Failed to subscribe to portfolio data' });
      return false;
    }
  }
  
  /**
   * Subscribe to all available data streams
   */
  async subscribeToAllStreams(symbols: string[] = ['EUR/USD', 'XAU/USD']): Promise<void> {
    const promises = [];
    
    if (this.mdWebSocket) {
      promises.push(this.subscribeToMarketData(symbols));
    }
    
    if (this.portfolioWebSocket) {
      promises.push(this.subscribeToPortfolioData());
    }
    
    await Promise.all(promises);
  }
  
  /**
   * Get current service status
   */
  getStatus(): WebSocketStatus {
    // const now = Date.now(); // Reserved for future use
    
    return {
      isRunning: this.isRunning,
      connectionAttempts: this.connectionAttempts,
      messagesReceived: this.messagesReceived,
      mdWebSocketConnected: this.mdWebSocket?.readyState === WebSocket.OPEN,
      portfolioWebSocketConnected: this.portfolioWebSocket?.readyState === WebSocket.OPEN,
      lastPingSent: { ...this.lastPingSent },
      lastPingReceived: { ...this.lastPingReceived },
      subscriptionsActive: { ...this.subscriptionsActive },
      initialDataLoaded: this.initialDataLoaded
    };
  }
  
  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      messagesReceived: this.messagesReceived,
      quotesProcessed: this.quotesProcessed,
      candlesProcessed: this.candlesProcessed,
      portfoliosProcessed: this.portfoliosProcessed,
      tradesProcessed: this.tradesProcessed,
      positionsProcessed: this.positionsProcessed,
      pingAge: {
        md: this.lastPingReceived.md > 0 ? Date.now() - this.lastPingReceived.md : null,
        portfolio: this.lastPingReceived.portfolio > 0 ? Date.now() - this.lastPingReceived.portfolio : null
      }
    };
  }
  
  /**
   * Gracefully disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.isRunning = false;
    
    // Clear ping intervals
    if (this.pingIntervals.md) {
      clearInterval(this.pingIntervals.md);
      delete this.pingIntervals.md;
    }
    
    if (this.pingIntervals.portfolio) {
      clearInterval(this.pingIntervals.portfolio);
      delete this.pingIntervals.portfolio;
    }
    
    // Close WebSocket connections
    const closePromises = [];
    
    if (this.mdWebSocket) {
      closePromises.push(this.closeWebSocket(this.mdWebSocket, 'md'));
      this.mdWebSocket = null;
    }
    
    if (this.portfolioWebSocket) {
      closePromises.push(this.closeWebSocket(this.portfolioWebSocket, 'portfolio'));
      this.portfolioWebSocket = null;
    }
    
    await Promise.all(closePromises);
    
    // Reset subscriptions
    this.subscriptionsActive = {
      prices: false,
      candles: false,
      portfolios: false
    };
    
    this.emit('disconnected');
  }
  
  /**
   * Handle connection close
   */
  private handleConnectionClose(type: 'md' | 'portfolio'): void {
    if (type === 'md') {
      this.mdWebSocket = null;
      this.subscriptionsActive.prices = false;
      this.subscriptionsActive.candles = false;
    } else {
      this.portfolioWebSocket = null;
      this.subscriptionsActive.portfolios = false;
    }
    
    // Clear ping interval for this connection
    if (this.pingIntervals[type]) {
      clearInterval(this.pingIntervals[type]);
      delete this.pingIntervals[type];
    }
    
    // If both connections are lost, mark as not running
    if (!this.mdWebSocket && !this.portfolioWebSocket) {
      this.isRunning = false;
    }
  }
  
  /**
   * Utility methods
   */
  private async waitForConnection(ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
  
  private async waitForPingResponse(ws: WebSocket, type: 'md' | 'portfolio'): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 10000);
      
      const messageHandler = (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'Pong') {
            this.lastPingReceived[type] = Date.now();
            clearTimeout(timeout);
            ws.off('message', messageHandler);
            resolve(true);
          } else if (message.type === 'Reject') {
            clearTimeout(timeout);
            ws.off('message', messageHandler);
            resolve(false);
          }
        } catch (error) {
          // Ignore JSON parse errors during auth wait
        }
      };
      
      ws.on('message', messageHandler);
    });
  }
  
  private async closeWebSocket(ws: WebSocket, _type: string): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.terminate();
        resolve();
      }, 5000);
      
      ws.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}