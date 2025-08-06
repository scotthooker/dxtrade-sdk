import { z } from 'zod';

/**
 * DXTrade-specific WebSocket message types
 * Based on actual DXTrade API WebSocket protocol
 */

/**
 * DXTrade message types enumeration
 */
export const DXTradeMessageTypeSchema = z.enum([
  // Server -> Client
  'PingRequest',
  'MarketData',
  'AccountPortfolios',
  'PositionUpdate',
  'OrderUpdate',
  'AccountUpdate',
  'SubscriptionResponse',
  'ErrorResponse',
  'AuthenticationResponse',
  'HeartbeatResponse',
  
  // Client -> Server
  'Ping',
  'MarketDataSubscriptionRequest',
  'AccountPortfoliosSubscriptionRequest',
  'OrderSubscriptionRequest',
  'AuthenticationRequest',
  'UnsubscribeRequest',
  'Heartbeat',
]);

export type DXTradeMessageType = z.infer<typeof DXTradeMessageTypeSchema>;

/**
 * Base DXTrade message schema
 */
export const BaseDXTradeMessageSchema = z.object({
  type: DXTradeMessageTypeSchema,
  requestId: z.string().optional(),
  session: z.string().optional(),
  timestamp: z.string().optional(),
});

/**
 * Ping Request from server (requires Ping response)
 */
export const PingRequestMessageSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('PingRequest'),
  timestamp: z.string(),
});

export type PingRequestMessage = z.infer<typeof PingRequestMessageSchema>;

/**
 * Ping Response to server
 */
export const PingResponseMessageSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('Ping'),
  session: z.string(),
  timestamp: z.string(),
});

export type PingResponseMessage = z.infer<typeof PingResponseMessageSchema>;

/**
 * Market Data Subscription Request
 */
export const MarketDataSubscriptionRequestSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('MarketDataSubscriptionRequest'),
  requestId: z.string(),
  session: z.string(),
  payload: z.object({
    account: z.string(),
    symbols: z.array(z.string()),
    eventTypes: z.array(z.object({
      type: z.string(),
      format: z.string().optional(),
    })),
  }),
});

export type MarketDataSubscriptionRequest = z.infer<typeof MarketDataSubscriptionRequestSchema>;

/**
 * Account Portfolios Subscription Request
 */
export const AccountPortfoliosSubscriptionRequestSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('AccountPortfoliosSubscriptionRequest'),
  requestId: z.string(),
  session: z.string(),
  payload: z.object({
    requestType: z.string(),
    includeOffset: z.string(),
  }),
});

export type AccountPortfoliosSubscriptionRequest = z.infer<typeof AccountPortfoliosSubscriptionRequestSchema>;

/**
 * Market Data Update Message
 */
export const MarketDataMessageSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('MarketData'),
  payload: z.object({
    symbol: z.string().optional(),
    bid: z.number().optional(),
    ask: z.number().optional(),
    timestamp: z.number().optional(),
    // Additional market data fields
    last: z.number().optional(),
    volume: z.number().optional(),
    change: z.number().optional(),
    changePercent: z.number().optional(),
  }).passthrough(), // Allow additional fields
});

export type MarketDataMessage = z.infer<typeof MarketDataMessageSchema>;

/**
 * Account Portfolios Update Message
 */
export const AccountPortfoliosMessageSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('AccountPortfolios'),
  payload: z.object({
    account: z.string().optional(),
    balance: z.number().optional(),
    equity: z.number().optional(),
    margin: z.number().optional(),
    freeMargin: z.number().optional(),
    positions: z.array(z.object({
      symbol: z.string(),
      side: z.enum(['BUY', 'SELL']).optional(),
      quantity: z.number(),
      entryPrice: z.number().optional(),
      currentPrice: z.number().optional(),
      unrealizedPnl: z.number().optional(),
    })).optional(),
  }).passthrough(), // Allow additional fields
});

export type AccountPortfoliosMessage = z.infer<typeof AccountPortfoliosMessageSchema>;

/**
 * Position Update Message
 */
export const PositionUpdateMessageSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('PositionUpdate'),
  payload: z.object({
    symbol: z.string(),
    side: z.enum(['LONG', 'SHORT']).optional(),
    size: z.number(),
    entryPrice: z.number().optional(),
    markPrice: z.number().optional(),
    unrealizedPnl: z.number().optional(),
  }).passthrough(),
});

export type PositionUpdateMessage = z.infer<typeof PositionUpdateMessageSchema>;

/**
 * Order Update Message
 */
export const OrderUpdateMessageSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('OrderUpdate'),
  payload: z.object({
    orderId: z.string(),
    clientOrderId: z.string().optional(),
    symbol: z.string(),
    status: z.enum(['PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED']),
    side: z.enum(['BUY', 'SELL']).optional(),
    quantity: z.number().optional(),
    filledQuantity: z.number().optional(),
    remainingQuantity: z.number().optional(),
    price: z.number().optional(),
    averagePrice: z.number().optional(),
  }).passthrough(),
});

