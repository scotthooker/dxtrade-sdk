#!/usr/bin/env node

/**
 * DXTrade WebSocket Stream Example
 * 
 * Demonstrates how to use the enhanced DXTrade WebSocket stream manager
 * based on the test-websocket-5min.ts implementation patterns.
 */

import { createConfigWithEnv } from '../dist/config/env-config.js';
import { DXTradeClient } from '../dist/index.js';
import type { DXTradeStreamOptions, DXTradeStreamCallbacks } from '../dist/index.js';

async function main() {
  console.log('🚀 DXTrade WebSocket Stream Example');
  console.log('===================================');

  // Create client configuration from environment
  const config = createConfigWithEnv();
  const client = new DXTradeClient(config);

  // Wait for authentication (if using credentials)
  await new Promise(resolve => setTimeout(resolve, 1000));
  const sessionToken = client.http.getSessionToken();
  
  if (!sessionToken) {
    console.log('❌ No session token available. Check authentication configuration.');
    return;
  }

  console.log(`✅ Session token: ${sessionToken.substring(0, 20)}...`);

  // Configure stream options
  const streamOptions: DXTradeStreamOptions = {
    symbols: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'],
    account: 'default:dealtest',
    enableMarketData: true,
    enablePortfolio: true,
    enablePingResponse: true,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectDelay: 3000,
  };

  // Configure callbacks
  const callbacks: DXTradeStreamCallbacks = {
    onConnected: (connectionType) => {
      console.log(`✅ ${connectionType} WebSocket connected`);
    },

    onDisconnected: (connectionType, code, reason) => {
      console.log(`🔚 ${connectionType} WebSocket disconnected: ${code} - ${reason}`);
    },

    onError: (connectionType, error) => {
      console.error(`❌ ${connectionType} WebSocket error:`, error.message);
    },

    onMarketData: (data) => {
      console.log('📊 Market Data:', {
        type: data.type,
        symbol: data.payload?.symbol,
        // Only show a subset of data to avoid spam
        ...(data.payload?.bid && { bid: data.payload.bid }),
        ...(data.payload?.ask && { ask: data.payload.ask }),
      });
    },

    onAccountPortfolios: (data) => {
      console.log('💰 Portfolio Update:', {
        type: data.type,
        account: data.payload?.account,
        balance: data.payload?.balance,
        equity: data.payload?.equity,
        positionCount: data.payload?.positions?.length || 0,
      });
    },

    onPositionUpdate: (data) => {
      console.log('📈 Position Update:', {
        symbol: data.payload.symbol,
        side: data.payload.side,
        size: data.payload.size,
        unrealizedPnl: data.payload.unrealizedPnl,
      });
    },

    onOrderUpdate: (data) => {
      console.log('📋 Order Update:', {
        orderId: data.payload.orderId,
        symbol: data.payload.symbol,
        status: data.payload.status,
        filledQuantity: data.payload.filledQuantity,
      });
    },

    onPingRequest: (data) => {
      console.log('🏓 Ping request received, responding...');
    },

    onSubscriptionResponse: (data) => {
      console.log(`📡 Subscription ${data.success ? 'successful' : 'failed'}:`, data.requestId);
      if (data.error) {
        console.error('   Error:', data.error);
      }
    },

    onReconnecting: (connectionType, attempt) => {
      console.log(`🔄 Reconnecting ${connectionType} (attempt ${attempt})...`);
    },

    onReconnected: (connectionType) => {
      console.log(`✅ ${connectionType} reconnected successfully`);
    },
  };

  try {
    console.log('\n🔗 Starting DXTrade WebSocket streams...');
    
    // Create and start the stream manager
    const streamManager = await client.startDXTradeStream(streamOptions, callbacks);
    
    console.log('✅ WebSocket streams started successfully');
    
    // Display initial status
    const status = streamManager.getStatus();
    console.log('\n📊 Connection Status:');
    console.log(`   Market Data: ${status.marketData.connected ? '✅' : '❌'} connected, ${status.marketData.subscribed ? '✅' : '❌'} subscribed`);
    console.log(`   Portfolio: ${status.portfolio.connected ? '✅' : '❌'} connected, ${status.portfolio.subscribed ? '✅' : '❌'} subscribed`);
    console.log(`   Ready: ${status.isReady ? '✅' : '❌'}`);
    
    // Monitor stream for 2 minutes
    console.log('\n⏱️  Monitoring streams for 2 minutes...');
    console.log('Press Ctrl+C to stop early\n');
    
    let messageCount = 0;
    let lastStatusUpdate = Date.now();
    
    // Add raw message counter
    callbacks.onRawMessage = (connectionType, data) => {
      messageCount++;
      
      // Show status every 30 seconds
      const now = Date.now();
      if (now - lastStatusUpdate >= 30000) {
        const currentStatus = streamManager.getStatus();
        console.log(`\n📊 Status Update (${Math.floor((now - Date.now()) / 1000)}s):`);
        console.log(`   Messages received: ${messageCount}`);
        console.log(`   Market data messages: ${currentStatus.marketData.messageCount}`);
        console.log(`   Portfolio messages: ${currentStatus.portfolio.messageCount}`);
        console.log(`   Ping requests: ${currentStatus.pingStats.requestsReceived}`);
        console.log(`   Ping responses: ${currentStatus.pingStats.responsesSent}\n`);
        
        lastStatusUpdate = now;
      }
    };
    
    // Wait for the monitoring period
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 2 * 60 * 1000); // 2 minutes
      
      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        console.log('\n⚠️  Received interrupt signal, stopping...');
        clearTimeout(timeout);
        resolve(undefined);
      });
    });
    
    // Final status
    const finalStatus = streamManager.getStatus();
    console.log('\n🎯 Final Status:');
    console.log(`   Total messages: ${messageCount}`);
    console.log(`   Market data messages: ${finalStatus.marketData.messageCount}`);
    console.log(`   Portfolio messages: ${finalStatus.portfolio.messageCount}`);
    console.log(`   Ping requests handled: ${finalStatus.pingStats.requestsReceived}`);
    console.log(`   Ping responses sent: ${finalStatus.pingStats.responsesSent}`);
    console.log(`   Connections stable: ${finalStatus.isReady ? '✅' : '❌'}`);
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await streamManager.disconnect();
    streamManager.destroy();
    
    console.log('✅ Example completed successfully!');

  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Alternative: Run the built-in stability test
