/**
 * Unified WebSocket Stream Interface
 * 
 * Provides a high-level interface for managing DXTrade WebSocket connections
 * with automatic reconnection and error handling.
 */

import { DXWebSocketClient } from './dx-websocket-client.js';
import type { SDKConfig } from '../types/common.js';

export interface StreamOptions {
  symbols?: string[];
  account?: string;
  autoReconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  enableMarketData?: boolean;
  enablePortfolio?: boolean;
}

export interface StreamCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onAuthenticated?: (data: any) => void;
  onQuote?: (quote: any) => void;
  onCandle?: (candle: any) => void;
  onTrade?: (trade: any) => void;
  onPosition?: (position: any) => void;
  onOrder?: (order: any) => void;
  onPortfolio?: (portfolio: any) => void;
  onMarketData?: (data: any) => void;
  onRawMessage?: (data: any) => void;
  onError?: (error: any) => void;
  onPing?: (data: any) => void;
  onSubscription?: (data: any) => void;
}

/**
 * Unified WebSocket stream manager
 */
export class UnifiedWebSocketStream {
  private client: DXWebSocketClient | null = null;
  private readonly config: SDKConfig;
  private readonly sessionToken: string;
  private readonly options: Required<StreamOptions>;
  private readonly callbacks: StreamCallbacks;
  
  // Reconnection logic
  private reconnectAttempt: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isReconnecting: boolean = false;
  
  // Thread reference (for compatibility with Python version)
  private streamThread: any = null;

  constructor(
    config: SDKConfig,
    sessionToken: string,
    options: StreamOptions = {},
    callbacks: StreamCallbacks = {}
  ) {
    this.config = config;
    this.sessionToken = sessionToken;
    this.callbacks = callbacks;
    
    // Set default options
    this.options = {
      symbols: options.symbols || ['EUR/USD', 'XAU/USD'],
      account: options.account || 'default:dealtest',
      autoReconnect: options.autoReconnect ?? true,
      reconnectAttempts: options.reconnectAttempts || 5,
      reconnectDelay: options.reconnectDelay || 3000,
      enableMarketData: options.enableMarketData ?? true,
      enablePortfolio: options.enablePortfolio ?? true,
    };
  }
  
  /**
   * Start the unified WebSocket stream
   */
  async start(): Promise<DXWebSocketClient> {
    if (this.client) {
      throw new Error('Stream is already running');
    }
    
    this.client = new DXWebSocketClient(this.config, this.sessionToken, this.options.account);
    this.setupEventHandlers(this.client);
    
    const connected = await this.client.connect();
    if (!connected) {
      throw new Error('Failed to establish WebSocket connections');
    }
    
    // Subscribe to streams based on options
    await this.subscribeToEnabledStreams();
    
    // For compatibility with Python thread interface
    this.streamThread = {
      isAlive: () => this.client?.getStatus().isRunning || false,
      daemon: true,
      name: `UnifiedWebSocket-${process.platform}`
    };
    
    return this.client;
  }
  
  /**
   * Stop the WebSocket stream
   */
  async stop(): Promise<void> {
    this.clearReconnectTimer();
    this.isReconnecting = false;
    
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    
    this.streamThread = null;
  }
  
  /**
   * Get the underlying WebSocket client
   */
  getClient(): DXWebSocketClient | null {
    return this.client;
  }
  
  /**
   * Get current stream status
   */
  getStatus() {
    if (!this.client) {
      return {
        isRunning: false,
        client: null
      };
    }
    
    return {
      isRunning: true,
      client: this.client.getStatus(),
      metrics: this.client.getMetrics(),
      reconnectAttempt: this.reconnectAttempt,
      isReconnecting: this.isReconnecting,
      streamThread: this.streamThread
    };
  }
  
  /**
   * Subscribe to additional symbols
   */
  async subscribeToSymbols(symbols: string[]): Promise<boolean> {
    if (!this.client) {
      throw new Error('Stream not running');
    }
    
    if (this.options.enableMarketData) {
      return await this.client.subscribeToMarketData(symbols);
    }
    
    return false;
  }
  
