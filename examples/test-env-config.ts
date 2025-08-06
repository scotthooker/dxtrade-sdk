/**
 * Test environment configuration for DXTrade SDK
 * This verifies that your broker configuration is correctly set up
 */

import { createConfigWithEnv } from '../dist/config/env-config.js';
import { DXTradeClient } from '../dist/index.js';

async function testEnvironmentConfig() {
  console.log('DXTrade Environment Configuration Test');
  console.log('=======================================\n');
  
  // Load configuration from environment
  let config;
  try {
    config = createConfigWithEnv();
    console.log('✅ Configuration loaded from environment variables');
  } catch (error: any) {
    console.error('❌ Failed to load configuration:', error.message);
    console.error('\nRequired environment variables:');
    console.error('  DXTRADE_BASE_URL - Your broker\'s API URL');
    console.error('  DXTRADE_USERNAME - Your username');
    console.error('  DXTRADE_PASSWORD - Your password');
    console.error('\nOptional:');
    console.error('  DXTRADE_DOMAIN - Account domain (default: "default")');
    console.error('  DXTRADE_FEATURE_CLOCK_SYNC - Enable clock sync (default: true)');
    console.error('  DXTRADE_FEATURE_WEBSOCKET - Enable WebSocket (default: true)');
    console.error('  See README.md Configuration section for all options');
    process.exit(1);
  }
  
  // Display loaded configuration (without sensitive data)
  console.log('Configuration Summary:');
  console.log('----------------------');
  console.log('Environment:', config.environment);
  console.log('Base URL:', config.baseUrl || 'Auto-detected');
  console.log('Auth Type:', config.auth.type);
  if (config.auth.type === 'credentials') {
    console.log('Username:', config.auth.username);
    console.log('Domain:', config.auth.domain || 'default');
  }
  console.log('Timeout:', config.timeout, 'ms');
  console.log('Retries:', config.retries);
  console.log('\nFeatures:');
  console.log('  Clock Sync:', config.features.clockSync);
  console.log('  WebSocket:', config.features.websocket);
  console.log('  Auto Reconnect:', config.features.autoReconnect);
  console.log('\nEndpoints:');
  console.log('  Login:', config.endpoints.login);
  console.log('  Market Data:', config.endpoints.marketData);
  console.log('  Time:', config.endpoints.time);
  console.log('  Account:', config.endpoints.account);
  
  if (config.websocket) {
    console.log('\nWebSocket Configuration:');
    console.log('  Base URL:', config.websocket.baseUrl || 'Auto-derived');
    console.log('  Market Data Path:', config.websocket.marketDataPath);
    console.log('  Portfolio Path:', config.websocket.portfolioPath);
  }
  
  // Test the configuration
  console.log('\n\nTesting Configuration...');
  console.log('-------------------------');
  
  const client = new DXTradeClient(config);
  
  try {
    // Test authentication
    console.log('\n1. Testing authentication...');
    await client.connect();
    console.log('   ✅ Authentication successful');
    
    // Test market data if available
    if (config.baseUrl) {
      console.log('\n2. Testing market data...');
      try {
        const marketData = await client.marketData.getQuotes(['EURUSD', 'GBPUSD']);
        console.log('   ✅ Market data endpoint works');
        console.log('   Sample quote:', marketData[0]);
      } catch (error: any) {
        if (error.message.includes('404')) {
          console.log('   ⚠️ Market data endpoint not available');
        } else {
          console.log('   ❌ Market data error:', error.message);
        }
      }
    }
    
    // Test WebSocket if enabled
    if (config.features.websocket) {
      console.log('\n3. Testing WebSocket...');
      try {
        const ws = client.getWebSocketClient();
        if (ws) {
          await ws.connect();
          console.log('   ✅ WebSocket connection successful');
          ws.disconnect();
        } else {
          console.log('   ⚠️ WebSocket client not available');
        }
      } catch (error: any) {
        console.log('   ❌ WebSocket error:', error.message);
        console.log('   Consider setting DXTRADE_FEATURE_WEBSOCKET=false');
      }
    } else {
      console.log('\n3. WebSocket disabled in configuration');
    }
    
    // Test account endpoint
    console.log('\n4. Testing account endpoint...');
    try {
      const account = await client.account.getInfo();
      console.log('   ✅ Account endpoint works');
      console.log('   Account ID:', account.id);
    } catch (error: any) {
      if (error.message.includes('404')) {
        console.log('   ⚠️ Account endpoint not available');
      } else {
        console.log('   ❌ Account error:', error.message);
      }
    }
    
    console.log('\n\n✅ Configuration test complete!');
    console.log('Your broker configuration is working correctly.');
    
  } catch (error: any) {
    console.error('\n❌ Configuration test failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify your credentials are correct');
    console.error('2. Check if the base URL is correct');
    console.error('3. Try running npm run discover:endpoints to find available endpoints');
    console.error('4. See README.md Configuration section for detailed configuration guide');
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

testEnvironmentConfig().catch(console.error);