async function runStabilityTest() {
  console.log('🚀 Running DXTrade WebSocket Stability Test');
  console.log('==========================================');

  const config = createConfigWithEnv();
  const client = new DXTradeClient(config);

  // Wait for authentication
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    const testDuration = 5 * 60 * 1000; // 5 minutes
    console.log(`Running stability test for ${testDuration / 1000} seconds...`);

    const result = await client.runDXTradeStreamTest(testDuration, {
      symbols: ['EUR/USD', 'GBP/USD', 'XAU/USD'],
      enableMarketData: true,
      enablePortfolio: true,
      enablePingResponse: true,
    });

    console.log('\n🎯 Test Results:');
    console.log(`   Success: ${result.success ? '✅' : '❌'}`);
    console.log(`   Duration: ${result.duration.toFixed(1)}s`);
    console.log(`   Total messages: ${result.messageCount}`);
    console.log(`   Market data messages: ${result.marketDataCount}`);
    console.log(`   Portfolio messages: ${result.portfolioCount}`);
    console.log(`   Ping requests: ${result.pingRequestsReceived}`);
    console.log(`   Ping responses: ${result.pingResponsesSent}`);
    console.log(`   Connection stable: ${result.connectionStable ? '✅' : '❌'}`);
    
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    if (result.success && result.connectionStable) {
      console.log('\n🎉 Stability test passed! WebSocket connections are stable.');
    } else {
      console.log('\n⚠️  Stability test had issues. Check configuration and network.');
    }

  } catch (error) {
    console.error('❌ Stability test failed:', error);
    process.exit(1);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.includes('--test') || args.includes('-t')) {
  runStabilityTest().catch(console.error);
} else {
  main().catch(console.error);
}

// Export for use as a module
export { main as runDXTradeStreamExample, runStabilityTest as runDXTradeStabilityTest };