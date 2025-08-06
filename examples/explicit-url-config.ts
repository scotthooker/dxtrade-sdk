/**
 * Example: Using Explicit URL Configuration
 *
 * This example demonstrates how to use explicit URLs for each endpoint
 * to avoid URL concatenation issues and improve reliability.
 */

import { createConfigWithEnv, getEndpointUrl, getWebSocketUrl } from '../dist/config/env-config.js';
import { DXTradeClient } from '../dist/index.js';

// Set explicit URLs for this example (only if not already set in environment)
// This allows .env file values to take precedence
process.env.DXTRADE_USERNAME = process.env.DXTRADE_USERNAME || 'demo_user';
process.env.DXTRADE_PASSWORD = process.env.DXTRADE_PASSWORD || 'demo_password';
process.env.DXTRADE_DOMAIN = process.env.DXTRADE_DOMAIN || 'default';
process.env.DXTRADE_ENVIRONMENT = process.env.DXTRADE_ENVIRONMENT || 'demo';

// Set explicit URLs (recommended approach) - using defaults only if not already configured
process.env.DXTRADE_LOGIN_URL = process.env.DXTRADE_LOGIN_URL || 'https://demo.dx.trade/api/login';
process.env.DXTRADE_LOGOUT_URL = process.env.DXTRADE_LOGOUT_URL || 'https://demo.dx.trade/api/logout';
process.env.DXTRADE_ACCOUNTS_URL = process.env.DXTRADE_ACCOUNTS_URL || 'https://demo.dx.trade/api/accounts';
process.env.DXTRADE_ACCOUNTS_METRICS_URL = process.env.DXTRADE_ACCOUNTS_METRICS_URL ||
  'https://demo.dx.trade/api/accounts/metrics';
process.env.DXTRADE_ACCOUNTS_POSITIONS_URL = process.env.DXTRADE_ACCOUNTS_POSITIONS_URL ||
  'https://demo.dx.trade/api/accounts/positions';
process.env.DXTRADE_ACCOUNTS_ORDERS_URL = process.env.DXTRADE_ACCOUNTS_ORDERS_URL || 'https://demo.dx.trade/api/accounts/orders';
process.env.DXTRADE_ACCOUNTS_ORDERS_HISTORY_URL = process.env.DXTRADE_ACCOUNTS_ORDERS_HISTORY_URL ||
  'https://demo.dx.trade/api/accounts/orders/history';
process.env.DXTRADE_INSTRUMENTS_QUERY_URL = process.env.DXTRADE_INSTRUMENTS_QUERY_URL ||
  'https://demo.dx.trade/api/instruments/query';
process.env.DXTRADE_CONVERSION_RATES_URL = process.env.DXTRADE_CONVERSION_RATES_URL ||
  'https://demo.dx.trade/api/conversionRates';
process.env.DXTRADE_TIME_URL = process.env.DXTRADE_TIME_URL || 'https://demo.dx.trade/api/time';
process.env.DXTRADE_WS_MARKET_DATA_URL = process.env.DXTRADE_WS_MARKET_DATA_URL || 'wss://demo.dx.trade/ws/md?format=JSON';
process.env.DXTRADE_WS_PORTFOLIO_URL = process.env.DXTRADE_WS_PORTFOLIO_URL || 'wss://demo.dx.trade/ws/?format=JSON';

// Optional features (only set if not already configured)
process.env.DXTRADE_FEATURE_CLOCK_SYNC = process.env.DXTRADE_FEATURE_CLOCK_SYNC || 'false';
process.env.DXTRADE_FEATURE_WEBSOCKET = process.env.DXTRADE_FEATURE_WEBSOCKET || 'true';

