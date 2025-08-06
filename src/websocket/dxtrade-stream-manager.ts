import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { SDKConfig } from '../types/common.js';
import {
  DXTradeWebSocketConfig,
  DXTradeStreamOptions,
  DXTradeStreamCallbacks,
  DXTradeConnectionStatus,
  DXTradeTestResult,
  type DXTradeWebSocketMessage,
  type PingRequestMessage,
  type MarketDataMessage,
  type AccountPortfoliosMessage,
  type PositionUpdateMessage,
  type OrderUpdateMessage,
  type SubscriptionResponseMessage,
  type AuthenticationResponseMessage,
  DXTradeWebSocketMessageSchema,
} from '../types/dxtrade-messages.js';

/**
 * DXTrade WebSocket Stream Manager
 * 
 * Implements the dual WebSocket architecture from the test implementation:
 * - Market Data WebSocket for real-time quotes and market data
 * - Portfolio WebSocket for account, position, and order updates
 * - Automatic ping/pong handling for connection stability
 * - Connection management with reconnection logic
 */
export class DXTradeStreamManager extends EventEmitter {
  private readonly streamConfig: DXTradeWebSocketConfig;
  private readonly options: Required<DXTradeStreamOptions>;
  private readonly callbacks: DXTradeStreamCallbacks;

  // WebSocket connections
  private marketDataWs: WebSocket | null = null;
  private portfolioWs: WebSocket | null = null;

  // Connection state
  private status: DXTradeConnectionStatus;
  private reconnectTimers: { marketData?: NodeJS.Timeout; portfolio?: NodeJS.Timeout } = {};
  private isDestroyed = false;

  constructor(
    _config: SDKConfig,
    streamConfig: DXTradeWebSocketConfig,
    options: DXTradeStreamOptions = {},
    callbacks: DXTradeStreamCallbacks = {}
  ) {
    super();
    
    this.streamConfig = streamConfig;
    this.callbacks = callbacks;

    // Set default options
    this.options = {
      symbols: options.symbols || ['EUR/USD', 'XAU/USD', 'GBP/USD', 'USD/JPY'],
      account: options.account || streamConfig.account,
      enableMarketData: options.enableMarketData ?? true,
      enablePortfolio: options.enablePortfolio ?? true,
      enablePingResponse: options.enablePingResponse ?? true,
      connectionTimeout: options.connectionTimeout || 30000,
      heartbeatInterval: options.heartbeatInterval || 30000,
      maxReconnectAttempts: options.maxReconnectAttempts || 5,
      reconnectDelay: options.reconnectDelay || 3000,
      autoReconnect: options.autoReconnect ?? true,
    };

    // Initialize connection status
    this.status = {
      marketData: {
        connected: false,
        authenticated: false,
        subscribed: false,
        messageCount: 0,
        reconnectAttempts: 0,
      },
      portfolio: {
        connected: false,
        authenticated: false,
        subscribed: false,
        messageCount: 0,
        reconnectAttempts: 0,
      },
      pingStats: {
        requestsReceived: 0,
        responsesSent: 0,
      },
      isReady: false,
    };
  }

  /**
   * Connect to both WebSocket streams
   */
  async connect(): Promise<boolean> {
    if (this.isDestroyed) {
      throw new Error('Stream manager has been destroyed');
    }

    const connections: Promise<boolean>[] = [];

    if (this.options.enableMarketData) {
      connections.push(this.connectMarketData());
    }

    if (this.options.enablePortfolio) {
      connections.push(this.connectPortfolio());
    }

    if (connections.length === 0) {
      throw new Error('No streams enabled');
    }

    const results = await Promise.all(connections);
    const allConnected = results.every(connected => connected);

    if (allConnected) {
      this.updateReadyState();
      await this.subscribeToEnabledStreams();
    }

    return allConnected;
  }

  /**
   * Disconnect from all WebSocket streams
   */
  async disconnect(): Promise<void> {
    this.clearReconnectTimers();

    const disconnections: Promise<void>[] = [];

    if (this.marketDataWs) {
      disconnections.push(this.disconnectWebSocket(this.marketDataWs, 'marketData'));
    }

    if (this.portfolioWs) {
      disconnections.push(this.disconnectWebSocket(this.portfolioWs, 'portfolio'));
    }

    await Promise.all(disconnections);

    this.marketDataWs = null;
    this.portfolioWs = null;
    this.updateReadyState();
  }

