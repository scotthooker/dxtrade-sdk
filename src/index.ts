/**
 * DXtrade TypeScript SDK
 * 
 * A production-ready SDK for DXtrade REST and WebSocket APIs with:
 * - Comprehensive TypeScript typing
 * - Exponential backoff and retry logic
 * - Rate limiting and idempotency
 * - Clock synchronization
 * - WebSocket state management
 * - Automatic reconnection
 * - Comprehensive error handling
 */

// Main client
export {
  DXTradeClient,
  createDXTradeClient,
  createDemoClient,
  createLiveClient,
  createRestOnlyClient,
  type DXTradeClientConfig,
} from './client.js';

// Core HTTP client
export { HttpClient } from './core/http-client.js';

// REST API modules
export { AccountsApi } from './rest/accounts.js';
export { InstrumentsApi } from './rest/instruments.js';
export { OrdersApi } from './rest/orders.js';
export { PositionsApi } from './rest/positions.js';

// WebSocket client
export { PushClient } from './websocket/push-client.js';
export { ConnectionManager } from './websocket/connection-manager.js';

// Type definitions
export type {
  // Common types
  Environment,
  AuthConfig,
  SDKConfig,
  HTTPMethod,
  RequestConfig,
  ApiResponse,
  BackoffConfig,
  ClockSync,
  RateLimiterState,
} from './types/common.js';

export type {
  // Trading types
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  PositionSide,
  InstrumentType,
  Account,
  Instrument,
  Quote,
  OrderRequest,
  Order,
  Position,
  Trade,
  MarketDataRequest,
  OrderBookEntry,
  OrderBook,
  Candlestick,
} from './types/trading.js';

export type {
  // WebSocket types
  ConnectionState,
  MessageType,
  SubscriptionType,
  WebSocketConfig,
  WebSocketMessage,
  WebSocketEventMap,
  SubscriptionRequest,
  UnsubscriptionRequest,
  HeartbeatMessage,
  AuthMessage,
  ErrorMessage,
  QuoteUpdateMessage,
  OrderBookUpdateMessage,
  TradeUpdateMessage,
  OrderUpdateMessage,
  PositionUpdateMessage,
  AccountUpdateMessage,
  SubscriptionState,
} from './types/websocket.js';

// REST API specific types
export type {
  AccountBalance,
  AccountSummary,
  AccountHistoryEntry,
  AccountHistoryQuery,
} from './rest/accounts.js';

export type {
  InstrumentFilter,
  MarketHours,
  InstrumentSpec,
  HistoricalData,
  PriceStatistics,
} from './rest/instruments.js';

export type {
  OrderModification,
  OrderQuery,
  OcoOrderRequest,
  BracketOrderRequest,
  OrderExecution,
} from './rest/orders.js';

export type {
  PositionQuery,
  PositionModification,
  PositionCloseRequest,
  PositionStatistics,
  PositionRisk,
  PortfolioSummary,
} from './rest/positions.js';

// WebSocket specific types
export type {
  MarketDataConfig,
  BackfillConfig,
  PushClientConfig,
} from './websocket/push-client.js';

// Error classes
export {
  DXError,
  ConfigError,
  AuthError,
  NetworkError,
  RateLimitError,
  ValidationError,
  TradingError,
  WebSocketError,
  MarketDataError,
  TimeoutError,
  ClockSyncError,
  ErrorFactory,
  // Type guards
  isNetworkError,
  isRateLimitError,
  isAuthError,
  isValidationError,
  isTradingError,
  isWebSocketError,
  isRetryableError,
} from './errors/index.js';

// Utility classes
export { RateLimiter, AdaptiveRateLimiter } from './utils/rate-limiter.js';
export {
  ExponentialBackoff,
  DecorrelatedJitterBackoff,
  CircuitBreaker,
  retryWithBackoff,
} from './utils/backoff.js';
export {
  ClockSynchronizer,
  TimestampGenerator,
  TimestampUtils,
} from './utils/clock-sync.js';

// Version information
export const VERSION = '1.0.0';

// SDK metadata
export const SDK_INFO = {
  name: 'dxtrade-sdk',
  version: VERSION,
  description: 'Production-ready TypeScript SDK for DXtrade REST and WebSocket APIs',
  repository: 'https://github.com/your-org/dxtrade-sdk',
  documentation: 'https://docs.your-org.com/dxtrade-sdk',
  support: {
    issues: 'https://github.com/your-org/dxtrade-sdk/issues',
    discussions: 'https://github.com/your-org/dxtrade-sdk/discussions',
    email: 'support@your-org.com',
  },
} as const;

/**
 * Default export for convenience
 */
export default DXTradeClient;