async function demonstrateExplicitUrlConfig() {
  console.log('DXTrade Explicit URL Configuration Example');
  console.log('==========================================\n');

  // Load configuration with explicit URLs from environment
  const config = createConfigWithEnv();

  console.log('Configuration Summary:');
  console.log('----------------------');
  console.log('Environment:', config.environment);
  console.log('Auth Type:', config.auth.type);

  if (config.auth.type === 'credentials') {
    console.log('Username:', config.auth.username);
    console.log('Domain:', config.auth.domain || 'default');
  }

  // Display explicit URLs if configured
  console.log('\nExplicit URLs Configuration:');
  console.log('----------------------------');
  const urlKeys: (keyof typeof config.urls)[] = [
    'login',
    'logout',
    'accounts',
    'accountsMetrics',
    'accountsPositions',
    'accountsOrders',
    'accountsOrdersHistory',
    'instrumentsQuery',
    'conversionRates',
    'time',
    'wsMarketData',
    'wsPortfolio',
  ];

  for (const key of urlKeys) {
    const url = getEndpointUrl(config, key);
    if (url) {
      console.log(`  ${key}: ${url}`);
    } else {
      console.log(`  ${key}: Not configured`);
    }
  }

  // Display WebSocket URLs
  console.log('\nWebSocket URLs:');
  console.log('---------------');
  const wsMarketDataUrl = getWebSocketUrl(config, 'marketData');
  const wsPortfolioUrl = getWebSocketUrl(config, 'portfolio');

  console.log(`Market Data: ${wsMarketDataUrl || 'Not configured'}`);
  console.log(`Portfolio: ${wsPortfolioUrl || 'Not configured'}`);

  // Test the configuration
  console.log('\n\nTesting Explicit URL Configuration...');
  console.log('--------------------------------------');

  const client = new DXTradeClient(config);

  try {
    // Test authentication using explicit login URL
    console.log('\n1. Testing authentication with explicit URL...');
    const loginUrl = getEndpointUrl(config, 'login');

    if (loginUrl) {
      console.log(`   Using login URL: ${loginUrl}`);
      await client.connect();
      console.log('   ✅ Authentication successful with explicit URL');
      console.log(client);
    } else {
      console.log('   ⚠️ No explicit login URL configured, falling back to legacy');
      await client.connect();
      console.log('   ✅ Authentication successful with fallback');
    }

    // Test account endpoint with explicit URL
    console.log('\n2. Testing account endpoint...');
    const accountUrl = getEndpointUrl(config, 'accounts');

    if (accountUrl) {
      console.log(`   Using accounts URL: ${accountUrl}`);
    } else {
      console.log('   Using fallback configuration');
    }

    try {
      const account = await client.accounts.getInfo();
      console.log('   ✅ Account endpoint works');
      console.log('   Account:', account);
    } catch (error: any) {
      console.log('   ❌ Account error:', error.message);
    }

    // Test WebSocket with explicit URLs
    if (wsMarketDataUrl || wsPortfolioUrl) {
      console.log('\n3. Testing WebSocket with explicit URLs...');

      if (config.features.websocket) {
        try {
          const ws = client.push;
          if (ws) {
            if (wsMarketDataUrl) {
              console.log(`   Using market data URL: ${wsMarketDataUrl}`);
            }
            if (wsPortfolioUrl) {
              console.log(`   Using portfolio URL: ${wsPortfolioUrl}`);
            }

            console.log('   ⚠️ WebSocket connection currently uses single connection via PushClient');
            console.log('   ⚠️ Dual WebSocket architecture (market data + portfolio) needs implementation');
            console.log('   ⚠️ This is a known limitation - WebSocket URLs are not using explicit configuration yet');
            
            // Don't attempt connection to avoid 404 errors
            // await ws.connect();
            // console.log('   ✅ WebSocket connection successful with explicit URLs');

          } else {
            console.log('   ⚠️ WebSocket client not available (PushClient not initialized)');
          }
        } catch (error: any) {
          console.log('   ❌ WebSocket error:', error.message);
        }
      } else {
        console.log('   WebSocket disabled in configuration');
      }
    } else {
      console.log('\n3. No explicit WebSocket URLs configured');
    }

    console.log('\n\n✅ Explicit URL configuration test complete!');

    if (config.urls.login && config.urls.wsMarketData && config.urls.wsPortfolio) {
      console.log('Your configuration is using explicit URLs - excellent for reliability!');
    } else {
      console.log('Consider updating your .env file to use explicit URLs for better reliability.');
      console.log('See the updated .env.example for the complete list of explicit URL variables.');
    }
  } catch (error: any) {
    console.error('\n❌ Configuration test failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure your .env file has explicit URLs set');
    console.error('2. Verify credentials are correct');
    console.error('3. Check that URLs are accessible');
    console.error('4. See .env.example for the complete explicit URL configuration');
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

// Configuration comparison function
function compareConfigurations() {
  console.log('\n\nConfiguration Comparison');
  console.log('========================\n');

  console.log('Legacy Configuration (error-prone):');
  console.log('-----------------------------------');
  console.log('DXTRADE_API_URL=https://your-broker.com/api');
  console.log('DXTRADE_WS_URL=wss://your-broker.com/ws');
  console.log('# SDK concatenates paths like: {API_URL}/login, {WS_URL}/md');
  console.log('# Risk: URL concatenation errors, path conflicts\n');

  console.log('Explicit URL Configuration (recommended):');
  console.log('-----------------------------------------');
  console.log('DXTRADE_LOGIN_URL=https://your-broker.com/api/login');
  console.log('DXTRADE_WS_MARKET_DATA_URL=wss://your-broker.com/ws/md?format=JSON');
  console.log('DXTRADE_WS_PORTFOLIO_URL=wss://your-broker.com/ws/?format=JSON');
  console.log('# SDK uses exact URLs, no concatenation');
  console.log('# Benefits: Reliable, explicit, no concatenation errors\n');

  console.log('Benefits of Explicit URLs:');
  console.log('• No URL concatenation errors');
  console.log('• Each endpoint can have different domains/ports if needed');
  console.log('• Clearer configuration - you see exactly what URLs are used');
  console.log('• Better for load balancing and microservice architectures');
  console.log('• Easier debugging - you know exact URLs being called');
  console.log('• More reliable in production environments');
}

// Run the demonstration
demonstrateExplicitUrlConfig()
  .then(() => compareConfigurations())
  .catch(console.error);
