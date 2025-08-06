/**
 * DXTrade WebSocket client implementation
 * Manages dual WebSocket connections for market data and portfolio
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface DXTradeWebSocketConfig {
  baseUrl: string;
  sessionToken: string;
  account?: string;
  websocket?: {
    baseUrl?: string;
    marketDataPath?: string;
    portfolioPath?: string;
  };
}

export interface MarketDataSubscription {
  type: 'MarketDataSubscriptionRequest';
  requestId: string;
  session: string;
  payload: {
    account: string;
    symbols: string[];
    eventTypes: Array<{
      type: 'Quote' | 'Candle';
      format?: 'COMPACT';
      candleType?: string;
      fromTime?: string;
      toTime?: string;
    }>;
  };
}

export interface PortfolioSubscription {
  type: 'AccountPortfoliosSubscriptionRequest';
  requestId: string;
  session: string;
  payload: {
    requestType: 'ALL';
    includeOffset: string;
  };
}

export class DXTradeWebSocket extends EventEmitter {
  private config: DXTradeWebSocketConfig;
  private marketDataWs?: WebSocket;
  private portfolioWs?: WebSocket;
  private pingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private isClosing = false;

  constructor(config: DXTradeWebSocketConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect both WebSocket connections
   */
  async connect(): Promise<void> {
    await Promise.all([
      this.connectMarketData(),
      this.connectPortfolio()
    ]);
  }

  /**
   * Connect to market data WebSocket
   */
  private async connectMarketData(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build WebSocket URL from configuration - now supports explicit URLs
      let wsUrl: string;
      
      // First priority: Use explicit market data WebSocket URL
      if ((this.config as any).urls?.wsMarketData) {
        wsUrl = (this.config as any).urls.wsMarketData;
        console.log('Using explicit market data WebSocket URL:', wsUrl);
      } else {
        // Fallback to legacy configuration
        const wsBase = this.config.websocket?.baseUrl || this.config.baseUrl.replace('https://', 'wss://').replace('/api', '/ws');
        const marketDataPath = this.config.websocket?.marketDataPath || '/md';
        wsUrl = `${wsBase}${marketDataPath}`;
        console.log('Using legacy market data WebSocket URL:', wsUrl);
      }
      
      this.marketDataWs = new WebSocket(wsUrl, {
        headers: {
          'Authorization': this.config.sessionToken
        }
      });

      this.marketDataWs.on('open', () => {
        console.log('✅ Market data WebSocket connected');
        this.sendPing(this.marketDataWs!, 'marketData');
        this.startPingInterval('marketData', this.marketDataWs!);
        resolve();
      });

      this.marketDataWs.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMarketDataMessage(message);
        } catch (error) {
          console.error('Failed to parse market data message:', error);
        }
      });

      this.marketDataWs.on('error', (error) => {
        console.error('Market data WebSocket error:', error);
        this.emit('error', { type: 'marketData', error });
        reject(error);
      });

      this.marketDataWs.on('close', (code, reason) => {
        console.log(`Market data WebSocket closed: ${code} - ${reason}`);
        this.handleDisconnect('marketData');
      });
    });
  }

  /**
   * Connect to portfolio WebSocket
   */
  private async connectPortfolio(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build WebSocket URL from configuration - now supports explicit URLs
      let wsUrl: string;
      
      // First priority: Use explicit portfolio WebSocket URL
      if ((this.config as any).urls?.wsPortfolio) {
        wsUrl = (this.config as any).urls.wsPortfolio;
        console.log('Using explicit portfolio WebSocket URL:', wsUrl);
      } else {
        // Fallback to legacy configuration
        const wsBase = this.config.websocket?.baseUrl || this.config.baseUrl.replace('https://', 'wss://').replace('/api', '/ws');
        const portfolioPath = this.config.websocket?.portfolioPath || '/?format=JSON';
        wsUrl = `${wsBase}${portfolioPath}`;
        console.log('Using legacy portfolio WebSocket URL:', wsUrl);
      }
      
      this.portfolioWs = new WebSocket(wsUrl, {
        headers: {
          'Authorization': this.config.sessionToken
        }
      });

      this.portfolioWs.on('open', () => {
        console.log('✅ Portfolio WebSocket connected');
        this.sendPing(this.portfolioWs!, 'portfolio');
        this.startPingInterval('portfolio', this.portfolioWs!);
        resolve();
      });

      this.portfolioWs.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handlePortfolioMessage(message);
        } catch (error) {
          console.error('Failed to parse portfolio message:', error);
        }
      });

      this.portfolioWs.on('error', (error) => {
        console.error('Portfolio WebSocket error:', error);
        this.emit('error', { type: 'portfolio', error });
        reject(error);
      });

      this.portfolioWs.on('close', (code, reason) => {
        console.log(`Portfolio WebSocket closed: ${code} - ${reason}`);
        this.handleDisconnect('portfolio');
      });
    });
  }

  /**
   * Send ping message
   */
  private sendPing(ws: WebSocket, _type: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      const pingMessage = {
        type: 'Ping',
        session: this.config.sessionToken,
        timestamp: new Date().toISOString().replace(/\.\d{3}/, '.00')
      };
      ws.send(JSON.stringify(pingMessage));
    }
  }

  /**
   * Start ping interval for keep-alive
   */
  private startPingInterval(name: string, ws: WebSocket): void {
    // Clear existing interval if any
    const existing = this.pingIntervals.get(name);
    if (existing) {
      clearInterval(existing);
    }

    // Send ping every 45 seconds
    const interval = setInterval(() => {
      this.sendPing(ws, name);
    }, 45000);

    this.pingIntervals.set(name, interval);
  }

  /**
   * Handle market data messages
   */
  private handleMarketDataMessage(message: any): void {
    if (message.type === 'Pong') {
      this.emit('pong', { source: 'marketData', timestamp: message.timestamp });
      return;
    }

    if (message.type === 'MarketData' && message.payload?.events) {
      message.payload.events.forEach((event: any) => {
        if (event.bid !== undefined && event.ask !== undefined) {
          // Quote data
          this.emit('quote', {
            symbol: event.symbol,
            bid: event.bid,
            ask: event.ask,
            timestamp: event.time
          });
        } else if (event.open !== undefined && event.close !== undefined) {
          // Candle data
          this.emit('candle', {
            symbol: event.symbol,
            open: event.open,
            high: event.high,
            low: event.low,
            close: event.close,
            volume: event.volume,
            timestamp: event.time
          });
        }
      });
    }

    // Emit raw message for advanced processing
    this.emit('marketData', message);
  }

  /**
   * Handle portfolio messages
   */
  private handlePortfolioMessage(message: any): void {
    if (message.type === 'Pong') {
      this.emit('pong', { source: 'portfolio', timestamp: message.timestamp });
      return;
    }

    if (message.type === 'AccountPortfolios' && message.payload?.portfolios) {
      message.payload.portfolios.forEach((portfolio: any) => {
        // Emit positions
        if (portfolio.positions) {
          portfolio.positions.forEach((position: any) => {
            this.emit('position', position);
          });
        }

        // Emit orders
        if (portfolio.orders) {
          portfolio.orders.forEach((order: any) => {
            this.emit('order', order);
          });
        }

        // Emit account data
        if (portfolio.account) {
          this.emit('account', {
            account: portfolio.account,
            balance: portfolio.balance,
            equity: portfolio.equity,
            margin: portfolio.margin,
            freeMargin: portfolio.freeMargin
          });
        }
      });
    }

    // Emit raw message for advanced processing
    this.emit('portfolio', message);
  }

  /**
   * Subscribe to market quotes
   */
  subscribeToQuotes(symbols: string[]): void {
    if (!this.marketDataWs || this.marketDataWs.readyState !== WebSocket.OPEN) {
      throw new Error('Market data WebSocket not connected');
    }

    const subscription: MarketDataSubscription = {
      type: 'MarketDataSubscriptionRequest',
      requestId: `quotes_${Date.now()}`,
      session: this.config.sessionToken,
      payload: {
        account: this.config.account || 'default:your-account',
        symbols,
        eventTypes: [{
          type: 'Quote',
          format: 'COMPACT'
        }]
      }
    };

    this.marketDataWs.send(JSON.stringify(subscription));
  }

  /**
   * Subscribe to candles
   */
  subscribeToCandles(symbols: string[], candleType = '1d', fromTime?: string): void {
    if (!this.marketDataWs || this.marketDataWs.readyState !== WebSocket.OPEN) {
      throw new Error('Market data WebSocket not connected');
    }

    const subscription: MarketDataSubscription = {
      type: 'MarketDataSubscriptionRequest',
      requestId: `candles_${Date.now()}`,
      session: this.config.sessionToken,
      payload: {
        account: this.config.account || 'default:your-account',
        symbols,
        eventTypes: [{
          type: 'Candle',
          candleType,
          fromTime: fromTime || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          toTime: new Date().toISOString(),
          format: 'COMPACT'
        }]
      }
    };

    this.marketDataWs.send(JSON.stringify(subscription));
  }

  /**
   * Subscribe to portfolio updates
   */
  subscribeToPortfolio(): void {
    if (!this.portfolioWs || this.portfolioWs.readyState !== WebSocket.OPEN) {
      throw new Error('Portfolio WebSocket not connected');
    }

    const subscription: PortfolioSubscription = {
      type: 'AccountPortfoliosSubscriptionRequest',
      requestId: `portfolio_${Date.now()}`,
      session: this.config.sessionToken,
      payload: {
        requestType: 'ALL',
        includeOffset: 'true'
      }
    };

    this.portfolioWs.send(JSON.stringify(subscription));
  }

  /**
   * Handle disconnection and reconnection
   */
  private handleDisconnect(type: 'marketData' | 'portfolio'): void {
    if (this.isClosing) return;

    // Clear ping interval
    const interval = this.pingIntervals.get(type);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(type);
    }

    // Schedule reconnection
    const timeout = setTimeout(() => {
      if (!this.isClosing) {
        console.log(`Attempting to reconnect ${type} WebSocket...`);
        if (type === 'marketData') {
          this.connectMarketData().catch(console.error);
        } else {
          this.connectPortfolio().catch(console.error);
        }
      }
    }, 5000);

    this.reconnectTimeouts.set(type, timeout);
  }

  /**
   * Disconnect both WebSocket connections
   */
  disconnect(): void {
    this.isClosing = true;

    // Clear all intervals
    this.pingIntervals.forEach(interval => clearInterval(interval));
    this.pingIntervals.clear();

    // Clear all reconnect timeouts
    this.reconnectTimeouts.forEach(timeout => clearTimeout(timeout));
    this.reconnectTimeouts.clear();

    // Close WebSocket connections
    if (this.marketDataWs) {
      this.marketDataWs.close();
      this.marketDataWs = undefined;
    }

    if (this.portfolioWs) {
      this.portfolioWs.close();
      this.portfolioWs = undefined;
    }
  }

  /**
   * Check if both WebSockets are connected
   */
  isConnected(): boolean {
    return (
      this.marketDataWs?.readyState === WebSocket.OPEN &&
      this.portfolioWs?.readyState === WebSocket.OPEN
    );
  }
}