  /**
   * Set up event handlers for the WebSocket client
   */
  private setupEventHandlers(client: DXWebSocketClient): void {
    client.on('connected', (_data) => {
      this.reconnectAttempt = 0;
      this.isReconnecting = false;
      this.callbacks.onConnect?.();
    });
    
    client.on('disconnected', () => {
      this.callbacks.onDisconnect?.();
      if (this.options.autoReconnect && !this.isReconnecting) {
        this.handleReconnect();
      }
    });
    
    client.on('authenticated', (data) => {
      this.callbacks.onAuthenticated?.(data);
    });
    
    client.on('quote', (quote) => {
      this.callbacks.onQuote?.(quote);
    });
    
    client.on('candle', (candle) => {
      this.callbacks.onCandle?.(candle);
    });
    
    client.on('trade', (trade) => {
      this.callbacks.onTrade?.(trade);
    });
    
    client.on('position', (position) => {
      this.callbacks.onPosition?.(position);
    });
    
    client.on('order', (order) => {
      this.callbacks.onOrder?.(order);
    });
    
    client.on('portfolio', (portfolio) => {
      this.callbacks.onPortfolio?.(portfolio);
    });
    
    client.on('market_data', (data) => {
      this.callbacks.onMarketData?.(data);
    });
    
    client.on('raw_message', (data) => {
      this.callbacks.onRawMessage?.(data);
    });
    
    client.on('error', (error) => {
      this.callbacks.onError?.(error);
    });
    
    client.on('ping', (data) => {
      this.callbacks.onPing?.(data);
    });
    
    client.on('subscription', (data) => {
      this.callbacks.onSubscription?.(data);
    });
    
    // Handle connection errors that might trigger reconnect
    client.on('websocket_close', (_data) => {
      if (this.options.autoReconnect && !this.isReconnecting) {
        this.handleReconnect();
      }
    });
  }
  
  /**
   * Subscribe to enabled streams
   */
  private async subscribeToEnabledStreams(): Promise<void> {
    if (!this.client) return;
    
    const subscriptions = [];
    
    if (this.options.enableMarketData) {
      subscriptions.push(this.client.subscribeToMarketData(this.options.symbols));
    }
    
    if (this.options.enablePortfolio) {
      subscriptions.push(this.client.subscribeToPortfolioData());
    }
    
    await Promise.all(subscriptions);
  }
  
  /**
   * Handle automatic reconnection
   */
  private handleReconnect(): void {
    if (this.reconnectAttempt >= this.options.reconnectAttempts) {
      this.callbacks.onError?.(new Error(`Maximum reconnection attempts (${this.options.reconnectAttempts}) reached`));
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectAttempt++;
    
    this.callbacks.onError?.({
      message: `Connection lost, attempting reconnect ${this.reconnectAttempt}/${this.options.reconnectAttempts}`,
      type: 'reconnect_attempt'
    });
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        // Cleanup existing client
        if (this.client) {
          await this.client.disconnect();
          this.client = null;
        }
        
        // Create new client and connect
        this.client = new DXWebSocketClient(this.config, this.sessionToken, this.options.account);
        this.setupEventHandlers(this.client);
        
        const connected = await this.client.connect();
        if (connected) {
          await this.subscribeToEnabledStreams();
          this.callbacks.onError?.({
            message: `Reconnected successfully after ${this.reconnectAttempt} attempts`,
            type: 'reconnect_success'
          });
        } else {
          // Connection failed, try again
          this.isReconnecting = false;
          this.handleReconnect();
        }
      } catch (error) {
        this.isReconnecting = false;
        this.callbacks.onError?.({
          message: `Reconnection attempt ${this.reconnectAttempt} failed: ${error}`,
          type: 'reconnect_failed',
          error
        });
        this.handleReconnect();
      }
    }, this.options.reconnectDelay);
  }
  
  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/**
 * Factory function to start a unified WebSocket stream (Python compatibility)
 */
export function startUnifiedWebSocketStream(
  config: SDKConfig,
  sessionToken: string,
  options: StreamOptions = {},
  callbacks: StreamCallbacks = {}
): { client: DXWebSocketClient | null; stream: UnifiedWebSocketStream; thread: any } {
  const stream = new UnifiedWebSocketStream(config, sessionToken, options, callbacks);
  
  // Start the stream asynchronously
  let client: DXWebSocketClient | null = null;
  let thread: any = null;
  
  stream.start().then((startedClient) => {
    client = startedClient;
    thread = stream.getStatus().streamThread;
  }).catch((error) => {
    callbacks.onError?.(error);
  });
  
  // Give it time to start (similar to Python version)
  setTimeout(() => {
    const status = stream.getStatus();
    client = status.client ? stream.getClient() : null;
    thread = status.streamThread;
  }, 2000);
  
  return { client, stream, thread };
}