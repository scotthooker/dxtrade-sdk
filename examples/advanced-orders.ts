/**
 * Advanced order management example
 * 
 * This example demonstrates:
 * - OCO (One-Cancels-Other) orders
 * - Bracket orders (Entry + Stop Loss + Take Profit)
 * - Order modifications
 * - Bulk order operations
 * - Order execution monitoring
 * - Risk management techniques
 */

import { createDemoClient, TradingError } from '../src/index.js';

const config = {
  token: process.env.DXTRADE_TOKEN || 'your-api-token-here',
  symbol: 'EURUSD',
  baseQuantity: 0.1,
};

async function advancedOrdersExample() {
  console.log('🚀 Starting Advanced Orders Example');

  const client = createDemoClient({
    type: 'bearer',
    token: config.token,
  });

  try {
    await client.connect();
    console.log('✅ Connected to DXtrade API');

    // Get account and current quote
    const accounts = await client.accounts.getAccounts();
    const account = accounts[0]!;
    const quote = await client.instruments.getQuote(config.symbol);
    
    console.log(`\n💹 Current ${config.symbol}: ${quote.bid}/${quote.ask}`);

    // Example 1: OCO Order (One-Cancels-Other)
    console.log('\n📋 Example 1: OCO Order');
    console.log('Placing OCO order with limit entry and stop entry...');
    
    const currentPrice = (quote.bid + quote.ask) / 2;
    
    try {
      const ocoOrder = await client.orders.placeOcoOrder({
        symbol: config.symbol,
        side: 'BUY',
        quantity: config.baseQuantity,
        primaryOrder: {
          type: 'LIMIT',
          price: currentPrice - 0.0030, // 30 pips below current price
        },
        secondaryOrder: {
          type: 'STOP',
          stopPrice: currentPrice + 0.0050, // 50 pips above current price
        },
        timeInForce: 'GTC',
        clientOrderId: `oco-${Date.now()}`,
      }, account.id);

      console.log('✅ OCO Order placed successfully!');
      console.log(`  Primary Order ID: ${ocoOrder.primaryOrder.id} (LIMIT @ ${ocoOrder.primaryOrder.price})`);
      console.log(`  Secondary Order ID: ${ocoOrder.secondaryOrder.id} (STOP @ ${ocoOrder.secondaryOrder.stopPrice})`);
      console.log(`  OCO Group: ${ocoOrder.ocoGroup}`);

      // Monitor the OCO orders for a bit
      console.log('⏰ Monitoring OCO orders for 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Cancel the OCO orders
      console.log('❌ Canceling OCO orders...');
      await client.orders.cancelOrder(ocoOrder.primaryOrder.id, account.id);
      await client.orders.cancelOrder(ocoOrder.secondaryOrder.id, account.id);
      console.log('✅ OCO orders canceled');

    } catch (error) {
      console.error('❌ OCO order failed:', error instanceof Error ? error.message : error);
    }

    // Example 2: Bracket Order (Entry + Stop Loss + Take Profit)
    console.log('\n📋 Example 2: Bracket Order');
    console.log('Placing bracket order with protective stops...');

    try {
      const bracketOrder = await client.orders.placeBracketOrder({
        symbol: config.symbol,
        side: 'BUY',
        quantity: config.baseQuantity,
        entryOrder: {
          type: 'LIMIT',
          price: currentPrice - 0.0020, // 20 pips below current
        },
        stopLoss: currentPrice - 0.0070, // 70 pips below current (50 pip risk)
        takeProfit: currentPrice + 0.0080, // 80 pips above current (100 pip target)
        timeInForce: 'GTC',
        clientOrderId: `bracket-${Date.now()}`,
      }, account.id);

      console.log('✅ Bracket Order placed successfully!');
      console.log(`  Entry Order: ${bracketOrder.entryOrder.id} (LIMIT @ ${bracketOrder.entryOrder.price})`);
      console.log(`  Stop Loss: ${bracketOrder.stopLossOrder.id} (@ ${bracketOrder.stopLossOrder.stopPrice})`);
      console.log(`  Take Profit: ${bracketOrder.takeProfitOrder.id} (@ ${bracketOrder.takeProfitOrder.price})`);
      console.log(`  Bracket Group: ${bracketOrder.bracketGroup}`);
      console.log(`  Risk/Reward Ratio: 1:2 (50 pips risk, 100 pips reward)`);

      // Monitor bracket order
      console.log('⏰ Monitoring bracket order for 10 seconds...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Cancel bracket orders
      console.log('❌ Canceling bracket orders...');
      await client.orders.cancelOrder(bracketOrder.entryOrder.id, account.id);
      await client.orders.cancelOrder(bracketOrder.stopLossOrder.id, account.id);
      await client.orders.cancelOrder(bracketOrder.takeProfitOrder.id, account.id);
      console.log('✅ Bracket orders canceled');

    } catch (error) {
      console.error('❌ Bracket order failed:', error instanceof Error ? error.message : error);
    }

    // Example 3: Order Modification Strategies
    console.log('\n📋 Example 3: Order Modification Strategies');
    
    // Place initial limit order
    const initialOrder = await client.orders.placeOrder({
      symbol: config.symbol,
      side: 'BUY',
      type: 'LIMIT',
      quantity: config.baseQuantity,
      price: currentPrice - 0.0040, // 40 pips below
      timeInForce: 'GTC',
      clientOrderId: `modify-demo-${Date.now()}`,
    }, account.id);

    console.log(`✅ Initial order placed: ${initialOrder.id} @ ${initialOrder.price}`);

    // Strategy 1: Progressive price improvement
    console.log('\n🔄 Strategy 1: Progressive Price Improvement');
    const improvements = [0.0035, 0.0030, 0.0025]; // Getting closer to market

    for (let i = 0; i < improvements.length; i++) {
      const newPrice = currentPrice - improvements[i]!;
      
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        const modifiedOrder = await client.orders.modifyOrder({
          orderId: initialOrder.id,
          price: newPrice,
        }, account.id);

        console.log(`  Step ${i + 1}: Modified to ${newPrice} (${improvements[i]! * 10000} pips from market)`);
      } catch (error) {
        console.error(`  Step ${i + 1} failed:`, error instanceof Error ? error.message : error);
        break;
      }
    }

    // Strategy 2: Quantity scaling
    console.log('\n🔄 Strategy 2: Quantity Scaling');
    const quantities = [0.2, 0.3, 0.5]; // Increasing position size

    for (let i = 0; i < quantities.length; i++) {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        
        const modifiedOrder = await client.orders.modifyOrder({
          orderId: initialOrder.id,
          quantity: quantities[i],
        }, account.id);

        console.log(`  Step ${i + 1}: Scaled quantity to ${quantities[i]} lots`);
      } catch (error) {
        console.error(`  Quantity scaling step ${i + 1} failed:`, error instanceof Error ? error.message : error);
        break;
      }
    }

    // Cancel the test order
    await client.orders.cancelOrder(initialOrder.id, account.id);
    console.log('✅ Test order canceled');

    // Example 4: Bulk Order Operations
    console.log('\n📋 Example 4: Bulk Order Operations');

    // Place multiple orders
    const bulkOrders = [];
    const orderPrices = [
      currentPrice - 0.0050, // 50 pips below
      currentPrice - 0.0060, // 60 pips below
      currentPrice - 0.0070, // 70 pips below
    ];

    console.log('📤 Placing multiple orders...');
    for (let i = 0; i < orderPrices.length; i++) {
      try {
        const order = await client.orders.placeOrder({
          symbol: config.symbol,
          side: 'BUY',
          type: 'LIMIT',
          quantity: config.baseQuantity,
          price: orderPrices[i]!,
          timeInForce: 'GTC',
          clientOrderId: `bulk-order-${i}-${Date.now()}`,
        }, account.id);

        bulkOrders.push(order);
        console.log(`  Order ${i + 1}: ${order.id} @ ${order.price}`);
      } catch (error) {
        console.error(`  Order ${i + 1} failed:`, error instanceof Error ? error.message : error);
      }
    }

    // Check all pending orders
    console.log('\n📊 Checking all pending orders...');
    const pendingOrders = await client.orders.getPendingOrders(account.id);
    console.log(`📋 Total pending orders: ${pendingOrders.length}`);

    for (const order of pendingOrders) {
      console.log(`  ${order.id}: ${order.symbol} ${order.side} ${order.quantity} @ ${order.price || order.stopPrice || 'MARKET'}`);
    }

    // Bulk cancel all our test orders
    console.log('\n❌ Bulk canceling test orders...');
    const orderIds = bulkOrders.map(o => o.id);
    
    if (orderIds.length > 0) {
      const cancelResult = await client.orders.cancelOrders(orderIds, account.id);
      console.log(`✅ Canceled: ${cancelResult.cancelled.length}, Failed: ${cancelResult.failed.length}`);
      
      for (const failed of cancelResult.failed) {
        console.log(`  Failed to cancel ${failed.orderId}: ${failed.error}`);
      }
    }

    // Example 5: Order Execution Monitoring
    console.log('\n📋 Example 5: Order Execution Monitoring');

    // Place a market order for immediate execution
    console.log('📤 Placing market order for execution monitoring...');
    const marketOrder = await client.orders.placeOrder({
      symbol: config.symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: config.baseQuantity,
      clientOrderId: `execution-monitor-${Date.now()}`,
    }, account.id);

    console.log(`✅ Market order placed: ${marketOrder.id}`);

    // Get execution details
    if (marketOrder.status === 'FILLED') {
      console.log('📊 Getting execution details...');
      
      try {
        const executions = await client.orders.getOrderExecutions(marketOrder.id, account.id);
        console.log(`📈 Found ${executions.length} executions:`);
        
        for (const execution of executions) {
          console.log(`  Execution ${execution.executionId}:`);
          console.log(`    Quantity: ${execution.quantity}`);
          console.log(`    Price: ${execution.price}`);
          console.log(`    Commission: ${execution.commission}`);
          console.log(`    Liquidity: ${execution.liquidity || 'N/A'}`);
          console.log(`    Timestamp: ${new Date(execution.timestamp).toISOString()}`);
        }
      } catch (error) {
        console.error('❌ Failed to get execution details:', error instanceof Error ? error.message : error);
      }
    }

    // Example 6: Risk Management with Orders
    console.log('\n📋 Example 6: Risk Management with Orders');

    // Get current positions to calculate total exposure
    const positions = await client.positions.getPositions({ accountId: account.id });
    let totalExposure = 0;
    
    for (const position of positions.positions) {
      if (position.symbol === config.symbol) {
        totalExposure += Math.abs(position.size);
      }
    }

    console.log(`📊 Current ${config.symbol} exposure: ${totalExposure} lots`);

    // Define risk limits
    const maxExposure = 1.0; // Maximum 1 lot exposure
    const riskPerTrade = 0.02; // 2% risk per trade
    const accountBalance = account.balance;

    console.log(`⚠️  Risk Management Parameters:`);
    console.log(`  Max Exposure: ${maxExposure} lots`);
    console.log(`  Risk per Trade: ${riskPerTrade * 100}%`);
    console.log(`  Account Balance: ${accountBalance} ${account.currency}`);

    // Calculate position size based on risk
    const riskAmount = accountBalance * riskPerTrade;
    const stopLossPips = 50; // 50 pip stop loss
    const pipValue = 10; // $10 per pip for EURUSD (assuming USD account)
    const maxPositionSize = riskAmount / (stopLossPips * pipValue);

    console.log(`📐 Calculated max position size: ${maxPositionSize.toFixed(2)} lots for ${stopLossPips} pip risk`);

    // Check if we can place the order
    const proposedSize = Math.min(config.baseQuantity, maxPositionSize);
    
    if (totalExposure + proposedSize <= maxExposure) {
      console.log(`✅ Risk check passed. Proposed size: ${proposedSize.toFixed(2)} lots`);
    } else {
      console.log(`❌ Risk check failed. Would exceed maximum exposure.`);
      console.log(`  Current: ${totalExposure} + Proposed: ${proposedSize.toFixed(2)} > Max: ${maxExposure}`);
    }

    // Example of order estimation before placement
    console.log('\n🧮 Order Estimation Example');
    
    try {
      const estimation = await client.orders.estimateOrder({
        symbol: config.symbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: proposedSize,
      }, account.id);

      console.log(`📊 Order Estimation:`);
      console.log(`  Estimated Price: ${estimation.estimatedPrice}`);
      console.log(`  Estimated Commission: ${estimation.estimatedCommission}`);
      console.log(`  Margin Required: ${estimation.marginRequired}`);
      
      if (estimation.estimatedSlippage) {
        console.log(`  Estimated Slippage: ${estimation.estimatedSlippage}`);
      }

    } catch (error) {
      console.error('❌ Order estimation failed:', error instanceof Error ? error.message : error);
    }

    console.log('\n🎉 Advanced Orders Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error occurred:', error);
    
    if (error instanceof TradingError) {
      console.error(`Trading Error: ${error.message}`);
      if (error.orderRef) console.error(`Order Ref: ${error.orderRef}`);
      if (error.rejectionReason) console.error(`Rejection: ${error.rejectionReason}`);
    }
  } finally {
    console.log('\n🧹 Cleaning up...');
    await client.disconnect();
    client.destroy();
    console.log('✅ Cleanup completed');
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  advancedOrdersExample().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}