export type OrderUpdateMessage = z.infer<typeof OrderUpdateMessageSchema>;

/**
 * Subscription Response Message
 */
export const SubscriptionResponseMessageSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('SubscriptionResponse'),
  requestId: z.string(),
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

export type SubscriptionResponseMessage = z.infer<typeof SubscriptionResponseMessageSchema>;

/**
 * Error Response Message
 */
export const ErrorResponseMessageSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('ErrorResponse'),
  requestId: z.string().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export type ErrorResponseMessage = z.infer<typeof ErrorResponseMessageSchema>;

/**
 * Authentication Response Message
 */
export const AuthenticationResponseMessageSchema = BaseDXTradeMessageSchema.extend({
  type: z.literal('AuthenticationResponse'),
  requestId: z.string(),
  success: z.boolean(),
  sessionId: z.string().optional(),
  error: z.string().optional(),
});

export type AuthenticationResponseMessage = z.infer<typeof AuthenticationResponseMessageSchema>;

/**
 * Union of all DXTrade WebSocket message types
 */
export const DXTradeWebSocketMessageSchema = z.discriminatedUnion('type', [
  PingRequestMessageSchema,
  PingResponseMessageSchema,
  MarketDataSubscriptionRequestSchema,
  AccountPortfoliosSubscriptionRequestSchema,
  MarketDataMessageSchema,
  AccountPortfoliosMessageSchema,
  PositionUpdateMessageSchema,
  OrderUpdateMessageSchema,
  SubscriptionResponseMessageSchema,
  ErrorResponseMessageSchema,
  AuthenticationResponseMessageSchema,
]);

export type DXTradeWebSocketMessage = z.infer<typeof DXTradeWebSocketMessageSchema>;

/**
 * DXTrade WebSocket URLs configuration
 */
export interface DXTradeWebSocketConfig {
  marketDataUrl: string;
  portfolioUrl: string;
  account: string;
  sessionToken: string;
  symbols?: string[];
  enablePingResponse?: boolean;
  connectionTimeout?: number;
  heartbeatInterval?: number;
}

/**
 * DXTrade WebSocket Stream Options
 */
export interface DXTradeStreamOptions {
  symbols?: string[];
  account?: string;
  enableMarketData?: boolean;
  enablePortfolio?: boolean;
  enablePingResponse?: boolean;
  connectionTimeout?: number;
  heartbeatInterval?: number;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  autoReconnect?: boolean;
}

/**
 * DXTrade WebSocket Stream Callbacks
 */
export interface DXTradeStreamCallbacks {
  onConnected?: (connectionType: 'marketData' | 'portfolio') => void;
  onDisconnected?: (connectionType: 'marketData' | 'portfolio', code: number, reason: string) => void;
  onError?: (connectionType: 'marketData' | 'portfolio', error: Error) => void;
  onMarketData?: (data: MarketDataMessage) => void;
  onAccountPortfolios?: (data: AccountPortfoliosMessage) => void;
  onPositionUpdate?: (data: PositionUpdateMessage) => void;
  onOrderUpdate?: (data: OrderUpdateMessage) => void;
  onPingRequest?: (data: PingRequestMessage) => void;
  onSubscriptionResponse?: (data: SubscriptionResponseMessage) => void;
  onRawMessage?: (connectionType: 'marketData' | 'portfolio', data: any) => void;
  onAuthenticationResponse?: (data: AuthenticationResponseMessage) => void;
  onReconnecting?: (connectionType: 'marketData' | 'portfolio', attempt: number) => void;
  onReconnected?: (connectionType: 'marketData' | 'portfolio') => void;
}

/**
 * DXTrade WebSocket Connection Status
 */
export interface DXTradeConnectionStatus {
  marketData: {
    connected: boolean;
    authenticated: boolean;
    subscribed: boolean;
    lastMessageTime?: number;
    messageCount: number;
    reconnectAttempts: number;
  };
  portfolio: {
    connected: boolean;
    authenticated: boolean;
    subscribed: boolean;
    lastMessageTime?: number;
    messageCount: number;
    reconnectAttempts: number;
  };
  pingStats: {
    requestsReceived: number;
    responsesSent: number;
    lastPingTime?: number;
    averageResponseTime?: number;
  };
  isReady: boolean;
}

/**
 * Test Result Interface (from the test implementation)
 */
export interface DXTradeTestResult {
  success: boolean;
  duration: number;
  messageCount: number;
  marketDataCount: number;
  portfolioCount: number;
  pingRequestsReceived: number;
  pingResponsesSent: number;
  connectionStable: boolean;
  error?: string;
}