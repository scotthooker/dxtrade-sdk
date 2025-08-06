# DXTrade TypeScript SDK

[![npm version](https://badge.fury.io/js/dxtrade-sdk.svg)](https://badge.fury.io/js/dxtrade-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()

A production-ready, enterprise-grade TypeScript SDK for DXTrade REST and WebSocket APIs. Features comprehensive TypeScript typing, battle-tested WebSocket dual-connection architecture, automatic ping/pong handling, and robust error recovery patterns.

## Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [📖 Configuration](#-configuration)
- [🔐 Authentication](#-authentication)
- [📊 DXTrade Real-time Streaming](#-dxtrade-real-time-streaming)
- [📚 API Reference](#-api-reference)
- [🛠️ Advanced Features](#️-advanced-features)
- [🧪 Testing](#-testing)
- [📝 Examples](#-examples)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## ✨ Features

### 🏗️ **Enterprise Architecture**
- **Platform Agnostic**: Works with any DXtrade broker through configuration
- **Strict TypeScript**: No `any` types, comprehensive interfaces
- **ESM First**: Modern ES modules with Node.js 20+ support
- **Robust Error Handling**: Comprehensive error taxonomy with detailed context
- **Production Ready**: Battle-tested patterns for enterprise applications

### 🔄 **Reliability & Resilience**
- **Exponential Backoff**: Full jitter retry logic for optimal performance
- **Rate Limiting**: Smart rate limiting with Retry-After header support
- **Circuit Breaker**: Prevents cascading failures
- **Clock Synchronization**: Handles server time drift automatically (configurable)
- **Idempotency**: Built-in idempotency key support for safe retries

### 🌐 **DXTrade WebSocket Excellence**
- **Dual WebSocket Architecture**: Dedicated market data and portfolio connections
- **Automatic Ping/Pong**: Server ping request handling for connection stability
- **Battle-Tested Patterns**: Based on proven 5-minute stability test implementation
- **Intelligent Reconnection**: Exponential backoff with configurable retry limits
- **Connection Health Monitoring**: Real-time status and message statistics
- **Seamless Message Handling**: Type-safe parsing of all DXTrade message formats
- **Built-in Stability Testing**: Comprehensive connection validation tools

### 📊 **Comprehensive API Coverage**
- **Authentication**: Credentials, session token, bearer token, HMAC
- **Accounts & Balances**: Full account management and balance tracking
- **Instruments & Prices**: Metadata, quotes, streaming market data
- **Orders**: Place, modify, cancel orders (including OCO, bracket orders)
- **Positions**: Position management with risk metrics
- **Real-time Streaming**: Live quotes, order book, trade executions

### 🔧 **Broker Configuration**
- **Environment Variables**: Configure any broker without code changes
- **Feature Flags**: Enable/disable features based on broker capabilities
- **Custom Endpoints**: Override default API paths
- **WebSocket Paths**: Configure market data and portfolio WebSocket paths
- **Rate Limiting**: Broker-specific rate limit configuration

## 🚀 Quick Start

### Installation

```bash
npm install dxtrade-sdk
```

### Environment Configuration

Configure your broker using environment variables. The SDK supports two approaches:

#### Explicit URLs (Recommended)

```bash
# Authentication
DXTRADE_USERNAME=your_username
DXTRADE_PASSWORD=your_password

# Explicit URLs (no concatenation issues)
DXTRADE_LOGIN_URL=https://your-broker.com/api/login
DXTRADE_ACCOUNTS_URL=https://your-broker.com/api/accounts
DXTRADE_WS_MARKET_DATA_URL=wss://your-broker.com/ws/md?format=JSON
DXTRADE_WS_PORTFOLIO_URL=wss://your-broker.com/ws/?format=JSON

# Optional
DXTRADE_DOMAIN=default
DXTRADE_FEATURE_WEBSOCKET=true
```

#### Legacy Base URLs (Backward Compatible)

```bash
# Required
DXTRADE_API_URL=https://api.your-broker.com/api
DXTRADE_USERNAME=your_username
DXTRADE_PASSWORD=your_password

# Optional
DXTRADE_WS_URL=wss://ws.your-broker.com/ws
```

### Basic Usage

```typescript
import { createConfigWithEnv, DXTradeClient } from 'dxtrade-sdk';

// Load configuration from environment
const config = createConfigWithEnv();
const client = new DXTradeClient(config);

// Connect to APIs
await client.connect();

// Get account information
const accounts = await client.accounts.getAccounts();
console.log('Accounts:', accounts);

// REST API: Get market data
const instruments = await client.instruments.getInstruments();
console.log('Available instruments:', instruments);

// DXTrade WebSocket Streaming (Recommended)
const streamManager = await client.startDXTradeStream({
  symbols: ['EUR/USD', 'GBP/USD', 'XAU/USD'],
  enableMarketData: true,
  enablePortfolio: true,
  enablePingResponse: true, // Automatic ping/pong handling
}, {
  onMarketData: (data) => {
    console.log('Market Data:', data.payload);
  },
  onAccountPortfolios: (data) => {
    console.log('Portfolio Update:', data.payload);
  },
  onPingRequest: (data) => {
    console.log('Server ping handled automatically');
  },
  onConnected: (connectionType) => {
    console.log(`${connectionType} WebSocket connected`);
  },
});

// Monitor connection health
const status = streamManager.getStatus();
console.log('Stream Status:', {
  marketDataConnected: status.marketData.connected,
  portfolioConnected: status.portfolio.connected,
  totalMessages: status.marketData.messageCount + status.portfolio.messageCount,
  pingStats: status.pingStats,
});

// Place a market order
const order = await client.orders.placeOrder({
  symbol: 'EUR/USD',
  side: 'BUY',
  type: 'MARKET',
  quantity: 1000, // 1000 units
});

console.log('Order placed:', order);

// Cleanup
await streamManager.disconnect();
await client.disconnect();
```

## 📖 Configuration

### Explicit URL Configuration (Recommended)

The SDK supports explicit URL configuration for maximum reliability:

#### Why Explicit URLs?

- ✅ **No concatenation errors**: Each URL is complete and exact
- ✅ **Flexible routing**: Different endpoints can use different domains/ports
- ✅ **Clear configuration**: You see exactly what URLs are being used
- ✅ **Better debugging**: Know exact URLs in logs and errors
- ✅ **Production ready**: Reliable for load balancing and microservices

#### Complete .env Configuration

```bash
# Authentication
DXTRADE_USERNAME=your_username
DXTRADE_PASSWORD=your_password
DXTRADE_DOMAIN=default
DXTRADE_ACCOUNT=default:dealtest

# Environment
DXTRADE_ENVIRONMENT=live

# Explicit API URLs (recommended)
DXTRADE_LOGIN_URL=https://your-broker.com/api/login
DXTRADE_LOGOUT_URL=https://your-broker.com/api/logout
DXTRADE_ACCOUNTS_URL=https://your-broker.com/api/accounts
DXTRADE_ACCOUNTS_METRICS_URL=https://your-broker.com/api/accounts/metrics
DXTRADE_ACCOUNTS_POSITIONS_URL=https://your-broker.com/api/accounts/positions
DXTRADE_ACCOUNTS_ORDERS_URL=https://your-broker.com/api/accounts/orders
DXTRADE_ACCOUNTS_ORDERS_HISTORY_URL=https://your-broker.com/api/accounts/orders/history
DXTRADE_INSTRUMENTS_QUERY_URL=https://your-broker.com/api/instruments/query
DXTRADE_CONVERSION_RATES_URL=https://your-broker.com/api/conversionRates
DXTRADE_TIME_URL=https://your-broker.com/api/time

# Explicit WebSocket URLs
DXTRADE_WS_MARKET_DATA_URL=wss://your-broker.com/ws/md?format=JSON
DXTRADE_WS_PORTFOLIO_URL=wss://your-broker.com/ws/?format=JSON

# Optional Features
DXTRADE_FEATURE_CLOCK_SYNC=true
DXTRADE_FEATURE_WEBSOCKET=true
DXTRADE_FEATURE_AUTO_RECONNECT=true
DXTRADE_FEATURE_RATE_LIMITING=true
DXTRADE_FEATURE_AUTOMATIC_RETRY=true

# WebSocket Configuration
DXTRADE_WS_FORMAT=JSON
DXTRADE_WS_PING_INTERVAL=45
DXTRADE_WS_RECONNECT_ATTEMPTS=5
DXTRADE_WS_RECONNECT_DELAY=1.0

# Rate Limiting Configuration
DXTRADE_RATE_LIMIT_ENABLED=true
DXTRADE_RATE_LIMIT_PER_SECOND=10
DXTRADE_RATE_LIMIT_PER_MINUTE=100
DXTRADE_RATE_LIMIT_BURST_SIZE=20

# Retry Configuration
DXTRADE_RETRY_ENABLED=true
DXTRADE_RETRY_MAX_ATTEMPTS=3
DXTRADE_RETRY_BASE_DELAY=0.5
DXTRADE_RETRY_MAX_DELAY=30.0
DXTRADE_RETRY_JITTER=true

# Logging Configuration
DXTRADE_LOG_LEVEL=INFO
DXTRADE_LOG_REQUESTS=false
DXTRADE_LOG_RESPONSES=false
```

### Environment Variables Reference

#### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DXTRADE_ENVIRONMENT` | Trading environment (`demo` or `live`) | `demo` | No |
| `DXTRADE_BASE_URL` | Base URL for the broker's API | Auto-detected | No |
| `DXTRADE_TIMEOUT` | Request timeout in milliseconds | `30000` | No |
| `DXTRADE_RETRIES` | Number of retry attempts | `3` | No |

#### Authentication Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DXTRADE_USERNAME` | Trading account username | Yes |
| `DXTRADE_PASSWORD` | Trading account password | Yes |
| `DXTRADE_DOMAIN` | Account domain | No (default: `default`) |
| `DXTRADE_SESSION_TOKEN` | Pre-authenticated session token | Alternative |
| `DXTRADE_BEARER_TOKEN` | Bearer authentication token | Alternative |
| `DXTRADE_API_KEY` | API key for HMAC auth | Alternative |
| `DXTRADE_API_SECRET` | API secret for HMAC auth | Alternative |

### Discovering Broker Endpoints

Use the discovery tool to find your broker's endpoints:

```bash
export DXTRADE_BASE_URL=https://your-broker.com/api
export DXTRADE_USERNAME=your_username
export DXTRADE_PASSWORD=your_password

npm run discover:endpoints
```

### Testing Configuration

Test your broker configuration:

```bash
# Test general environment configuration
npm run test:env-config

# Test explicit URL configuration
npm run test:explicit-urls

# Test data reception
npm run test:data-reception
```

## 🔐 Authentication

The SDK supports multiple authentication methods:

### Credentials Authentication

```typescript
const config = {
  auth: {
    type: 'credentials',
    username: 'your_username',
    password: 'your_password',
    domain: 'default',
  },
  baseUrl: 'https://api.your-broker.com/api',
};
```

### Session Token Authentication

```typescript
const config = {
  auth: {
    type: 'session',
    token: 'your-session-token',
  },
  baseUrl: 'https://api.your-broker.com/api',
};
```

### Bearer Token Authentication

```typescript
const config = {
  auth: {
    type: 'bearer',
    token: 'your-bearer-token',
  },
  baseUrl: 'https://api.your-broker.com/api',
};
```

### HMAC Authentication

```typescript
const config = {
  auth: {
    type: 'hmac',
    apiKey: 'your-api-key',
    secret: 'your-secret',
  },
  baseUrl: 'https://api.your-broker.com/api',
};
```

## 📊 DXTrade Real-time Streaming

### Enhanced WebSocket Streaming

The SDK provides a robust DXTrade WebSocket implementation with dual connections:

```typescript
// Create and start DXTrade stream manager
const streamManager = await client.startDXTradeStream({
  symbols: ['EUR/USD', 'GBP/USD', 'XAU/USD'],
  account: 'default:dealtest',
  enableMarketData: true,
  enablePortfolio: true,
  enablePingResponse: true, // Handle server ping requests automatically
  autoReconnect: true,
  maxReconnectAttempts: 5,
}, {
  // Market data callbacks
  onMarketData: (data) => {
    console.log(`Market Data: ${data.payload?.symbol} - ${data.payload?.bid}/${data.payload?.ask}`);
  },
  
  // Portfolio callbacks
  onAccountPortfolios: (portfolio) => {
    console.log(`Portfolio: Balance=${portfolio.payload?.balance}, Equity=${portfolio.payload?.equity}`);
  },
  
  onPositionUpdate: (position) => {
    console.log(`Position: ${position.payload.symbol} - ${position.payload.size} units`);
  },
  
  onOrderUpdate: (order) => {
    console.log(`Order: ${order.payload.orderId} - ${order.payload.status}`);
  },
  
  // Connection callbacks
  onConnected: (connectionType) => {
    console.log(`${connectionType} WebSocket connected successfully`);
  },
  
  onPingRequest: (data) => {
    console.log('Server ping handled automatically'); // SDK responds automatically
  },
  
  onError: (connectionType, error) => {
    console.error(`${connectionType} error:`, error.message);
  },
});

// Monitor stream health
const status = streamManager.getStatus();
console.log('Stream Health:', {
  ready: status.isReady,
  marketData: status.marketData.connected,
  portfolio: status.portfolio.connected,
  totalMessages: status.marketData.messageCount + status.portfolio.messageCount,
  pingRequestsHandled: status.pingStats.requestsReceived,
});

// Run stability test
const testResult = await streamManager.runStabilityTest(300000); // 5 minutes
console.log(`Stability test: ${testResult.success ? 'PASSED' : 'FAILED'}`);
console.log(`Messages received: ${testResult.messageCount}, Pings handled: ${testResult.pingRequestsReceived}`);
```

### Stream Options

```typescript
interface DXTradeStreamOptions {
  symbols?: string[];                 // Symbols to subscribe to
  account?: string;                   // Trading account
  enableMarketData?: boolean;         // Enable market data stream
  enablePortfolio?: boolean;          // Enable portfolio stream
  enablePingResponse?: boolean;       // Auto-respond to ping requests
  autoReconnect?: boolean;            // Auto-reconnect on disconnect
  maxReconnectAttempts?: number;      // Max reconnection attempts
  reconnectDelay?: number;            // Delay between reconnect attempts
  connectionTimeout?: number;         // Connection timeout
}
```

### Stream Callbacks

```typescript
interface DXTradeStreamCallbacks {
  onConnected?: (connectionType: 'marketData' | 'portfolio') => void;
  onDisconnected?: (connectionType: 'marketData' | 'portfolio', code: number, reason: string) => void;
  onError?: (connectionType: 'marketData' | 'portfolio', error: Error) => void;
  onMarketData?: (data: MarketDataMessage) => void;
  onAccountPortfolios?: (data: AccountPortfoliosMessage) => void;
  onPositionUpdate?: (data: PositionUpdateMessage) => void;
  onOrderUpdate?: (data: OrderUpdateMessage) => void;
  onPingRequest?: (data: PingRequestMessage) => void;
  onRawMessage?: (connectionType: 'marketData' | 'portfolio', data: any) => void;
  onReconnecting?: (connectionType: 'marketData' | 'portfolio', attempt: number) => void;
  onReconnected?: (connectionType: 'marketData' | 'portfolio') => void;
}
```

### Built-in Stability Testing

Run comprehensive stability tests like the original test implementation:

```typescript
// Quick test (30 seconds)
const result = await client.runDXTradeStreamTest(30000, {
  symbols: ['EUR/USD'],
  enableMarketData: true,
  enablePortfolio: false,
});

console.log('Test Results:', {
  success: result.success,
  duration: `${result.duration}s`,
  messagesReceived: result.messageCount,
  marketDataCount: result.marketDataCount,
  pingRequestsHandled: result.pingRequestsReceived,
  connectionStable: result.connectionStable,
});
```

### REST API Polling

For brokers without WebSocket support:

```typescript
// Poll for market data
setInterval(async () => {
  const quotes = await client.marketData.getQuotes(['EURUSD']);
  console.log('Latest quotes:', quotes);
}, 2000);
```

## 📚 API Reference

### Client

#### DXTradeClient

Main SDK client for managing both REST and WebSocket connections.

```typescript
import { DXTradeClient, createConfigWithEnv } from 'dxtrade-sdk';

const config = createConfigWithEnv();
const client = new DXTradeClient(config);
```

**Methods:**
- `connect()`: Connect to DXTrade APIs
- `disconnect()`: Disconnect from all APIs
- `isReady()`: Check if client is ready for operations
- `getStatus()`: Get comprehensive client status
- `healthCheck()`: Perform health check on all services
- `destroy()`: Cleanup all resources

**DXTrade WebSocket Methods:**
- `createDXTradeStream(options?, callbacks?)`: Create DXTrade stream manager
- `startDXTradeStream(options?, callbacks?)`: Create and connect stream manager
- `runDXTradeStreamTest(duration?, options?, callbacks?)`: Run stability test

### REST APIs

#### AccountsApi

Account management and balance information.

```typescript
// Get all accounts
const accounts = await client.accounts.getAccounts();

// Get account balance
const balance = await client.accounts.getBalance(accountId);

// Get account summary
const summary = await client.accounts.getSummary(accountId);

// Get account history
const history = await client.accounts.getHistory(accountId, {
  startDate: '2024-01-01',
  endDate: '2024-01-31',
});
```

#### InstrumentsApi

Instrument metadata and market data.

```typescript
// Get all instruments
const instruments = await client.instruments.getInstruments();

// Get specific instrument
const instrument = await client.instruments.getInstrument('EUR/USD');

// Get market hours
const hours = await client.instruments.getMarketHours('EUR/USD');

// Get historical data
const history = await client.instruments.getHistoricalData('EUR/USD', {
  timeframe: '1h',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
});
```

#### OrdersApi

Order management and execution.

```typescript
// Place market order
const order = await client.orders.placeOrder({
  symbol: 'EUR/USD',
  side: 'BUY',
  type: 'MARKET',
  quantity: 1000,
});

// Place limit order
const limitOrder = await client.orders.placeOrder({
  symbol: 'EUR/USD',
  side: 'SELL',
  type: 'LIMIT',
  quantity: 1000,
  price: 1.1000,
  timeInForce: 'GTC',
});

// Get orders
const orders = await client.orders.getOrders();

// Get order by ID
const orderInfo = await client.orders.getOrder(orderId);

// Cancel order
await client.orders.cancelOrder(orderId);

// Modify order
const modified = await client.orders.modifyOrder(orderId, {
  price: 1.1050,
  quantity: 2000,
});
```

#### PositionsApi

Position management and monitoring.

```typescript
// Get all positions
const positions = await client.positions.getPositions();

// Get position by symbol
const position = await client.positions.getPosition('EUR/USD');

// Get portfolio summary
const portfolio = await client.positions.getPortfolioSummary();

// Close position
await client.positions.closePosition('EUR/USD');

// Get position statistics
const stats = await client.positions.getPositionStatistics('EUR/USD');
```

### Types

#### Authentication Types

```typescript
// Credentials authentication
type CredentialsAuth = {
  type: 'credentials';
  username: string;
  password: string;
  domain?: string;
};

// Session token authentication
type SessionAuth = {
  type: 'session';
  token: string;
};

// Bearer token authentication
type BearerAuth = {
  type: 'bearer';
  token: string;
};

// HMAC authentication
type HmacAuth = {
  type: 'hmac';
  apiKey: string;
  secret: string;
};
```

#### Order Types

```typescript
interface OrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'DAY';
  clientOrderId?: string;
}

interface Order {
  id: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  status: 'PENDING' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED';
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  price?: number;
  averagePrice?: number;
  timestamp: number;
  lastUpdate: number;
}
```

#### Position Types

```typescript
interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  timestamp: number;
}
```

#### DXTrade Message Types

```typescript
// Market data message
interface MarketDataMessage {
  type: 'MarketData';
  payload: {
    symbol?: string;
    bid?: number;
    ask?: number;
    last?: number;
    volume?: number;
    timestamp?: number;
  };
}

// Account portfolio message
interface AccountPortfoliosMessage {
  type: 'AccountPortfolios';
  payload: {
    account?: string;
    balance?: number;
    equity?: number;
    margin?: number;
    freeMargin?: number;
    positions?: Array<{
      symbol: string;
      quantity: number;
      entryPrice?: number;
      currentPrice?: number;
      unrealizedPnl?: number;
    }>;
  };
}

// Ping request from server
interface PingRequestMessage {
  type: 'PingRequest';
  timestamp: string;
}
```

### Error Handling

The SDK provides comprehensive error types:

```typescript
import { 
  DXError,
  NetworkError,
  AuthError,
  ValidationError,
  RateLimitError,
  TradingError,
  WebSocketError,
  TimeoutError,
  isRetryableError
} from 'dxtrade-sdk';

try {
  await client.orders.placeOrder(orderRequest);
} catch (error) {
  if (error instanceof NetworkError) {
    console.log('Network issue:', error.message);
    // Retry logic
  } else if (error instanceof AuthError) {
    console.log('Authentication failed:', error.message);
    // Re-authenticate
  } else if (error instanceof RateLimitError) {
    console.log('Rate limited, retry after:', error.retryAfter);
    // Wait and retry
  } else if (error instanceof ValidationError) {
    console.log('Invalid request:', error.details);
    // Fix request parameters
  } else if (error instanceof TradingError) {
    console.log('Trading error:', error.code, error.message);
    // Handle trading-specific error
  } else if (error instanceof WebSocketError) {
    console.log('WebSocket error:', error.message);
    // Handle connection issues
  }
}
```

#### Error Properties

All errors extend `DXError` and include:

- `name`: Error type name
- `message`: Error description
- `code`: Error code (when available)
- `details`: Additional error details
- `timestamp`: When the error occurred
- `retryAfter`: For rate limit errors, seconds to wait

#### Retryable Errors

Use `isRetryableError(error)` to determine if an error should be retried:

```typescript
try {
  await client.orders.placeOrder(orderRequest);
} catch (error) {
  if (isRetryableError(error)) {
    // Implement retry logic
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Retry the operation
  } else {
    // Handle non-retryable error
    console.error('Operation failed:', error.message);
  }
}
```

## 🛠️ Advanced Features

### Rate Limiting

The SDK automatically handles rate limiting:

```typescript
const config = {
  rateLimit: {
    requests: 100,      // Max requests per window
    window: 60000,      // Time window in ms
  },
};
```

### Connection Management

Automatic reconnection with exponential backoff:

```typescript
client.on('reconnecting', (attempt) => {
  console.log(`Reconnecting... Attempt ${attempt}`);
});

client.on('reconnected', () => {
  console.log('Successfully reconnected');
});
```

### Programmatic Configuration

```typescript
import { DXTradeClient } from 'dxtrade-sdk';

const client = new DXTradeClient({
  environment: 'demo',
  auth: {
    type: 'credentials',
    username: 'your_username',
    password: 'your_password',
  },
  baseUrl: 'https://your-broker.com/api',
  urls: {
    wsMarketData: 'wss://your-broker.com/ws/md?format=JSON',
    wsPortfolio: 'wss://your-broker.com/ws/?format=JSON',
  },
  features: {
    websocket: true,
    clockSync: false,
    autoReconnect: true,
  },
  rateLimit: {
    requests: 100,
    window: 60000,
  },
  timeout: 30000,
  retries: 3,
});
```

## 📝 Examples

Check the `examples/` directory for complete examples:

### Core Examples
- `test-env-config.ts` - Environment configuration validation
- `discover-endpoints.ts` - Automatic broker endpoint discovery
- `test-data-reception.ts` - Comprehensive API testing

### DXTrade WebSocket Examples  
- `dxtrade-stream-example.ts` - **Full-featured DXTrade WebSocket streaming demo**
- `test-dxtrade-stream.ts` - Quick validation test for WebSocket functionality
- `test-websocket-5min.ts` - Original 5-minute stability test implementation

### Running Examples

```bash
# Test your configuration
npm run example:config

# Discover broker endpoints
npm run example:discover  

# Test API data reception
npm run example:data-reception

# Run DXTrade WebSocket streaming demo
npm run example:dxtrade-stream

# Quick WebSocket validation
npm run example:stream-test

# Original 5-minute stability test
npm run example:websocket-5min
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test
npm test -- market-data

# Test your configuration
npm run test:env-config

# Test explicit URL configuration
npm run test:explicit-urls

# Test data reception
npm run test:data-reception
```

## Troubleshooting

### Common Issues

1. **Authentication Fails**
   - Verify credentials are correct
   - Check if domain needs to be specified
   - Ensure the login endpoint path is correct

2. **Market Data Not Available**
   - Verify the account parameter is correct
   - Check if market data endpoint requires different authentication
   - Ensure symbols are in the correct format for your broker

3. **WebSocket Connection Fails**
   - Check if broker supports WebSocket
   - Verify WebSocket URL is correct
   - Try different WebSocket paths (e.g., `/ws`, `/websocket`, `/stream`)
   - Set `DXTRADE_FEATURE_WEBSOCKET=false` if not supported

4. **Clock Sync Errors**
   - Check if broker supports time endpoint
   - Set `DXTRADE_FEATURE_CLOCK_SYNC=false` if not supported

5. **Rate Limiting**
   - Reduce request frequency
   - Adjust `DXTRADE_RATE_LIMIT_REQUESTS` and `DXTRADE_RATE_LIMIT_WINDOW`

### Security Best Practices

1. **Never commit credentials** - Use environment variables or secure vaults
2. **Use separate credentials** for development and production
3. **Rotate API keys regularly** if using HMAC authentication
4. **Limit API permissions** to only what's needed
5. **Use secure storage** for environment variables in production
6. **Enable SSL/TLS** for all connections
7. **Monitor API usage** for unusual activity
8. **Implement proper error handling** to avoid exposing sensitive information

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Resources

- [DXtrade Documentation](https://dx.trade/api-docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)

## ⚠️ Disclaimer

This SDK is provided as-is for integration with DXtrade platforms. Trading involves risk. Always test thoroughly in demo environments before using in production.