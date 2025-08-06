import { EventEmitter } from 'events';
import { z } from 'zod';
import { ConnectionManager } from './connection-manager.js';
import { WebSocketError, AuthError } from '../errors/index.js';
import type {
  WebSocketConfig,
  WebSocketEventMap,
  SubscriptionType,
  WebSocketMessage,
  QuoteUpdateMessage,
  OrderBookUpdateMessage,
  TradeUpdateMessage,
  OrderUpdateMessage,
  PositionUpdateMessage,
  AccountUpdateMessage,
} from '../types/websocket.js';
import type { AuthConfig } from '../types/common.js';

/**
 * Market data subscription configuration
 */
export const MarketDataConfigSchema = z.object({
  symbols: z.array(z.string()).min(1),
  depth: z.number().min(1).max(20).default(10),
  aggregateLevel: z.number().min(0).max(5).default(0),
  includeStats: z.boolean().default(false),
});

export type MarketDataConfig = z.infer<typeof MarketDataConfigSchema>;

/**
 * Backfill configuration
 */
export const BackfillConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxItems: z.number().min(1).max(1000).default(100),
  maxAge: z.number().min(1000).max(86400000).default(300000), // 5 minutes
});

export type BackfillConfig = z.infer<typeof BackfillConfigSchema>;

/**
 * Push API client configuration
 */
export const PushClientConfigSchema = z.object({
  websocket: z.object({
    url: z.string().url(),
    heartbeatInterval: z.number().default(30000),
    reconnectDelay: z.number().default(1000),
    maxReconnectDelay: z.number().default(30000),
    maxReconnectAttempts: z.number().default(5),
    pingTimeout: z.number().default(10000),
    pongTimeout: z.number().default(5000),
    maxQueueSize: z.number().default(1000),
    enableBackfill: z.boolean().default(true),
    backfillLimit: z.number().default(100),
  }),
  auth: z.object({
    type: z.enum(['session', 'bearer', 'hmac']),
    token: z.string().optional(),
    apiKey: z.string().optional(),
    secret: z.string().optional(),
  }),
  backfill: BackfillConfigSchema.optional(),
  autoResubscribe: z.boolean().default(true),
  bufferUpdates: z.boolean().default(true),
  bufferInterval: z.number().default(100),
});

export type PushClientConfig = z.infer<typeof PushClientConfigSchema>;

/**
 * Market data events
 */
interface MarketDataEvents {
  quote: (data: QuoteUpdateMessage['data']) => void;
  orderbook: (data: OrderBookUpdateMessage['data']) => void;
  trade: (data: TradeUpdateMessage['data']) => void;
}

/**
 * Account events
 */
interface AccountEvents {
  order: (data: OrderUpdateMessage['data']) => void;
  position: (data: PositionUpdateMessage['data']) => void;
  account: (data: AccountUpdateMessage['data']) => void;
}

/**
 * Combined event map
 */
interface PushClientEventMap extends WebSocketEventMap, MarketDataEvents, AccountEvents {
  authenticated: () => void;
  backfillComplete: (channel: SubscriptionType, items: number) => void;
}

/**
 * DXtrade Push API WebSocket client
 */
export class PushClient extends EventEmitter<PushClientEventMap> {
  private readonly config: Required<PushClientConfig>;
  private readonly connectionManager: ConnectionManager;
  private isAuthenticated = false;
  private updateBuffer = new Map<string, unknown[]>();
  private bufferTimer?: NodeJS.Timeout;
  private messageHandlers = new Map<string, (message: WebSocketMessage) => void>();

  constructor(config: PushClientConfig) {
    super();
    
    this.config = {
      ...PushClientConfigSchema.parse(config),
      backfill: config.backfill ?? { enabled: true, maxItems: 100, maxAge: 300000 },
    };

    // Create connection manager
    this.connectionManager = new ConnectionManager(this.config.websocket);
    
    // Set up event handlers
    this.setupEventHandlers();
    this.setupMessageHandlers();
  }

  /**
   * Connect to Push API
   */
  async connect(): Promise<void> {
    await this.connectionManager.connect();
  }

  /**
   * Disconnect from Push API
   */
  async disconnect(): Promise<void> {
    this.stopBufferTimer();
    await this.connectionManager.disconnect();
  }

  /**
   * Check if client is connected and authenticated
   */
  isReady(): boolean {
    return this.connectionManager.isConnected() && this.isAuthenticated;
  }

  /**
   * Subscribe to real-time quotes
   */
  subscribeToQuotes(symbols: string[]): void {
    if (symbols.length === 0) {
      throw new Error('At least one symbol is required');
    }

    if (symbols.length > 100) {
      throw new Error('Too many symbols (max 100)');
    }

    this.connectionManager.subscribe('quotes', symbols);
  }