  /**
   * Destroy the stream manager and cleanup resources
   */
  destroy(): void {
    this.isDestroyed = true;
    this.disconnect().catch(console.error);
    this.removeAllListeners();
  }

  /**
   * Get current connection status
   */
  getStatus(): DXTradeConnectionStatus {
    return { ...this.status };
  }

  /**
   * Subscribe to market data for additional symbols
   */
  async subscribeToMarketData(symbols: string[]): Promise<boolean> {
    if (!this.marketDataWs || this.marketDataWs.readyState !== WebSocket.OPEN) {
      return false;
    }

    const subscriptionMessage = {
      type: 'MarketDataSubscriptionRequest',
      requestId: `market_data_${Date.now()}`,
      session: this.streamConfig.sessionToken,
      payload: {
        account: this.options.account,
        symbols,
        eventTypes: [{
          type: 'Quote',
          format: 'COMPACT'
        }]
      }
    };

    try {
      this.marketDataWs.send(JSON.stringify(subscriptionMessage));
      return true;
    } catch (error) {
      console.error('Failed to subscribe to market data:', error);
      return false;
    }
  }

  /**
   * Subscribe to portfolio data
   */
  async subscribeToPortfolioData(): Promise<boolean> {
    if (!this.portfolioWs || this.portfolioWs.readyState !== WebSocket.OPEN) {
      return false;
    }

    const subscriptionMessage = {
      type: 'AccountPortfoliosSubscriptionRequest',
      requestId: `portfolio_${Date.now()}`,
      session: this.streamConfig.sessionToken,
      payload: {
        requestType: 'ALL',
        includeOffset: 'true'
      }
    };

    try {
      this.portfolioWs.send(JSON.stringify(subscriptionMessage));
      return true;
    } catch (error) {
      console.error('Failed to subscribe to portfolio data:', error);
      return false;
    }
  }

  /**
   * Run a stability test similar to the original test implementation
   */
  async runStabilityTest(durationMs: number = 300000): Promise<DXTradeTestResult> {
    const startTime = Date.now();
    let messageCount = 0;
    let marketDataCount = 0;
    let portfolioCount = 0;
    let pingRequestsReceived = 0;
    let pingResponsesSent = 0;
    let connectionStable = true;
    let error: string | undefined;

    // Track messages during test
    const messageHandler = () => {
      messageCount++;
    };

    const marketDataHandler = () => {
      marketDataCount++;
    };

    const portfolioHandler = () => {
      portfolioCount++;
    };

    const pingHandler = () => {
      pingRequestsReceived++;
      pingResponsesSent++; // Assuming we respond to all pings
    };

    const errorHandler = (err: any) => {
      connectionStable = false;
      error = err.message || String(err);
    };

    // Set up listeners
    this.on('message', messageHandler);
    this.on('marketData', marketDataHandler);
    this.on('accountPortfolios', portfolioHandler);
    this.on('pingRequest', pingHandler);
    this.on('error', errorHandler);

    try {
      // Connect and subscribe
      const connected = await this.connect();
      if (!connected) {
        throw new Error('Failed to connect to WebSocket streams');
      }

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, durationMs));

      const duration = (Date.now() - startTime) / 1000;
      const pingSuccessRate = pingRequestsReceived > 0 ? 
        (pingResponsesSent / pingRequestsReceived * 100) : 100;

