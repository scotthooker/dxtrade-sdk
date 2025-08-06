import { z } from 'zod';

/**
 * Order side enumeration
 */
export const OrderSideSchema = z.enum(['BUY', 'SELL']);
export type OrderSide = z.infer<typeof OrderSideSchema>;

/**
 * Order type enumeration
 */
export const OrderTypeSchema = z.enum([
  'MARKET',
  'LIMIT',
  'STOP',
  'STOP_LIMIT',
  'TRAILING_STOP',
  'OCO',
]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

/**
 * Order status enumeration
 */
export const OrderStatusSchema = z.enum([
  'PENDING',
  'PARTIALLY_FILLED',
  'FILLED',
  'CANCELED',
  'REJECTED',
  'EXPIRED',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/**
 * Time in force enumeration
 */
export const TimeInForceSchema = z.enum(['GTC', 'IOC', 'FOK', 'DAY']);
export type TimeInForce = z.infer<typeof TimeInForceSchema>;

/**
 * Position side enumeration
 */
export const PositionSideSchema = z.enum(['LONG', 'SHORT']);
export type PositionSide = z.infer<typeof PositionSideSchema>;

/**
 * Instrument type enumeration
 */
export const InstrumentTypeSchema = z.enum([
  'FOREX',
  'CFD',
  'CRYPTO',
  'COMMODITY',
  'INDEX',
  'STOCK',
]);
export type InstrumentType = z.infer<typeof InstrumentTypeSchema>;

/**
 * Account information schema
 */
export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  balance: z.number(),
  equity: z.number(),
  margin: z.number(),
  freeMargin: z.number(),
  marginLevel: z.number().optional(),
  currency: z.string(),
  leverage: z.number(),
  isActive: z.boolean(),
  server: z.string().optional(),
});

export type Account = z.infer<typeof AccountSchema>;

/**
 * Instrument information schema
 */
export const InstrumentSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  type: InstrumentTypeSchema,
  baseAsset: z.string(),
  quoteAsset: z.string(),
  minSize: z.number(),
  maxSize: z.number(),
  stepSize: z.number(),
  tickSize: z.number(),
  digits: z.number(),
  tradable: z.boolean(),
  marginRate: z.number().optional(),
  swapLong: z.number().optional(),
  swapShort: z.number().optional(),
});

export type Instrument = z.infer<typeof InstrumentSchema>;

/**
 * Price quote schema
 */
export const QuoteSchema = z.object({
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  spread: z.number().optional(),
  timestamp: z.number(),
});

export type Quote = z.infer<typeof QuoteSchema>;

/**
 * Order request schema
 */
export const OrderRequestSchema = z.object({
  symbol: z.string(),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  timeInForce: TimeInForceSchema.default('GTC'),
  clientOrderId: z.string().optional(),
  // OCO specific fields
  ocoGroup: z.string().optional(),
  // Stop-loss and take-profit
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  // Trailing stop specific
  trailingAmount: z.number().positive().optional(),
  trailingPercent: z.number().positive().optional(),
});

export type OrderRequest = z.infer<typeof OrderRequestSchema>;

/**
 * Order response schema
 */
export const OrderSchema = z.object({
  id: z.string(),
  clientOrderId: z.string().optional(),
  symbol: z.string(),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  quantity: z.number(),
  price: z.number().optional(),
  stopPrice: z.number().optional(),
  status: OrderStatusSchema,
  timeInForce: TimeInForceSchema,
  filledQuantity: z.number(),
  remainingQuantity: z.number(),
  averagePrice: z.number().optional(),
  commission: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  ocoGroup: z.string().optional(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
});

export type Order = z.infer<typeof OrderSchema>;

/**
 * Position schema
 */
export const PositionSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: PositionSideSchema,
  size: z.number(),
  entryPrice: z.number(),
  markPrice: z.number(),
  unrealizedPnl: z.number(),
  realizedPnl: z.number(),
  margin: z.number(),
  commission: z.number(),
  swap: z.number().optional(),
  openTime: z.number(),
  updateTime: z.number().optional(),
});

export type Position = z.infer<typeof PositionSchema>;

/**
 * Trade execution schema
 */
export const TradeSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  symbol: z.string(),
  side: OrderSideSchema,
  quantity: z.number(),
  price: z.number(),
  commission: z.number(),
  timestamp: z.number(),
});

export type Trade = z.infer<typeof TradeSchema>;

/**
 * Market data subscription request
 */
export const MarketDataRequestSchema = z.object({
  symbols: z.array(z.string()),
  depth: z.number().optional(),
  interval: z.number().optional(),
});

export type MarketDataRequest = z.infer<typeof MarketDataRequestSchema>;

/**
 * Order book entry schema
 */
export const OrderBookEntrySchema = z.object({
  price: z.number(),
  size: z.number(),
});

export type OrderBookEntry = z.infer<typeof OrderBookEntrySchema>;

/**
 * Order book schema
 */
export const OrderBookSchema = z.object({
  symbol: z.string(),
  bids: z.array(OrderBookEntrySchema),
  asks: z.array(OrderBookEntrySchema),
  timestamp: z.number(),
});

export type OrderBook = z.infer<typeof OrderBookSchema>;

/**
 * Candlestick data schema
 */
export const CandlestickSchema = z.object({
  symbol: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  timestamp: z.number(),
});

export type Candlestick = z.infer<typeof CandlestickSchema>;