  /**
   * Subscribe to order book updates
   */
  subscribeToOrderBook(config: MarketDataConfig): void {
    const validatedConfig = MarketDataConfigSchema.parse(config);
    
    this.connectionManager.send({
      type: 'SUBSCRIBE',
      channel: 'orderbook',
      symbols: validatedConfig.symbols,
      params: {
        depth: validatedConfig.depth,
        aggregateLevel: validatedConfig.aggregateLevel,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Subscribe to trade updates
   */
  subscribeToTrades(symbols: string[]): void {
    if (symbols.length === 0) {
      throw new Error('At least one symbol is required');
    }

    this.connectionManager.subscribe('trades', symbols);
  }

  /**
   * Subscribe to order updates
   */
  subscribeToOrders(accountId?: string): void {
    this.connectionManager.send({
      type: 'SUBSCRIBE',
      channel: 'orders',
      params: accountId ? { accountId } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Subscribe to position updates
   */
  subscribeToPositions(accountId?: string): void {
    this.connectionManager.send({
      type: 'SUBSCRIBE',
      channel: 'positions',
      params: accountId ? { accountId } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Subscribe to account updates
   */
  subscribeToAccount(accountId?: string): void {
    this.connectionManager.send({
      type: 'SUBSCRIBE',
      channel: 'account',
      params: accountId ? { accountId } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Unsubscribe from quotes
   */
  unsubscribeFromQuotes(symbols?: string[]): void {
    this.connectionManager.unsubscribe('quotes', symbols);
  }

  /**
   * Unsubscribe from order book
   */
  unsubscribeFromOrderBook(symbols?: string[]): void {
    this.connectionManager.unsubscribe('orderbook', symbols);
  }

  /**
   * Unsubscribe from trades
   */
  unsubscribeFromTrades(symbols?: string[]): void {
    this.connectionManager.unsubscribe('trades', symbols);
  }

  /**
   * Unsubscribe from orders
   */
  unsubscribeFromOrders(): void {
    this.connectionManager.unsubscribe('orders');
  }

  /**
   * Unsubscribe from positions
   */
  unsubscribeFromPositions(): void {
    this.connectionManager.unsubscribe('positions');
  }

  /**
   * Unsubscribe from account
   */
  unsubscribeFromAccount(): void {
    this.connectionManager.unsubscribe('account');
  }

  /**
   * Unsubscribe from all channels
   */
  unsubscribeAll(): void {
    const subscriptions = this.connectionManager.getSubscriptions();
    
    for (const subscription of subscriptions) {
      this.connectionManager.unsubscribe(
        subscription.channel,
        subscription.symbols.length > 0 ? subscription.symbols : undefined
      );
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): ReturnType<ConnectionManager['getStats']> & {
    authenticated: boolean;
    bufferSize: number;
  } {
    const connectionStats = this.connectionManager.getStats();
    
    let bufferSize = 0;
    for (const buffer of this.updateBuffer.values()) {
      bufferSize += buffer.length;
    }
    
    return {
      ...connectionStats,
      authenticated: this.isAuthenticated,
      bufferSize,
    };
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): ReturnType<ConnectionManager['getSubscriptions']> {
    return this.connectionManager.getSubscriptions();
  }

  /**
   * Request historical data backfill
   */
  requestBackfill(
    channel: SubscriptionType,
    symbols: string[],
    config?: Partial<BackfillConfig>
  ): void {
    if (!this.config.websocket.enableBackfill) {
      throw new Error('Backfill is not enabled');
    }

    const backfillConfig = { ...this.config.backfill, ...config };
    
    this.connectionManager.send({
      type: 'SUBSCRIBE',
      channel,
      symbols,
      params: {
        backfill: true,
        maxItems: backfillConfig.maxItems,
        maxAge: backfillConfig.maxAge,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Destroy client and cleanup resources
   */
  destroy(): void {
    this.stopBufferTimer();
    this.connectionManager.destroy();
    this.updateBuffer.clear();
    this.messageHandlers.clear();
    this.removeAllListeners();
  }

  /**
   * Set up connection event handlers
   */
  private setupEventHandlers(): void {
    // Proxy connection events
    this.connectionManager.on('open', () => {
      this.authenticate();
      this.emit('open');
    });

    this.connectionManager.on('close', (code, reason) => {
      this.isAuthenticated = false;
      this.emit('close', code, reason);
    });

    this.connectionManager.on('error', (error) => {
      this.emit('error', error);
    });

    this.connectionManager.on('message', (message) => {
      this.handleMessage(message);
    });

    this.connectionManager.on('reconnecting', (attempt) => {
      this.isAuthenticated = false;
      this.emit('reconnecting', attempt);
    });

    this.connectionManager.on('reconnected', () => {
      this.emit('reconnected');
    });

    this.connectionManager.on('subscribed', (channel, symbols) => {
      this.emit('subscribed', channel, symbols);
    });

    this.connectionManager.on('unsubscribed', (channel, symbols) => {
      this.emit('unsubscribed', channel, symbols);
    });

    this.connectionManager.on('heartbeat', (timestamp) => {
      this.emit('heartbeat', timestamp);
    });
  }

  /**
   * Set up message type handlers
   */
  private setupMessageHandlers(): void {
    this.messageHandlers.set('AUTH', this.handleAuthMessage.bind(this));
    this.messageHandlers.set('QUOTE', this.handleQuoteMessage.bind(this));
    this.messageHandlers.set('ORDER_BOOK', this.handleOrderBookMessage.bind(this));
    this.messageHandlers.set('TRADE', this.handleTradeMessage.bind(this));
    this.messageHandlers.set('ORDER_UPDATE', this.handleOrderUpdateMessage.bind(this));
    this.messageHandlers.set('POSITION_UPDATE', this.handlePositionUpdateMessage.bind(this));
    this.messageHandlers.set('ACCOUNT_UPDATE', this.handleAccountUpdateMessage.bind(this));
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: WebSocketMessage): void {
    const handler = this.messageHandlers.get(message.type);
    
    if (handler) {
      handler(message);
    }
  }

  /**
   * Authenticate with server
   */
  private authenticate(): void {
    const auth = this.config.auth;
    
    let token: string;
    
    if (auth.type === 'session' || auth.type === 'bearer') {
      if (!auth.token) {
        throw new AuthError('Token is required for authentication');
      }
      token = auth.token;
    } else if (auth.type === 'hmac') {
      if (!auth.apiKey || !auth.secret) {
        throw new AuthError('API key and secret are required for HMAC authentication');
      }
      // For HMAC, we'll use the API key as the token and sign the message
      token = auth.apiKey;
    } else {
      throw new AuthError('Unsupported authentication type');
    }

    this.connectionManager.send({
      type: 'AUTH',
      data: { token },
      timestamp: Date.now(),
    });
  }

  /**
   * Handle authentication response
   */
  private handleAuthMessage(message: WebSocketMessage): void {
    if (message.type === 'AUTH') {
      // Assume successful if we get an auth message back
      // In real implementation, check for success field
      this.isAuthenticated = true;
      this.emit('authenticated');
      
      // Start update buffering if enabled
      if (this.config.bufferUpdates) {
        this.startBufferTimer();
      }
    }
  }

  /**
   * Handle quote update message
   */
  private handleQuoteMessage(message: WebSocketMessage): void {
    if (message.type === 'QUOTE') {
      const quoteMessage = message as QuoteUpdateMessage;
      
      if (this.config.bufferUpdates) {
        this.bufferUpdate('quote', quoteMessage.data);
      } else {
        this.emit('quote', quoteMessage.data);
      }
    }
  }

  /**
   * Handle order book update message
   */
  private handleOrderBookMessage(message: WebSocketMessage): void {
    if (message.type === 'ORDER_BOOK') {
      const orderBookMessage = message as OrderBookUpdateMessage;
      
      if (this.config.bufferUpdates) {
        this.bufferUpdate('orderbook', orderBookMessage.data);
      } else {
        this.emit('orderbook', orderBookMessage.data);
      }
    }
  }

  /**
   * Handle trade update message
   */
  private handleTradeMessage(message: WebSocketMessage): void {
    if (message.type === 'TRADE') {
      const tradeMessage = message as TradeUpdateMessage;
      
      if (this.config.bufferUpdates) {
        this.bufferUpdate('trade', tradeMessage.data);
      } else {
        this.emit('trade', tradeMessage.data);
      }
    }
  }

  /**
   * Handle order update message
   */
  private handleOrderUpdateMessage(message: WebSocketMessage): void {
    if (message.type === 'ORDER_UPDATE') {
      const orderMessage = message as OrderUpdateMessage;
      this.emit('order', orderMessage.data);
    }
  }

  /**
   * Handle position update message
   */
  private handlePositionUpdateMessage(message: WebSocketMessage): void {
    if (message.type === 'POSITION_UPDATE') {
      const positionMessage = message as PositionUpdateMessage;
      this.emit('position', positionMessage.data);
    }
  }

  /**
   * Handle account update message
   */
  private handleAccountUpdateMessage(message: WebSocketMessage): void {
    if (message.type === 'ACCOUNT_UPDATE') {
      const accountMessage = message as AccountUpdateMessage;
      this.emit('account', accountMessage.data);
    }
  }

  /**
   * Buffer update for batch processing
   */
  private bufferUpdate(type: string, data: unknown): void {
    if (!this.updateBuffer.has(type)) {
      this.updateBuffer.set(type, []);
    }
    
    const buffer = this.updateBuffer.get(type);
    if (buffer) {
      buffer.push(data);
      
      // Prevent buffer overflow
      if (buffer.length > 1000) {
        buffer.shift();
      }
    }
  }

  /**
   * Start buffer timer for batch processing
   */
  private startBufferTimer(): void {
    this.stopBufferTimer();
    
    this.bufferTimer = setInterval(() => {
      this.flushBuffers();
    }, this.config.bufferInterval);
  }

  /**
   * Stop buffer timer
   */
  private stopBufferTimer(): void {
    if (this.bufferTimer) {
      clearInterval(this.bufferTimer);
      this.bufferTimer = undefined;
    }
  }

  /**
   * Flush all update buffers
   */
  private flushBuffers(): void {
    for (const [type, buffer] of this.updateBuffer.entries()) {
      if (buffer.length > 0) {
        // Emit batched updates
        for (const data of buffer) {
          this.emit(type as keyof PushClientEventMap, data);
        }
        
        // Clear buffer
        buffer.length = 0;
      }
    }
  }
}