/**
 * Basic trading example using the DXtrade SDK
 * 
 * This example demonstrates:
 * - Client setup and authentication
 * - Account and balance queries
 * - Market data retrieval
 * - Order placement and management
 * - Position monitoring
 * - Real-time data subscriptions
 */

import { createDemoClient, TradingError, ValidationError } from '../src/index.js';

// Configuration
const config = {
  token: process.env.DXTRADE_TOKEN || 'your-api-token-here',
  symbol: 'EURUSD',
  tradeQuantity: 0.1, // 0.1 lots
};

async function basicTradingExample() {
  console.log('🚀 Starting DXtrade SDK Basic Trading Example');

  // Create demo client with bearer token authentication
  const client = createDemoClient({
    type: 'bearer',
    token: config.token,
  });

  try {
    // Step 1: Connect to the API
    console.log('\n📡 Connecting to DXtrade API...');
    await client.connect();
    
    console.log('✅ Connected successfully!');
    console.log('📊 Client status:', client.getStatus());

    // Step 2: Get account information
    console.log('\n💼 Retrieving account information...');
    const accounts = await client.accounts.getAccounts();
    
    if (accounts.length === 0) {
      throw new Error('No accounts found');
    }

    const account = accounts[0]!;
    console.log(`📋 Account: ${account.name} (${account.id})`);
    console.log(`💰 Balance: ${account.balance} ${account.currency}`);
    console.log(`📈 Equity: ${account.equity} ${account.currency}`);
    console.log(`🔒 Margin: ${account.margin} ${account.currency}`);

    // Get detailed balance information
    const balance = await client.accounts.getAccountBalance(account.id);
    console.log('\n💳 Detailed balance:');
    console.log(`  Available: ${balance.availableBalance} ${balance.currency}`);
    console.log(`  Free Margin: ${balance.freeMargin} ${balance.currency}`);
    console.log(`  Margin Level: ${balance.marginLevel}%`);

    // Step 3: Get instrument information
    console.log(`\n🔍 Getting instrument information for ${config.symbol}...`);
    const instrument = await client.instruments.getInstrument(config.symbol);
    console.log(`📊 ${instrument.name}`);
    console.log(`  Type: ${instrument.type}`);
    console.log(`  Min Size: ${instrument.minSize}`);
    console.log(`  Tick Size: ${instrument.tickSize}`);
    console.log(`  Digits: ${instrument.digits}`);

    // Get current market quote
    const quote = await client.instruments.getQuote(config.symbol);
    console.log(`\n💹 Current ${config.symbol} quote:`);
    console.log(`  Bid: ${quote.bid}`);
    console.log(`  Ask: ${quote.ask}`);
    console.log(`  Spread: ${quote.spread || (quote.ask - quote.bid).toFixed(5)}`);

    // Step 4: Calculate margin requirement
    console.log('\n🧮 Calculating margin requirement...');
    const marginReq = await client.accounts.calculateMarginRequirement(
      account.id,
      config.symbol,
      config.tradeQuantity,
      'BUY'
    );
    console.log(`  Margin required: ${marginReq.marginRequired} ${marginReq.marginCurrency}`);
    console.log(`  Available margin: ${marginReq.availableMargin}`);

    if (marginReq.marginRequired > marginReq.availableMargin) {
      console.log('⚠️  Insufficient margin for trade');
      return;
    }

    // Step 5: Set up real-time market data
    if (client.push) {
      console.log('\n📡 Setting up real-time market data...');
      
      // Subscribe to quotes
      client.push.subscribeToQuotes([config.symbol]);
      
      // Handle real-time quotes
      let quoteCount = 0;
      const maxQuotes = 5;
      
      client.push.on('quote', (quoteUpdate) => {
        if (quoteUpdate.symbol === config.symbol && quoteCount < maxQuotes) {
          console.log(`📊 Real-time quote: ${quoteUpdate.symbol} ${quoteUpdate.bid}/${quoteUpdate.ask}`);
          quoteCount++;
        }
      });

      // Wait for a few quotes
      await new Promise(resolve => {
        const checkQuotes = () => {
          if (quoteCount >= maxQuotes) {
            resolve(void 0);
          } else {
            setTimeout(checkQuotes, 100);
          }
        };
        setTimeout(checkQuotes, 1000); // Give it a second to start
      });
    }

    // Step 6: Place a market order
    console.log('\n📝 Placing market order...');
    const orderRequest = {
      symbol: config.symbol,
      side: 'BUY' as const,
      type: 'MARKET' as const,
      quantity: config.tradeQuantity,
      clientOrderId: `demo-order-${Date.now()}`,
    };

    const order = await client.orders.placeOrder(orderRequest, account.id);
    console.log(`✅ Order placed successfully!`);
    console.log(`  Order ID: ${order.id}`);
    console.log(`  Status: ${order.status}`);
    console.log(`  Filled: ${order.filledQuantity}/${order.quantity}`);
    
    if (order.averagePrice) {
      console.log(`  Average Price: ${order.averagePrice}`);
    }

    // Step 7: Monitor order status
    console.log('\n👀 Monitoring order status...');
    const orderDetails = await client.orders.getOrder(order.id, account.id);
    console.log(`📋 Order details:`);
    console.log(`  Status: ${orderDetails.status}`);
    console.log(`  Filled: ${orderDetails.filledQuantity}`);
    console.log(`  Remaining: ${orderDetails.remainingQuantity}`);

    // Step 8: Check positions
    console.log('\n📊 Checking positions...');
    const positions = await client.positions.getPositions({ accountId: account.id });
    
    console.log(`📈 Total positions: ${positions.positions.length}`);
    
    for (const position of positions.positions) {
      console.log(`  ${position.symbol}: ${position.side} ${position.size} @ ${position.entryPrice}`);
      console.log(`    Unrealized P&L: ${position.unrealizedPnl}`);
      console.log(`    Mark Price: ${position.markPrice}`);
    }

    // Step 9: Set up position monitoring
    if (client.push) {
      console.log('\n📡 Setting up position monitoring...');
      
      client.push.subscribeToPositions(account.id);
      client.push.subscribeToOrders(account.id);
      
      // Monitor position updates
      client.push.on('position', (positionUpdate) => {
        console.log(`📊 Position update: ${positionUpdate.symbol} P&L: ${positionUpdate.unrealizedPnl}`);
      });

      // Monitor order updates
      client.push.on('order', (orderUpdate) => {
        console.log(`📋 Order update: ${orderUpdate.id} status: ${orderUpdate.status}`);
      });

      // Let it run for a bit
      console.log('⏰ Monitoring for 10 seconds...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Step 10: Place a limit order (demonstrating different order types)
    console.log('\n📝 Placing limit order...');
    const currentPrice = quote.ask;
    const limitPrice = currentPrice - 0.0050; // 50 pips below current price

    const limitOrder = await client.orders.placeOrder({
      symbol: config.symbol,
      side: 'BUY',
      type: 'LIMIT',
      quantity: config.tradeQuantity,
      price: limitPrice,
      timeInForce: 'GTC',
      clientOrderId: `limit-order-${Date.now()}`,
    }, account.id);

    console.log(`✅ Limit order placed!`);
    console.log(`  Order ID: ${limitOrder.id}`);
    console.log(`  Limit Price: ${limitPrice}`);
    console.log(`  Status: ${limitOrder.status}`);

    // Step 11: Demonstrate order modification
    console.log('\n✏️  Modifying limit order...');
    const newLimitPrice = limitPrice - 0.0010; // Move limit 10 pips lower
    
    try {
      const modifiedOrder = await client.orders.modifyOrder({
        orderId: limitOrder.id,
        price: newLimitPrice,
      }, account.id);

      console.log(`✅ Order modified successfully!`);
      console.log(`  New Price: ${newLimitPrice}`);
    } catch (error) {
      console.log(`⚠️  Order modification failed: ${error instanceof Error ? error.message : error}`);
    }

    // Step 12: Cancel the limit order
    console.log('\n❌ Canceling limit order...');
    const canceledOrder = await client.orders.cancelOrder(limitOrder.id, account.id);
    console.log(`✅ Order canceled: ${canceledOrder.status}`);

    // Step 13: Get portfolio summary
    console.log('\n📊 Portfolio Summary...');
    const portfolio = await client.positions.getPortfolioSummary(account.id);
    console.log(`  Total Positions: ${portfolio.totalPositions}`);
    console.log(`  Total Unrealized P&L: ${portfolio.totalUnrealizedPnl}`);
    console.log(`  Net Exposure: ${portfolio.netExposure}`);
    console.log(`  Gross Exposure: ${portfolio.grossExposure}`);

    // Step 14: Health check
    console.log('\n🏥 Performing health check...');
    const health = await client.healthCheck();
    console.log(`  HTTP Health: ${health.http.healthy ? '✅' : '❌'} (${health.http.latency}ms)`);
    if (health.websocket) {
      console.log(`  WebSocket Health: ${health.websocket.healthy ? '✅' : '❌'}`);
      console.log(`  WebSocket Connected: ${health.websocket.connected ? '✅' : '❌'}`);
    }
    console.log(`  Overall Health: ${health.overall ? '✅' : '❌'}`);

    console.log('\n🎉 Basic trading example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error occurred:');
    
    if (error instanceof TradingError) {
      console.error(`Trading Error: ${error.message}`);
      if (error.orderRef) console.error(`Order Ref: ${error.orderRef}`);
      if (error.rejectionReason) console.error(`Rejection: ${error.rejectionReason}`);
    } else if (error instanceof ValidationError) {
      console.error(`Validation Error: ${error.message}`);
      console.error('Field errors:', error.errors);
    } else {
      console.error(`General Error: ${error instanceof Error ? error.message : error}`);
    }
    
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await client.disconnect();
    client.destroy();
    console.log('✅ Cleanup completed');
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n⚠️  Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  basicTradingExample().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}