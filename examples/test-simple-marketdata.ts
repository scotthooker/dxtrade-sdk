/**
 * Simple test for DXTrade marketdata endpoint
 * Updated to use the new configuration system with corrected URLs
 */

import { createConfigWithEnv } from '../dist/config/env-config.js';
import { DXTradeClient } from '../dist/index.js';

async function main() {
  console.log('🧪 Testing Market Data Endpoint with New Configuration');
  console.log('====================================================\n');

  try {
    // Load configuration from environment
    const config = createConfigWithEnv();
    console.log(`Environment: ${config.environment}`);
    console.log(`Base URL: ${config.baseUrl}`);
    console.log(`Login URL: ${config.urls?.login}`);
    console.log(`Market Data URL: ${config.urls?.marketData}`);
    
    // Create client and authenticate
    console.log('\n🔐 Authenticating with SDK client...');
    const client = new DXTradeClient(config);
    
    // Wait for authentication to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    const sessionToken = client.http.getSessionToken();
    
    if (!sessionToken) {
      console.log('❌ Authentication failed - no session token available');
      return;
    }
    
    console.log(`✅ Session token: ${sessionToken.substring(0, 20)}...`);

    // Test direct marketdata endpoint call
    console.log('\n📊 Testing marketdata endpoint directly...');
    const marketDataRequest = {
      account: config.auth.account || 'default:dealtest',
      symbols: ['EURUSD', 'GBPUSD'],
      eventTypes: [{
        type: 'Quote',
        format: 'COMPACT'
      }]
    };

    console.log('Request:', JSON.stringify(marketDataRequest, null, 2));

    // Use the configured market data URL
    const marketDataUrl = config.urls?.marketData || `${config.baseUrl}/marketdata`;
    const response = await fetch(marketDataUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Auth-Token': sessionToken,
        'Authorization': `DXAPI ${sessionToken}`
      },
      body: JSON.stringify(marketDataRequest)
    });

    console.log(`\nMarket Data Response: ${response.status} ${response.statusText}`);
    
    const responseText = await response.text();
    console.log('Response:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));

    // If successful, the endpoint should return market data
    if (response.ok) {
      try {
        const data = JSON.parse(responseText);
        console.log('\n✅ Market data received!');
        console.log('Parsed data:', JSON.stringify(data, null, 2));
      } catch {
        console.log('\n⚠️ Response is not JSON');
      }
    } else {
      console.log('\n⚠️ Market data endpoint returned error');
    }
    
    // Test using SDK client methods
    console.log('\n🚀 Testing with SDK client methods...');
    try {
      // Test instruments endpoint
      const instrumentsResponse = await client.instruments.search({ query: 'EUR' });
      console.log('✅ Instruments query successful');
      console.log(`   Found ${instrumentsResponse.data?.length || 0} instruments`);
    } catch (error) {
      console.log(`⚠️ Instruments query failed: ${error.message}`);
    }
    
    // Test accounts endpoint
    try {
      const accountInfo = await client.accounts.getInfo();
      console.log('✅ Account info query successful');
      console.log(`   Account data: ${JSON.stringify(accountInfo.data).substring(0, 100)}...`);
    } catch (error) {
      console.log(`⚠️ Account info query failed: ${error.message}`);
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

main().catch(console.error);