import { z } from 'zod';

/**
 * WebSocket connection state enumeration
 */
export const ConnectionStateSchema = z.enum([
  'IDLE',
  'CONNECTING',
  'OPEN',
  'CLOSING',
  'CLOSED',
  'ERROR',
]);
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

/**
 * WebSocket message type enumeration
 */
export const MessageTypeSchema = z.enum([
  'SUBSCRIBE',
  'UNSUBSCRIBE',
  'HEARTBEAT',
  'AUTH',
  'ERROR',
  'QUOTE',
  'ORDER_BOOK',
  'TRADE',
  'ORDER_UPDATE',
  'POSITION_UPDATE',
  'ACCOUNT_UPDATE',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

/**
 * WebSocket subscription type enumeration
 */
export const SubscriptionTypeSchema = z.enum([
  'quotes',
  'orderbook',
  'trades',
  'orders',
  'positions',
  'account',
]);
export type SubscriptionType = z.infer<typeof SubscriptionTypeSchema>;

/**
 * Base WebSocket message schema
 */
export const BaseMessageSchema = z.object({
  type: MessageTypeSchema,
  id: z.string().optional(),
  timestamp: z.number().optional(),
});

/**
 * Subscription request schema
 */
export const SubscriptionRequestSchema = BaseMessageSchema.extend({
  type: z.literal('SUBSCRIBE'),
  channel: SubscriptionTypeSchema,
  symbols: z.array(z.string()).optional(),
  params: z.record(z.unknown()).optional(),
});

export type SubscriptionRequest = z.infer<typeof SubscriptionRequestSchema>;

/**
 * Unsubscription request schema
 */
export const UnsubscriptionRequestSchema = BaseMessageSchema.extend({
  type: z.literal('UNSUBSCRIBE'),
  channel: SubscriptionTypeSchema,
  symbols: z.array(z.string()).optional(),
});

export type UnsubscriptionRequest = z.infer<typeof UnsubscriptionRequestSchema>;

/**
 * Heartbeat message schema
 */
export const HeartbeatMessageSchema = BaseMessageSchema.extend({
  type: z.literal('HEARTBEAT'),
  data: z.object({
    ping: z.number(),
  }),
});

export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>;

/**
 * Authentication message schema
 */
export const AuthMessageSchema = BaseMessageSchema.extend({
  type: z.literal('AUTH'),
  data: z.object({
    token: z.string(),
  }),
});

export type AuthMessage = z.infer<typeof AuthMessageSchema>;

/**
 * Error message schema
 */
export const ErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal('ERROR'),
  data: z.object({
    code: z.number(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

/**
 * Quote update message schema
 */
export const QuoteUpdateMessageSchema = BaseMessageSchema.extend({
  type: z.literal('QUOTE'),
  data: z.object({
    symbol: z.string(),
    bid: z.number(),
    ask: z.number(),
    timestamp: z.number(),
  }),
});

export type QuoteUpdateMessage = z.infer<typeof QuoteUpdateMessageSchema>;

/**
 * Order book update message schema
 */
export const OrderBookUpdateMessageSchema = BaseMessageSchema.extend({
  type: z.literal('ORDER_BOOK'),
  data: z.object({
    symbol: z.string(),
    bids: z.array(z.tuple([z.number(), z.number()])),
    asks: z.array(z.tuple([z.number(), z.number()])),
    timestamp: z.number(),
  }),
});

export type OrderBookUpdateMessage = z.infer<typeof OrderBookUpdateMessageSchema>;

/**
 * Trade update message schema
 */
export const TradeUpdateMessageSchema = BaseMessageSchema.extend({
  type: z.literal('TRADE'),
  data: z.object({
    id: z.string(),
    symbol: z.string(),
    price: z.number(),
    quantity: z.number(),
    side: z.enum(['BUY', 'SELL']),
    timestamp: z.number(),
  }),
});

export type TradeUpdateMessage = z.infer<typeof TradeUpdateMessageSchema>;

/**
 * Order update message schema
 */
export const OrderUpdateMessageSchema = BaseMessageSchema.extend({
  type: z.literal('ORDER_UPDATE'),
  data: z.object({
    id: z.string(),
    clientOrderId: z.string().optional(),
    symbol: z.string(),
    status: z.enum(['PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED']),
    filledQuantity: z.number(),
    remainingQuantity: z.number(),
    averagePrice: z.number().optional(),
    timestamp: z.number(),
  }),
});

export type OrderUpdateMessage = z.infer<typeof OrderUpdateMessageSchema>;

/**
 * Position update message schema
 */
export const PositionUpdateMessageSchema = BaseMessageSchema.extend({
  type: z.literal('POSITION_UPDATE'),
  data: z.object({
    symbol: z.string(),
    side: z.enum(['LONG', 'SHORT']),
    size: z.number(),
    entryPrice: z.number(),
    markPrice: z.number(),
    unrealizedPnl: z.number(),
    timestamp: z.number(),
  }),
});

export type PositionUpdateMessage = z.infer<typeof PositionUpdateMessageSchema>;

/**
 * Account update message schema
 */
export const AccountUpdateMessageSchema = BaseMessageSchema.extend({
  type: z.literal('ACCOUNT_UPDATE'),
  data: z.object({
    balance: z.number(),
    equity: z.number(),
    margin: z.number(),
    freeMargin: z.number(),
    timestamp: z.number(),
  }),
});

export type AccountUpdateMessage = z.infer<typeof AccountUpdateMessageSchema>;

/**
 * Union of all WebSocket message types
 */
export const WebSocketMessageSchema = z.discriminatedUnion('type', [
  SubscriptionRequestSchema,
  UnsubscriptionRequestSchema,
  HeartbeatMessageSchema,
  AuthMessageSchema,
  ErrorMessageSchema,
  QuoteUpdateMessageSchema,
  OrderBookUpdateMessageSchema,
  TradeUpdateMessageSchema,
  OrderUpdateMessageSchema,
  PositionUpdateMessageSchema,
  AccountUpdateMessageSchema,
]);

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

/**
 * WebSocket configuration schema
 */
export const WebSocketConfigSchema = z.object({
  url: z.string().url(),
  heartbeatInterval: z.number().default(30000), // 30 seconds
  reconnectDelay: z.number().default(1000), // 1 second
  maxReconnectDelay: z.number().default(30000), // 30 seconds
  maxReconnectAttempts: z.number().default(5),
  pingTimeout: z.number().default(10000), // 10 seconds
  pongTimeout: z.number().default(5000), // 5 seconds
  maxQueueSize: z.number().default(1000),
  enableBackfill: z.boolean().default(true),
  backfillLimit: z.number().default(100),
});

export type WebSocketConfig = z.infer<typeof WebSocketConfigSchema>;

/**
 * Subscription state schema
 */
export const SubscriptionStateSchema = z.object({
  channel: SubscriptionTypeSchema,
  symbols: z.array(z.string()),
  active: z.boolean(),
  lastUpdate: z.number().optional(),
});

export type SubscriptionState = z.infer<typeof SubscriptionStateSchema>;

/**
 * WebSocket event types - parameter tuple format for EventEmitter
 */
export type WebSocketEventMap = {
  open: [];
  close: [code: number, reason: string];
  error: [error: Error];
  message: [message: WebSocketMessage];
  reconnecting: [attempt: number];
  reconnected: [];
  subscribed: [channel: SubscriptionType, symbols: string[]];
  unsubscribed: [channel: SubscriptionType, symbols: string[]];
  heartbeat: [timestamp: number];
};