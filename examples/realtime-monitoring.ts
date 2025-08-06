/**
 * Real-time monitoring example
 * 
 * This example demonstrates:
 * - Real-time market data subscriptions
 * - Order and position monitoring
 * - Account updates tracking
 * - WebSocket connection management
 * - Data aggregation and analysis
 * - Alert systems
 */

import { createDemoClient } from '../src/index.js';

const config = {
  token: process.env.DXTRADE_TOKEN || 'your-api-token-here',
  symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'],
  monitoringDuration: 30000, // 30 seconds
};

interface QuoteData {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  timestamp: number;
  change?: number;
}

interface MarketStats {
  symbol: string;
  count: number;
  avgSpread: number;
  minBid: number;
  maxBid: number;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
}

class RealTimeMonitor {
  private client: any;
  private quotes = new Map<string, QuoteData[]>();
  private initialPrices = new Map<string, number>();
  private startTime = Date.now();
  private alerts: string[] = [];

  constructor(client: any) {
    this.client = client;
  }

  async start() {
    console.log('🚀 Starting Real-time Market Monitor');
    console.log(`📊 Monitoring symbols: ${config.symbols.join(', ')}`);
    console.log(`⏰ Duration: ${config.monitoringDuration / 1000} seconds\n`);

    // Initialize quote storage
    for (const symbol of config.symbols) {
      this.quotes.set(symbol, []);
    }

    await this.setupMarketDataSubscriptions();
    await this.setupAccountMonitoring();
    await this.startMonitoring();
  }

  private async setupMarketDataSubscriptions() {
    if (!this.client.push) {
      throw new Error('WebSocket client not available');
    }

    console.log('📡 Setting up market data subscriptions...');

    // Subscribe to real-time quotes
    this.client.push.subscribeToQuotes(config.symbols);

    // Subscribe to order book for the first symbol (to avoid too much data)
    this.client.push.subscribeToOrderBook({
      symbols: [config.symbols[0]!],
      depth: 5,
    });

    // Subscribe to trade executions
    this.client.push.subscribeToTrades(config.symbols);

    // Handle quote updates
    this.client.push.on('quote', (quote: any) => {
      this.handleQuoteUpdate(quote);
    });

    // Handle order book updates
    this.client.push.on('orderbook', (orderBook: any) => {
      this.handleOrderBookUpdate(orderBook);
    });

    // Handle trade updates
    this.client.push.on('trade', (trade: any) => {
      this.handleTradeUpdate(trade);
    });

    console.log('✅ Market data subscriptions set up');
  }

  private async setupAccountMonitoring() {
    if (!this.client.push) {
      return;
    }

    console.log('👤 Setting up account monitoring...');

    // Get account info
    const accounts = await this.client.accounts.getAccounts();
    if (accounts.length > 0) {
      const account = accounts[0]!;
      
      // Subscribe to account updates
      this.client.push.subscribeToAccount(account.id);
      this.client.push.subscribeToOrders(account.id);
      this.client.push.subscribeToPositions(account.id);

      // Handle account updates
      this.client.push.on('account', (accountUpdate: any) => {
        this.handleAccountUpdate(accountUpdate);
      });

      // Handle order updates
      this.client.push.on('order', (orderUpdate: any) => {
        this.handleOrderUpdate(orderUpdate);
      });

      // Handle position updates
      this.client.push.on('position', (positionUpdate: any) => {
        this.handlePositionUpdate(positionUpdate);
      });

      console.log(`✅ Account monitoring set up for account: ${account.id}`);
    }
  }

  private async startMonitoring() {
    console.log('⏰ Starting monitoring session...\n');

    // Get initial prices for comparison
    for (const symbol of config.symbols) {
      try {
        const quote = await this.client.instruments.getQuote(symbol);
        this.initialPrices.set(symbol, (quote.bid + quote.ask) / 2);
      } catch (error) {
        console.error(`Failed to get initial price for ${symbol}:`, error);
      }
    }

    // Set up periodic statistics display
    const statsInterval = setInterval(() => {
      this.displayStatistics();
    }, 5000); // Every 5 seconds

    // Set up alert monitoring
    const alertInterval = setInterval(() => {
      this.checkAlerts();
    }, 1000); // Every second

    // Monitor for the specified duration
    await new Promise(resolve => {
      setTimeout(() => {
        clearInterval(statsInterval);
        clearInterval(alertInterval);
        resolve(void 0);
      }, config.monitoringDuration);
    });

    console.log('\n⏰ Monitoring session completed');
    this.displayFinalSummary();
  }

