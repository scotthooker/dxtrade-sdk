/**
 * DXtrade WebSocket/Push API module exports
 */

export { PushClient } from './push-client.js';
export { ConnectionManager } from './connection-manager.js';

// Unified WebSocket streaming (new dual-connection implementation)
export { DXWebSocketClient } from './dx-websocket-client.js';
export { UnifiedWebSocketStream, startUnifiedWebSocketStream } from './unified-stream.js';

// DXTrade WebSocket streaming (recommended)
export { DXTradeStreamManager, createDXTradeStreamManager } from './dxtrade-stream-manager.js';

// Re-export types
export type {
  MarketDataConfig,
  BackfillConfig,
  PushClientConfig,
} from './push-client.js';

export type { 
  WebSocketSubscription, 
  WebSocketStatus,
  PingMessage,
  SubscriptionRequest 
} from './dx-websocket-client.js';

export type { 
  StreamOptions, 
  StreamCallbacks 
} from './unified-stream.js';