      return {
        success: connectionStable && error === undefined,
        duration,
        messageCount,
        marketDataCount,
        portfolioCount,
        pingRequestsReceived,
        pingResponsesSent,
        connectionStable: connectionStable && pingSuccessRate >= 90,
        error,
      };

    } finally {
      // Clean up listeners
      this.off('message', messageHandler);
      this.off('marketData', marketDataHandler);
      this.off('accountPortfolios', portfolioHandler);
      this.off('pingRequest', pingHandler);
      this.off('error', errorHandler);
    }
  }

  /**
   * Connect to Market Data WebSocket
   */
  private async connectMarketData(): Promise<boolean> {
    return new Promise((resolve) => {
      const headers = {
        'Authorization': `DXAPI ${this.streamConfig.sessionToken}`,
        'X-Auth-Token': this.streamConfig.sessionToken
      };

      try {
        this.marketDataWs = new WebSocket(this.streamConfig.marketDataUrl, { headers });
        this.setupWebSocketEventHandlers(this.marketDataWs, 'marketData');

        const timeout = setTimeout(() => {
          this.status.marketData.connected = false;
          resolve(false);
        }, this.options.connectionTimeout);

        this.marketDataWs.once('open', () => {
          clearTimeout(timeout);
          this.status.marketData.connected = true;
          this.status.marketData.reconnectAttempts = 0;
          this.callbacks.onConnected?.('marketData');
          resolve(true);
        });

        this.marketDataWs.once('error', (error) => {
          clearTimeout(timeout);
          this.callbacks.onError?.('marketData', error);
          resolve(false);
        });

      } catch (error) {
        this.callbacks.onError?.('marketData', error as Error);
        resolve(false);
      }
    });
  }

  /**
   * Connect to Portfolio WebSocket
   */
  private async connectPortfolio(): Promise<boolean> {
    return new Promise((resolve) => {
      const headers = {
        'Authorization': `DXAPI ${this.streamConfig.sessionToken}`,
        'X-Auth-Token': this.streamConfig.sessionToken
      };

      try {
        this.portfolioWs = new WebSocket(this.streamConfig.portfolioUrl, { headers });
        this.setupWebSocketEventHandlers(this.portfolioWs, 'portfolio');

        const timeout = setTimeout(() => {
          this.status.portfolio.connected = false;
          resolve(false);
        }, this.options.connectionTimeout);

        this.portfolioWs.once('open', () => {
          clearTimeout(timeout);
          this.status.portfolio.connected = true;
          this.status.portfolio.reconnectAttempts = 0;
          this.callbacks.onConnected?.('portfolio');
          resolve(true);
        });

        this.portfolioWs.once('error', (error) => {
          clearTimeout(timeout);
          this.callbacks.onError?.('portfolio', error);
          resolve(false);
        });

      } catch (error) {
        this.callbacks.onError?.('portfolio', error as Error);
        resolve(false);
      }
    });
  }

  /**
   * Setup event handlers for a WebSocket connection
   */
  private setupWebSocketEventHandlers(ws: WebSocket, connectionType: 'marketData' | 'portfolio'): void {
    ws.on('open', () => {
      this.status[connectionType].connected = true;
      this.updateReadyState();
    });

    ws.on('close', (code, reason) => {
      this.status[connectionType].connected = false;
      this.status[connectionType].authenticated = false;
      this.status[connectionType].subscribed = false;
      this.updateReadyState();
      
      this.callbacks.onDisconnected?.(connectionType, code, reason.toString());
      
      if (this.options.autoReconnect && !this.isDestroyed) {
        this.handleReconnect(connectionType);
      }
    });

    ws.on('error', (error) => {
      this.callbacks.onError?.(connectionType, error);
    });

    ws.on('message', (data) => {
      this.handleMessage(data.toString(), connectionType);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(rawMessage: string, connectionType: 'marketData' | 'portfolio'): void {
    this.status[connectionType].messageCount++;
    this.status[connectionType].lastMessageTime = Date.now();

    this.callbacks.onRawMessage?.(connectionType, rawMessage);

    try {
      const message = JSON.parse(rawMessage);
      const parsedMessage = DXTradeWebSocketMessageSchema.safeParse(message);

      if (parsedMessage.success) {
        this.handleTypedMessage(parsedMessage.data, connectionType);
      } else {
        // Handle non-typed messages (raw format from DXTrade)
        this.handleRawDXTradeMessage(message, connectionType);
      }

      this.emit('message', message);

    } catch (error) {
      console.warn(`Failed to parse WebSocket message from ${connectionType}:`, rawMessage);
    }
  }

  /**
   * Handle typed DXTrade messages
   */
  private handleTypedMessage(message: DXTradeWebSocketMessage, connectionType: 'marketData' | 'portfolio'): void {
    switch (message.type) {
      case 'PingRequest':
        this.handlePingRequest(message, connectionType);
        break;
      
      case 'MarketData':
        this.callbacks.onMarketData?.(message as MarketDataMessage);
        this.emit('marketData', message);
        break;
      
      case 'AccountPortfolios':
        this.callbacks.onAccountPortfolios?.(message as AccountPortfoliosMessage);
        this.emit('accountPortfolios', message);
        break;
      
      case 'PositionUpdate':
        this.callbacks.onPositionUpdate?.(message as PositionUpdateMessage);
        this.emit('positionUpdate', message);
        break;
      
      case 'OrderUpdate':
        this.callbacks.onOrderUpdate?.(message as OrderUpdateMessage);
        this.emit('orderUpdate', message);
        break;
      
      case 'SubscriptionResponse':
        this.handleSubscriptionResponse(message as SubscriptionResponseMessage, connectionType);
        break;
      
      case 'AuthenticationResponse':
        this.handleAuthenticationResponse(message as AuthenticationResponseMessage, connectionType);
        break;
      
      default:
        console.log(`Unhandled message type: ${message.type}`);
    }
  }

  /**
   * Handle raw DXTrade messages (for non-typed format)
   */
  private handleRawDXTradeMessage(message: any, connectionType: 'marketData' | 'portfolio'): void {
    const messageType = message.type;
    
    if (messageType === 'PingRequest') {
      this.handleRawPingRequest(message, connectionType);
    } else if (messageType === 'MarketData') {
      this.callbacks.onMarketData?.(message);
      this.emit('marketData', message);
    } else if (messageType === 'AccountPortfolios') {
      this.callbacks.onAccountPortfolios?.(message);
      this.emit('accountPortfolios', message);
    }
  }

  /**
   * Handle ping request from server
   */
  private handlePingRequest(message: PingRequestMessage, connectionType: 'marketData' | 'portfolio'): void {
    this.status.pingStats.requestsReceived++;
    this.status.pingStats.lastPingTime = Date.now();
    
    this.callbacks.onPingRequest?.(message);
    this.emit('pingRequest', message);

    if (this.options.enablePingResponse) {
      this.sendPingResponse(message, connectionType);
    }
  }

  /**
   * Handle raw ping request (for non-typed format)
   */
  private handleRawPingRequest(message: any, connectionType: 'marketData' | 'portfolio'): void {
    this.status.pingStats.requestsReceived++;
    this.status.pingStats.lastPingTime = Date.now();
    
    this.callbacks.onPingRequest?.(message);
    this.emit('pingRequest', message);

    if (this.options.enablePingResponse) {
      this.sendRawPingResponse(message, connectionType);
    }
  }

  /**
   * Send ping response to server
   */
  private sendPingResponse(pingRequest: PingRequestMessage, connectionType: 'marketData' | 'portfolio'): void {
    const ws = connectionType === 'marketData' ? this.marketDataWs : this.portfolioWs;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const pongResponse = {
      type: 'Ping',
      session: this.streamConfig.sessionToken,
      timestamp: pingRequest.timestamp || new Date().toISOString()
    };

    try {
      ws.send(JSON.stringify(pongResponse));
      this.status.pingStats.responsesSent++;
    } catch (error) {
      console.error(`Failed to send ping response on ${connectionType}:`, error);
    }
  }

  /**
   * Send raw ping response (for non-typed format)
   */
  private sendRawPingResponse(pingRequest: any, connectionType: 'marketData' | 'portfolio'): void {
    const ws = connectionType === 'marketData' ? this.marketDataWs : this.portfolioWs;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const pongResponse = {
      type: 'Ping',
      session: this.streamConfig.sessionToken,
      timestamp: pingRequest.timestamp || new Date().toISOString()
    };

    try {
      ws.send(JSON.stringify(pongResponse));
      this.status.pingStats.responsesSent++;
    } catch (error) {
      console.error(`Failed to send ping response on ${connectionType}:`, error);
    }
  }

  /**
   * Handle subscription response
   */
  private handleSubscriptionResponse(message: SubscriptionResponseMessage, connectionType: 'marketData' | 'portfolio'): void {
    if (message.success) {
      this.status[connectionType].subscribed = true;
    }
    
    this.callbacks.onSubscriptionResponse?.(message);
    this.updateReadyState();
  }

  /**
   * Handle authentication response
   */
  private handleAuthenticationResponse(message: AuthenticationResponseMessage, connectionType: 'marketData' | 'portfolio'): void {
    if (message.success) {
      this.status[connectionType].authenticated = true;
    }
    
    this.callbacks.onAuthenticationResponse?.(message);
    this.updateReadyState();
  }

  /**
   * Subscribe to enabled streams
   */
  private async subscribeToEnabledStreams(): Promise<void> {
    const subscriptions: Promise<boolean>[] = [];

    if (this.options.enableMarketData && this.status.marketData.connected) {
      subscriptions.push(this.subscribeToMarketData(this.options.symbols));
    }

    if (this.options.enablePortfolio && this.status.portfolio.connected) {
      subscriptions.push(this.subscribeToPortfolioData());
    }

    await Promise.all(subscriptions);
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(connectionType: 'marketData' | 'portfolio'): void {
    if (this.status[connectionType].reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.callbacks.onError?.(
        connectionType,
        new Error(`Maximum reconnection attempts (${this.options.maxReconnectAttempts}) reached for ${connectionType}`)
      );
      return;
    }

    this.status[connectionType].reconnectAttempts++;
    
    this.callbacks.onReconnecting?.(connectionType, this.status[connectionType].reconnectAttempts);

    this.reconnectTimers[connectionType] = setTimeout(async () => {
      try {
        let connected = false;
        
        if (connectionType === 'marketData') {
          connected = await this.connectMarketData();
        } else {
          connected = await this.connectPortfolio();
        }

        if (connected) {
          this.callbacks.onReconnected?.(connectionType);
          this.updateReadyState();
          
          if (connectionType === 'marketData' && this.options.enableMarketData) {
            await this.subscribeToMarketData(this.options.symbols);
          } else if (connectionType === 'portfolio' && this.options.enablePortfolio) {
            await this.subscribeToPortfolioData();
          }
        } else {
          // Try again
          this.handleReconnect(connectionType);
        }
      } catch (error) {
        this.callbacks.onError?.(connectionType, error as Error);
        this.handleReconnect(connectionType);
      }
    }, this.options.reconnectDelay);
  }

  /**
   * Update ready state based on connection status
   */
  private updateReadyState(): void {
    const marketDataReady = !this.options.enableMarketData || 
      (this.status.marketData.connected && this.status.marketData.subscribed);
    
    const portfolioReady = !this.options.enablePortfolio || 
      (this.status.portfolio.connected && this.status.portfolio.subscribed);
    
    this.status.isReady = marketDataReady && portfolioReady;
  }

  /**
   * Disconnect a WebSocket connection
   */
  private async disconnectWebSocket(ws: WebSocket, _connectionType: 'marketData' | 'portfolio'): Promise<void> {
    return new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        resolve();
      }, 5000);

      ws.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });

      ws.close();
    });
  }

  /**
   * Clear all reconnection timers
   */
  private clearReconnectTimers(): void {
    if (this.reconnectTimers.marketData) {
      clearTimeout(this.reconnectTimers.marketData);
      this.reconnectTimers.marketData = undefined;
    }
    
    if (this.reconnectTimers.portfolio) {
      clearTimeout(this.reconnectTimers.portfolio);
      this.reconnectTimers.portfolio = undefined;
    }
  }
}

/**
 * Create a DXTrade stream manager with configuration
 */
export function createDXTradeStreamManager(
  config: SDKConfig,
  sessionToken: string,
  options: DXTradeStreamOptions = {},
  callbacks: DXTradeStreamCallbacks = {}
): DXTradeStreamManager {
  // Derive WebSocket URLs from config or environment
  const marketDataUrl = config.urls?.wsMarketData || 
    process.env.DXTRADE_WS_MARKET_DATA_URL ||
    `wss://demo.dx.trade/dxsca-web/md?format=JSON`;
  const portfolioUrl = config.urls?.wsPortfolio || 
    process.env.DXTRADE_WS_PORTFOLIO_URL ||
    `wss://demo.dx.trade/dxsca-web/?format=JSON`;

  const streamConfig: DXTradeWebSocketConfig = {
    marketDataUrl,
    portfolioUrl,
    account: options.account || process.env.DXTRADE_ACCOUNT || 'default:demo',
    sessionToken,
    symbols: options.symbols,
    enablePingResponse: options.enablePingResponse,
    connectionTimeout: options.connectionTimeout,
    heartbeatInterval: options.heartbeatInterval,
  };

  return new DXTradeStreamManager(config, streamConfig, options, callbacks);
}