  private handleQuoteUpdate(quote: any) {
    const quoteData: QuoteData = {
      symbol: quote.symbol,
      bid: quote.bid,
      ask: quote.ask,
      spread: quote.ask - quote.bid,
      timestamp: quote.timestamp,
    };

    const quotes = this.quotes.get(quote.symbol);
    if (quotes) {
      // Calculate price change from previous quote
      if (quotes.length > 0) {
        const prevQuote = quotes[quotes.length - 1]!;
        const currentPrice = (quote.bid + quote.ask) / 2;
        const prevPrice = (prevQuote.bid + prevQuote.ask) / 2;
        quoteData.change = currentPrice - prevPrice;
      }

      quotes.push(quoteData);

      // Keep only last 100 quotes per symbol to manage memory
      if (quotes.length > 100) {
        quotes.shift();
      }
    }

    // Real-time price display (throttled)
    const now = Date.now();
    if (!this.lastDisplayTime || now - this.lastDisplayTime > 500) {
      this.displayRealTimePrice(quoteData);
      this.lastDisplayTime = now;
    }

    // Check for price alerts
    this.checkPriceAlert(quoteData);
  }

  private lastDisplayTime = 0;

  private displayRealTimePrice(quote: QuoteData) {
    const initialPrice = this.initialPrices.get(quote.symbol) || 0;
    const currentPrice = (quote.bid + quote.ask) / 2;
    const change = initialPrice > 0 ? currentPrice - initialPrice : 0;
    const changePercent = initialPrice > 0 ? (change / initialPrice) * 100 : 0;
    
    const changeStr = change >= 0 ? `+${change.toFixed(5)}` : change.toFixed(5);
    const changeColor = change >= 0 ? '📈' : '📉';
    const spreadPips = quote.spread * 10000; // Convert to pips for major pairs

    console.log(
      `${changeColor} ${quote.symbol}: ${quote.bid}/${quote.ask} ` +
      `(${changeStr} | ${changePercent.toFixed(2)}%) ` +
      `Spread: ${spreadPips.toFixed(1)} pips`
    );
  }

  private handleOrderBookUpdate(orderBook: any) {
    console.log(`📚 ${orderBook.symbol} Order Book:`);
    console.log('  Best Bid:', orderBook.bids[0]?.[0], 'Size:', orderBook.bids[0]?.[1]);
    console.log('  Best Ask:', orderBook.asks[0]?.[0], 'Size:', orderBook.asks[0]?.[1]);
    
    const midPrice = (orderBook.bids[0]?.[0] + orderBook.asks[0]?.[0]) / 2;
    console.log('  Mid Price:', midPrice.toFixed(5), '\n');
  }

  private handleTradeUpdate(trade: any) {
    console.log(`🔄 Trade: ${trade.symbol} ${trade.side} ${trade.quantity} @ ${trade.price}`);
  }

  private handleAccountUpdate(account: any) {
    console.log(`💼 Account Update:`);
    console.log(`  Balance: ${account.balance}`);
    console.log(`  Equity: ${account.equity}`);
    console.log(`  Free Margin: ${account.freeMargin}\n`);
  }

  private handleOrderUpdate(order: any) {
    console.log(`📋 Order Update: ${order.id} (${order.symbol}) - Status: ${order.status}`);
    if (order.filledQuantity > 0) {
      console.log(`  Filled: ${order.filledQuantity}/${order.remainingQuantity + order.filledQuantity}`);
    }
    console.log();
  }

  private handlePositionUpdate(position: any) {
    const pnlColor = position.unrealizedPnl >= 0 ? '💚' : '❤️';
    console.log(
      `${pnlColor} Position Update: ${position.symbol} ${position.side} ` +
      `Size: ${position.size} P&L: ${position.unrealizedPnl.toFixed(2)}\n`
    );
  }

