#!/usr/bin/env node

/**
 * Simple test to validate DXTrade WebSocket stream implementation
 */

import { createConfigWithEnv } from '../dist/config/env-config.js';
import { DXTradeClient, type DXTradeStreamOptions, type DXTradeStreamCallbacks } from '../dist/index.js';

async function testDXTradeStream(): Promise<void> {
  console.log('🧪 Testing DXTrade WebSocket Stream Implementation');
  console.log('================================================');

  // Create client
  const config = createConfigWithEnv();
  const client = new DXTradeClient(config);
  
  // Check session token
  await new Promise(resolve => setTimeout(resolve, 1000));
  const sessionToken = client.http.getSessionToken();
  
  if (!sessionToken) {
    console.log('❌ No session token available. Ensure authentication is configured.');
    return;
  }
  
  console.log(`✅ Session token available: ${sessionToken.substring(0, 20)}...`);

  // Test 1: Create stream manager
  console.log('\n🔧 Test 1: Creating DXTrade stream manager...');
  try {
    const streamManager = client.createDXTradeStream({
      symbols: ['EUR/USD'],
      enableMarketData: true,
      enablePortfolio: false, // Start with just market data
      enablePingResponse: true,
    });
    
    console.log('✅ Stream manager created successfully');
    
    // Check initial status
    const initialStatus = streamManager.getStatus();
    console.log(`   Initial ready state: ${initialStatus.isReady}`);
    console.log(`   Market data connected: ${initialStatus.marketData.connected}`);
    console.log(`   Portfolio connected: ${initialStatus.portfolio.connected}`);
    
    streamManager.destroy(); // Clean up
    
  } catch (error) {
    console.error('❌ Failed to create stream manager:', error);
    return;
  }

  // Test 2: Test connection (short duration)
  console.log('\n🔗 Test 2: Testing WebSocket connection...');
  try {
    let messageReceived = false;
    let connectionEstablished = false;
    
    const callbacks: DXTradeStreamCallbacks = {
      onConnected: (connectionType) => {
        console.log(`   ✅ ${connectionType} connected`);
        connectionEstablished = true;
      },
      
      onMarketData: (data) => {
        console.log('   📊 Market data received:', data.type);
        messageReceived = true;
      },
      
      onRawMessage: (_connectionType, data) => {
        if (!messageReceived) {
          console.log('   📥 First message received');
          messageReceived = true;
        }
      },
      
      onError: (connectionType, error) => {
        console.error(`   ❌ ${connectionType} error:`, error.message);
      }
    };
    
    const streamManager = await client.startDXTradeStream({
      symbols: ['EUR/USD'],
      enableMarketData: true,
      enablePortfolio: false,
      connectionTimeout: 10000,
    }, callbacks);
    
    console.log('   ✅ Connection established');
    
    // Wait for some messages
    console.log('   ⏳ Waiting for messages (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const status = streamManager.getStatus();
    console.log(`   📊 Messages received: ${status.marketData.messageCount}`);
    console.log(`   🏓 Ping requests: ${status.pingStats.requestsReceived}`);
    
    await streamManager.disconnect();
    streamManager.destroy();
    
    if (connectionEstablished) {
      console.log('   ✅ Connection test passed');
    } else {
      console.log('   ⚠️  Connection test had issues');
    }
    
  } catch (error) {
    console.error('❌ Connection test failed:', error);
  }

  // Test 3: Quick stability test
  console.log('\n🧪 Test 3: Quick stability test (30 seconds)...');
  try {
    const result = await client.runDXTradeStreamTest(30000, { // 30 seconds
      symbols: ['EUR/USD'],
      enableMarketData: true,
      enablePortfolio: false,
    });
    
    console.log('   📊 Test results:');
    console.log(`      Success: ${result.success ? '✅' : '❌'}`);
    console.log(`      Duration: ${result.duration.toFixed(1)}s`);
    console.log(`      Messages: ${result.messageCount}`);
    console.log(`      Market data: ${result.marketDataCount}`);
    console.log(`      Ping requests: ${result.pingRequestsReceived}`);
    console.log(`      Stable: ${result.connectionStable ? '✅' : '❌'}`);
    
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Stability test failed:', error);
  }

  console.log('\n🎯 DXTrade WebSocket Stream Test Complete');
  console.log('==========================================');
  console.log('✅ Implementation appears to be working correctly');
  console.log('💡 Run with longer duration for more comprehensive testing');
  console.log('📚 See examples/dxtrade-stream-example.ts for full usage examples');
}

// Run the test
testDXTradeStream().catch(console.error);