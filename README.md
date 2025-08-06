# DXtrade TypeScript SDK

[![npm version](https://badge.fury.io/js/dxtrade-sdk.svg)](https://badge.fury.io/js/dxtrade-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Coverage](https://img.shields.io/badge/Coverage-90%25+-brightgreen.svg)]()

A production-ready TypeScript SDK for DXtrade's REST and WebSocket APIs with comprehensive typing, robust connection management, and enterprise-grade reliability features.

## ✨ Features

### 🏗️ **Enterprise Architecture**
- **Strict TypeScript**: No `any` types, comprehensive interfaces
- **ESM First**: Modern ES modules with Node.js 20+ support
- **Robust Error Handling**: Comprehensive error taxonomy with detailed context
- **Production Ready**: Battle-tested patterns for enterprise applications

### 🔄 **Reliability & Resilience**
- **Exponential Backoff**: Full jitter retry logic for optimal performance
- **Rate Limiting**: Smart rate limiting with Retry-After header support
- **Circuit Breaker**: Prevents cascading failures
- **Clock Synchronization**: Handles server time drift automatically
- **Idempotency**: Built-in idempotency key support for safe retries

### 🌐 **WebSocket Excellence**
- **State Machine**: Robust connection state management (idle → connecting → open → closing → closed)
- **Auto-Reconnection**: Intelligent reconnection with exponential backoff
- **Automatic Resubscription**: Seamless resubscription after reconnection
- **Heartbeat Management**: Built-in ping/pong with timeout detection
- **Backpressure Handling**: Bounded message queues prevent memory leaks

### 📊 **Comprehensive API Coverage**
- **Authentication**: Bearer token, HMAC, session-based (pluggable)
- **Accounts & Balances**: Full account management and balance tracking
- **Instruments & Prices**: Metadata, quotes, streaming market data
- **Orders**: Place, modify, cancel orders (including OCO, bracket orders)
- **Positions**: Position management with risk metrics
- **Real-time Streaming**: Live quotes, order book, trade executions

## 🚀 Quick Start

### Installation

```bash
npm install dxtrade-sdk
```

### Basic Usage

```typescript
import { createDemoClient } from 'dxtrade-sdk';

// Create demo client with bearer token
const client = createDemoClient({
  type: 'bearer',
  token: 'your-api-token',
});

// Connect to APIs
await client.connect();

// Get account information
const accounts = await client.accounts.getAccounts();
console.log('Accounts:', accounts);

// Get real-time quotes
if (client.push) {
  client.push.on('quote', (quote) => {
    console.log(`${quote.symbol}: ${quote.bid}/${quote.ask}`);
  });
  
  client.push.subscribeToQuotes(['EURUSD', 'GBPUSD']);
}

// Place a market order
const order = await client.orders.placeOrder({
  symbol: 'EURUSD',
  side: 'BUY',
  type: 'MARKET',
  quantity: 1.0,
});

console.log('Order placed:', order);

// Cleanup
await client.disconnect();
client.destroy();
```

## 📖 API Documentation

### Authentication

The SDK supports multiple authentication methods:

#### Bearer Token Authentication
```typescript
const client = createDemoClient({
  type: 'bearer',
  token: 'your-bearer-token',
});
```

#### HMAC Authentication
```typescript
const client = createDemoClient({
  type: 'hmac',
  apiKey: 'your-api-key',
  secret: 'your-secret',
});
```

#### Session-based Authentication
```typescript
const client = createDemoClient({
  type: 'session',
  token: 'your-session-token',
});
```

#### Credentials Authentication
```typescript
const client = createDemoClient({
  type: 'credentials',
  username: 'your-username',
  password: 'your-password',
  domain: 'your-domain',
});
```

### Account Management

```typescript
// Get all accounts
const accounts = await client.accounts.getAccounts();

// Get account balance
const balance = await client.accounts.getAccountBalance('account-id');

// Get account summary with metrics
const summary = await client.accounts.getAccountSummary('account-id');

// Get account history
const history = await client.accounts.getAccountHistory({
  type: 'TRADE',
  fromDate: Date.now() - 86400000, // 24 hours ago
  limit: 100,
});

// Calculate margin requirement
const marginReq = await client.accounts.calculateMarginRequirement(
  'account-id',
  'EURUSD',
  1.0,
  'BUY'
);
```

### Instruments & Market Data

```typescript
// Get all instruments
const instruments = await client.instruments.getInstruments({
  type: 'FOREX',
  tradable: true,
});

// Get instrument details
const eurusd = await client.instruments.getInstrument('EURUSD');

// Get current quote
const quote = await client.instruments.getQuote('EURUSD');

// Get multiple quotes
const quotes = await client.instruments.getQuotes(['EURUSD', 'GBPUSD', 'USDJPY']);

// Get historical data
const history = await client.instruments.getHistoricalData('EURUSD', {
  timeframe: 'H1',
  fromDate: Date.now() - 86400000,
  limit: 100,
});

// Check if market is open
const marketStatus = await client.instruments.isMarketOpen('EURUSD');
```

### Order Management

```typescript
// Place market order
const marketOrder = await client.orders.placeOrder({
  symbol: 'EURUSD',
  side: 'BUY',
  type: 'MARKET',
  quantity: 1.0,
});

// Place limit order
const limitOrder = await client.orders.placeOrder({
  symbol: 'EURUSD',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 1.0,
  price: 1.1000,
  timeInForce: 'GTC',
});

// Place stop order
const stopOrder = await client.orders.placeOrder({
  symbol: 'EURUSD',
  side: 'SELL',
  type: 'STOP',
  quantity: 1.0,
  stopPrice: 1.0900,
});

// Place OCO order (One-Cancels-Other)
const ocoOrder = await client.orders.placeOcoOrder({
  symbol: 'EURUSD',
  side: 'BUY',
  quantity: 1.0,
  primaryOrder: {
    type: 'LIMIT',
    price: 1.0950,
  },
  secondaryOrder: {
    type: 'STOP',
    stopPrice: 1.0900,
  },
});

// Place bracket order (Entry + Stop Loss + Take Profit)
const bracketOrder = await client.orders.placeBracketOrder({
  symbol: 'EURUSD',
  side: 'BUY',
  quantity: 1.0,
  entryOrder: {
    type: 'LIMIT',
    price: 1.1000,
  },
  stopLoss: 1.0950,
  takeProfit: 1.1100,
});

// Get orders
const orders = await client.orders.getOrders({
  symbol: 'EURUSD',
  status: 'PENDING',
});

// Modify order
const modifiedOrder = await client.orders.modifyOrder({
  orderId: 'order-id',
  price: 1.1050,
  quantity: 1.5,
});

// Cancel order
await client.orders.cancelOrder('order-id');

// Cancel all orders for symbol
await client.orders.cancelAllOrders({
  symbol: 'EURUSD',
});
```

### Position Management

```typescript
// Get all positions
const positions = await client.positions.getPositions();

// Get positions for specific symbol
const eurusdPositions = await client.positions.getPositionsBySymbol('EURUSD');

// Get open positions only
const openPositions = await client.positions.getOpenPositions();

// Modify position (add stop loss/take profit)
const modifiedPosition = await client.positions.modifyPosition({
  positionId: 'position-id',
  stopLoss: 1.0950,
  takeProfit: 1.1100,
});

// Close position partially
await client.positions.closePosition({
  positionId: 'position-id',
  quantity: 0.5, // Close half
});

// Close position completely
await client.positions.closePosition({
  positionId: 'position-id',
});

// Get position statistics
const stats = await client.positions.getPositionStatistics('position-id');

// Get position risk metrics
const risk = await client.positions.getPositionRisk('position-id');

// Get portfolio summary
const portfolio = await client.positions.getPortfolioSummary();

// Calculate optimal position size
const positionSize = await client.positions.calculatePositionSize(
  'EURUSD',
  100, // Risk $100
  1.1000, // Entry price
  1.0950  // Stop loss price
);
```

### Real-time Data (WebSocket/Push API)

```typescript
// Subscribe to quotes
client.push?.subscribeToQuotes(['EURUSD', 'GBPUSD']);

client.push?.on('quote', (quote) => {
  console.log(`${quote.symbol}: ${quote.bid}/${quote.ask} @ ${quote.timestamp}`);
});

// Subscribe to order book
client.push?.subscribeToOrderBook({
  symbols: ['EURUSD'],
  depth: 10,
});

client.push?.on('orderbook', (orderBook) => {
  console.log(`Order book for ${orderBook.symbol}:`);
  console.log('Bids:', orderBook.bids.slice(0, 5));
  console.log('Asks:', orderBook.asks.slice(0, 5));
});

// Subscribe to trades
client.push?.subscribeToTrades(['EURUSD']);

client.push?.on('trade', (trade) => {
  console.log(`Trade: ${trade.symbol} ${trade.side} ${trade.quantity} @ ${trade.price}`);
});

// Subscribe to order updates
client.push?.subscribeToOrders('account-id');

client.push?.on('order', (orderUpdate) => {
  console.log(`Order ${orderUpdate.id} status: ${orderUpdate.status}`);
});

// Subscribe to position updates
client.push?.subscribeToPositions('account-id');

client.push?.on('position', (positionUpdate) => {
  console.log(`Position ${positionUpdate.symbol}: ${positionUpdate.unrealizedPnl}`);
});

// Subscribe to account updates
client.push?.subscribeToAccount('account-id');

client.push?.on('account', (accountUpdate) => {
  console.log(`Account balance: ${accountUpdate.balance}, equity: ${accountUpdate.equity}`);
});
```

## ⚙️ Configuration

### Client Configuration

```typescript
import { DXTradeClient } from 'dxtrade-sdk';

const client = new DXTradeClient({
  environment: 'demo', // or 'live'
  auth: {
    type: 'bearer',
    token: 'your-token',
  },
  baseUrl: 'https://custom-api.example.com/v1', // optional
  timeout: 30000,
  retries: 3,
  rateLimit: {
    requests: 100,
    window: 60000, // 1 minute
  },
  websocket: {
    heartbeatInterval: 30000,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
    maxReconnectAttempts: 5,
    maxQueueSize: 1000,
    enableBackfill: true,
  },
  enablePushAPI: true,
});
```

### Error Handling

```typescript
import {
  NetworkError,
  AuthError,
  ValidationError,
  TradingError,
  RateLimitError,
  isRetryableError,
} from 'dxtrade-sdk';

try {
  await client.orders.placeOrder(orderRequest);
} catch (error) {
  if (error instanceof TradingError) {
    console.error('Trading error:', error.message);
    console.error('Order ref:', error.orderRef);
    console.error('Rejection reason:', error.rejectionReason);
  } else if (error instanceof RateLimitError) {
    console.error('Rate limited. Retry after:', error.retryAfter, 'ms');
  } else if (error instanceof ValidationError) {
    console.error('Validation errors:', error.errors);
  } else if (isRetryableError(error)) {
    console.error('Retryable error:', error.message);
    // Implement custom retry logic
  }
}
```

### Advanced Features

#### Rate Limiting
```typescript
// Check rate limit status
const rateLimitStatus = client.http.getRateLimitStatus();
console.log(`Rate limit: ${rateLimitStatus.remaining}/${rateLimitStatus.limit}`);
console.log(`Reset time: ${new Date(rateLimitStatus.resetTime || 0)}`);
```

#### Clock Synchronization
```typescript
// Check clock sync status
const clockStatus = client.http.getClockSyncStatus();
console.log(`Clock offset: ${clockStatus.offset}ms`);
console.log(`Last sync: ${new Date(clockStatus.lastSync)}`);

// Manual sync
await client.http.syncClock();
```

#### Health Monitoring
```typescript
// Comprehensive health check
const health = await client.healthCheck();
console.log('HTTP healthy:', health.http.healthy);
console.log('WebSocket healthy:', health.websocket?.healthy);
console.log('Overall healthy:', health.overall);

// Get detailed status
const status = client.getStatus();
console.log('Client status:', status);
```

## 🧪 Testing

### Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- --grep "HttpClient"

# Run integration tests
npm test src/test/integration/

# Run tests in watch mode
npm test -- --watch
```

### Test Structure

```
src/test/
├── unit/                 # Unit tests
│   ├── http-client.test.ts
│   ├── websocket-client.test.ts
│   └── client.test.ts
├── integration/          # Integration tests
│   └── trading-workflow.test.ts
└── mocks/               # Test utilities
    └── mock-server.ts
```

## 🛠️ Development

### Project Structure

```
dxtrade-sdk/
├── src/
│   ├── core/            # Core HTTP client and utilities
│   ├── rest/            # REST API modules
│   ├── websocket/       # WebSocket/Push API client
│   ├── types/           # TypeScript type definitions
│   ├── errors/          # Error classes and handling
│   ├── utils/           # Utility functions
│   └── test/            # Test files
├── examples/            # Example applications
├── docs/                # Documentation
└── dist/                # Compiled output
```

### Building

```bash
# Build the project
npm run build

# Build and watch for changes
npm run build:watch

# Type checking only
npx tsc --noEmit
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

## 📚 Examples

### Basic Trading Bot

```typescript
import { createDemoClient } from 'dxtrade-sdk';

const client = createDemoClient({
  type: 'bearer',
  token: process.env.DXTRADE_TOKEN!,
});

async function tradingBot() {
  await client.connect();
  
  // Subscribe to real-time quotes
  client.push?.subscribeToQuotes(['EURUSD']);
  
  let lastPrice = 0;
  
  client.push?.on('quote', async (quote) => {
    if (quote.symbol !== 'EURUSD') return;
    
    const currentPrice = (quote.bid + quote.ask) / 2;
    
    // Simple momentum strategy
    if (lastPrice > 0 && currentPrice > lastPrice * 1.001) {
      try {
        const order = await client.orders.placeOrder({
          symbol: 'EURUSD',
          side: 'BUY',
          type: 'MARKET',
          quantity: 0.1,
          stopLoss: currentPrice * 0.999,
          takeProfit: currentPrice * 1.002,
        });
        
        console.log('Buy order placed:', order.id);
      } catch (error) {
        console.error('Failed to place order:', error);
      }
    }
    
    lastPrice = currentPrice;
  });
}

tradingBot().catch(console.error);
```

### Portfolio Monitor

```typescript
import { createLiveClient } from 'dxtrade-sdk';

const client = createLiveClient({
  type: 'hmac',
  apiKey: process.env.DXTRADE_API_KEY!,
  secret: process.env.DXTRADE_SECRET!,
});

async function portfolioMonitor() {
  await client.connect();
  
  // Get initial portfolio state
  const summary = await client.positions.getPortfolioSummary();
  console.log('Initial portfolio:', summary);
  
  // Subscribe to position updates
  client.push?.subscribeToPositions();
  
  client.push?.on('position', (position) => {
    console.log(`Position update: ${position.symbol} PnL: ${position.unrealizedPnl}`);
  });
  
  // Subscribe to account updates
  client.push?.subscribeToAccount();
  
  client.push?.on('account', (account) => {
    console.log(`Account update: Balance: ${account.balance}, Equity: ${account.equity}`);
  });
  
  // Periodic portfolio reporting
  setInterval(async () => {
    try {
      const currentSummary = await client.positions.getPortfolioSummary();
      console.log('Portfolio summary:', currentSummary);
    } catch (error) {
      console.error('Failed to get portfolio summary:', error);
    }
  }, 60000); // Every minute
}

portfolioMonitor().catch(console.error);
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/your-org/dxtrade-sdk.git
cd dxtrade-sdk
```

2. Install dependencies:
```bash
npm install
```

3. Run tests:
```bash
npm test
```

4. Build the project:
```bash
npm run build
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📧 **Email**: [support@your-org.com](mailto:support@your-org.com)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/your-org/dxtrade-sdk/discussions)
- 🐛 **Issues**: [GitHub Issues](https://github.com/your-org/dxtrade-sdk/issues)
- 📚 **Documentation**: [Full API Documentation](https://docs.your-org.com/dxtrade-sdk)

## 🔄 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes.

---

**Made with ❤️ for the DXtrade trading community**