  private displayStatistics() {
    console.log('\n📊 === MARKET STATISTICS ===');
    
    const stats: MarketStats[] = [];
    
    for (const [symbol, quotes] of this.quotes) {
      if (quotes.length === 0) continue;

      const spreads = quotes.map(q => q.spread);
      const bids = quotes.map(q => q.bid);
      const initialPrice = this.initialPrices.get(symbol) || 0;
      const lastQuote = quotes[quotes.length - 1]!;
      const lastPrice = (lastQuote.bid + lastQuote.ask) / 2;
      const priceChange = initialPrice > 0 ? lastPrice - initialPrice : 0;
      const priceChangePercent = initialPrice > 0 ? (priceChange / initialPrice) * 100 : 0;

      const stat: MarketStats = {
        symbol,
        count: quotes.length,
        avgSpread: spreads.reduce((a, b) => a + b, 0) / spreads.length,
        minBid: Math.min(...bids),
        maxBid: Math.max(...bids),
        lastPrice,
        priceChange,
        priceChangePercent,
      };

      stats.push(stat);
    }

    // Sort by absolute price change percentage
    stats.sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent));

    console.log('Symbol    | Updates | Avg Spread | Range (Bid) | Price Change');
    console.log('----------|---------|------------|-------------|-------------');
    
    for (const stat of stats) {
      const changeColor = stat.priceChange >= 0 ? '📈' : '📉';
      const spreadPips = (stat.avgSpread * 10000).toFixed(1);
      const range = `${stat.minBid.toFixed(5)}-${stat.maxBid.toFixed(5)}`;
      const change = `${changeColor} ${stat.priceChangePercent.toFixed(2)}%`;
      
      console.log(
        `${stat.symbol.padEnd(9)} | ${stat.count.toString().padStart(7)} | ` +
        `${spreadPips.padStart(8)} pips | ${range.padEnd(11)} | ${change}`
      );
    }

    console.log('========================\n');
  }

  private checkPriceAlert(quote: QuoteData) {
    const currentPrice = (quote.bid + quote.ask) / 2;
    const initialPrice = this.initialPrices.get(quote.symbol) || 0;
    
    if (initialPrice > 0) {
      const changePercent = Math.abs((currentPrice - initialPrice) / initialPrice) * 100;
      
      // Alert on significant price moves (> 0.5%)
      if (changePercent > 0.5) {
        const direction = currentPrice > initialPrice ? 'UP' : 'DOWN';
        const alert = `🚨 PRICE ALERT: ${quote.symbol} moved ${direction} ${changePercent.toFixed(2)}%`;
        
        if (!this.alerts.includes(alert)) {
          this.alerts.push(alert);
          console.log(`\n${alert}\n`);
        }
      }
    }
  }

  private checkAlerts() {
    // Check for connection health
    if (this.client.push) {
      const stats = this.client.push.getStats();
      
      if (stats.state !== 'OPEN') {
        console.log(`⚠️  WebSocket Connection: ${stats.state}`);
      }
      
      if (stats.reconnectAttempt > 0) {
        console.log(`🔄 Reconnection attempts: ${stats.reconnectAttempt}`);
      }
    }

    // Check for data staleness
    const now = Date.now();
    for (const [symbol, quotes] of this.quotes) {
      if (quotes.length > 0) {
        const lastQuote = quotes[quotes.length - 1]!;
        const age = now - lastQuote.timestamp;
        
        // Alert if no data for 10 seconds
        if (age > 10000) {
          console.log(`⚠️  Stale data for ${symbol}: ${Math.round(age / 1000)}s old`);
        }
      }
    }
  }

  private displayFinalSummary() {
    console.log('\n🎯 === FINAL SUMMARY ===');
    
    const duration = Date.now() - this.startTime;
    const durationSeconds = Math.round(duration / 1000);
    
    console.log(`⏱️  Monitoring Duration: ${durationSeconds} seconds`);
    
    let totalUpdates = 0;
    for (const quotes of this.quotes.values()) {
      totalUpdates += quotes.length;
    }
    
    console.log(`📊 Total Updates Received: ${totalUpdates}`);
    console.log(`📈 Average Updates/Second: ${Math.round(totalUpdates / durationSeconds)}`);
    
    if (this.alerts.length > 0) {
      console.log(`🚨 Alerts Generated: ${this.alerts.length}`);
      for (const alert of this.alerts) {
        console.log(`  - ${alert}`);
      }
    } else {
      console.log('🟢 No significant price alerts during monitoring period');
    }
    
    console.log('\n📊 Final Price Changes:');
    for (const [symbol, initialPrice] of this.initialPrices) {
      const quotes = this.quotes.get(symbol);
      if (quotes && quotes.length > 0 && initialPrice > 0) {
        const lastQuote = quotes[quotes.length - 1]!;
        const finalPrice = (lastQuote.bid + lastQuote.ask) / 2;
        const change = finalPrice - initialPrice;
        const changePercent = (change / initialPrice) * 100;
        const changeColor = change >= 0 ? '📈' : '📉';
        
        console.log(
          `  ${changeColor} ${symbol}: ${change >= 0 ? '+' : ''}${change.toFixed(5)} ` +
          `(${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`
        );
      }
    }
    
    console.log('====================');
  }
}

async function realTimeMonitoringExample() {
  const client = createDemoClient({
    type: 'bearer',
    token: config.token,
  });

  try {
    console.log('🔌 Connecting to DXtrade API...');
    await client.connect();
    
    if (!client.push) {
      throw new Error('WebSocket client is not available. Please check your configuration.');
    }

    console.log('✅ Connected successfully!');
    
    // Wait for WebSocket authentication
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket authentication timeout'));
      }, 10000);

      client.push!.once('authenticated', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.push!.once('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log('🔐 WebSocket authenticated successfully!');

    // Start monitoring
    const monitor = new RealTimeMonitor(client);
    await monitor.start();

  } catch (error) {
    console.error('❌ Error occurred:', error instanceof Error ? error.message : error);
  } finally {
    console.log('\n🧹 Cleaning up...');
    await client.disconnect();
    client.destroy();
    console.log('✅ Cleanup completed');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️  Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  realTimeMonitoringExample().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}