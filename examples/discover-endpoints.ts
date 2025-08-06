/**
 * Discover available endpoints for a DXTrade broker
 * This helps identify supported endpoints and WebSocket paths
 */

import WebSocket from 'ws';

const config = {
  username: process.env.DXTRADE_USERNAME || '',
  password: process.env.DXTRADE_PASSWORD || '',
  apiUrl: process.env.DXTRADE_BASE_URL || '',
  account: process.env.DXTRADE_ACCOUNT || 'default:account',
};

// Validate configuration
if (!config.username || !config.password || !config.apiUrl) {
  console.error('❌ Missing required environment variables:');
  console.error('   DXTRADE_USERNAME, DXTRADE_PASSWORD, DXTRADE_BASE_URL');
  console.error('\nExample:');
  console.error('   export DXTRADE_BASE_URL=https://your-broker.com/api');
  console.error('   export DXTRADE_USERNAME=your_username');
  console.error('   export DXTRADE_PASSWORD=your_password');
  process.exit(1);
}

async function testEndpoint(path: string, method = 'GET', body?: any): Promise<boolean> {
  try {
    const response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    return response.status !== 404;
  } catch (error) {
    return false;
  }
}

async function getSessionToken(): Promise<string | null> {
  console.log('🔐 Testing authentication endpoints...');
  
  const loginEndpoints = ['/login', '/auth/login', '/api/login', '/v1/login', '/auth', '/authenticate'];
  
  for (const endpoint of loginEndpoints) {
    console.log(`   Testing ${endpoint}...`);
    try {
      const response = await fetch(`${config.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          username: config.username,
          password: config.password,
          domain: process.env.DXTRADE_DOMAIN || 'default'
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.sessionToken) {
          console.log(`   ✅ Authentication successful at ${endpoint}`);
          console.log(`   Session Token: ${data.sessionToken.substring(0, 20)}...`);
          return data.sessionToken;
        }
      } else if (response.status !== 404) {
        console.log(`   ⚠️ ${endpoint} returned ${response.status}`);
      }
    } catch (error) {
      // Silent fail for discovery
    }
  }
  
  console.log('   ❌ No working authentication endpoint found');
  return null;
}

async function discoverRestEndpoints(sessionToken?: string) {
  console.log('\n🔍 Discovering REST endpoints...');
  
  const endpoints = [
    { path: '/time', name: 'Time Sync' },
    { path: '/marketdata', name: 'Market Data' },
    { path: '/account', name: 'Account Info' },
    { path: '/accounts', name: 'Accounts List' },
    { path: '/symbols', name: 'Symbols' },
    { path: '/instruments', name: 'Instruments' },
    { path: '/quotes', name: 'Quotes' },
    { path: '/orders', name: 'Orders' },
    { path: '/positions', name: 'Positions' },
    { path: '/trades', name: 'Trades' },
    { path: '/history', name: 'History' },
    { path: '/candles', name: 'Candles' },
    { path: '/bars', name: 'Price Bars' },
  ];
  
  const headers: any = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  if (sessionToken) {
    headers['Authorization'] = `DXAPI ${sessionToken}`;
    headers['X-Auth-Token'] = sessionToken;
  }
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${config.apiUrl}${endpoint.path}`, {
        method: 'GET',
        headers,
      });
      
      if (response.status === 200) {
        console.log(`   ✅ ${endpoint.name}: ${endpoint.path}`);
      } else if (response.status === 401) {
        console.log(`   🔒 ${endpoint.name}: ${endpoint.path} (requires auth)`);
      } else if (response.status !== 404) {
        console.log(`   ⚠️ ${endpoint.name}: ${endpoint.path} (status: ${response.status})`);
      }
    } catch (error) {
      // Silent fail for discovery
    }
  }
}

async function testWebSocketUrl(url: string, sessionToken: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, {
      headers: {
        'Authorization': `DXAPI ${sessionToken}`,
        'X-Auth-Token': sessionToken,
      }
    });

    let connected = false;

    ws.on('open', () => {
      connected = true;
      console.log(`   ✅ ${url}`);
      ws.close();
      resolve(true);
    });

    ws.on('error', (error) => {
      if (!connected) {
        const errorMsg = error.message.includes('404') ? '404' : 
                        error.message.includes('401') ? '401' :
                        error.message.includes('403') ? '403' :
                        'failed';
        // Silent fail for discovery
      }
    });

    ws.on('close', () => {
      resolve(false);
    });

    setTimeout(() => {
      if (!connected) {
        ws.terminate();
        resolve(false);
      }
    }, 3000);
  });
}

async function discoverWebSocketEndpoints(sessionToken: string) {
  console.log('\n🔍 Discovering WebSocket endpoints...');
  
  // Build base WebSocket URL
  const wsBase = config.apiUrl
    .replace('https://', 'wss://')
    .replace('http://', 'ws://');
  
  const paths = [
    '',
    '/',
    '/ws',
    '/websocket',
    '/stream',
    '/socket',
    '/push',
    '/live',
    '/realtime',
    '/md',
    '/market-data',
    '/portfolio',
    '/?format=JSON',
    '/events',
    '/feed',
    '/data',
  ];
  
  console.log(`   Base WebSocket URL: ${wsBase}`);
  console.log('   Testing paths...');
  
  const workingEndpoints: string[] = [];
  
  for (const path of paths) {
    const url = `${wsBase}${path}`;
    const result = await testWebSocketUrl(url, sessionToken);
    if (result) {
      workingEndpoints.push(url);
    }
  }
  
  if (workingEndpoints.length === 0) {
    console.log('   ⚠️ No WebSocket endpoints found');
    console.log('   This broker may not support WebSocket connections');
  } else {
    console.log('\n   Working WebSocket endpoints found:');
    workingEndpoints.forEach(url => {
      console.log(`   ✅ ${url}`);
    });
  }
  
  return workingEndpoints;
}

async function main() {
  console.log('DXTrade Endpoint Discovery');
  console.log('==========================');
  console.log('Broker URL:', config.apiUrl);
  console.log('');
  
  try {
    // Test authentication
    const sessionToken = await getSessionToken();
    
    if (!sessionToken) {
      console.log('\n⚠️ Could not authenticate. Some endpoints may not be discoverable.');
    }
    
    // Discover REST endpoints
    await discoverRestEndpoints(sessionToken || undefined);
    
    // Discover WebSocket endpoints if authenticated
    if (sessionToken) {
      const wsEndpoints = await discoverWebSocketEndpoints(sessionToken);
      
      // Generate configuration suggestions
      console.log('\n📝 Suggested Environment Variables:');
      console.log('=====================================');
      console.log(`export DXTRADE_BASE_URL=${config.apiUrl}`);
      console.log(`export DXTRADE_USERNAME=your_username`);
      console.log(`export DXTRADE_PASSWORD=your_password`);
      
      if (wsEndpoints.length > 0) {
        console.log(`export DXTRADE_FEATURE_WEBSOCKET=true`);
        
        // Try to identify market data and portfolio endpoints
        const mdEndpoint = wsEndpoints.find(url => url.includes('/md') || url.includes('market'));
        const portfolioEndpoint = wsEndpoints.find(url => url.includes('portfolio') || url.includes('format=JSON'));
        
        if (mdEndpoint) {
          const path = mdEndpoint.replace(config.apiUrl.replace('https://', 'wss://').replace('http://', 'ws://'), '');
          console.log(`export DXTRADE_WS_MARKET_DATA_PATH=${path || '/'}`);
        }
        
        if (portfolioEndpoint) {
          const path = portfolioEndpoint.replace(config.apiUrl.replace('https://', 'wss://').replace('http://', 'ws://'), '');
          console.log(`export DXTRADE_WS_PORTFOLIO_PATH=${path || '/'}`);
        }
      } else {
        console.log(`export DXTRADE_FEATURE_WEBSOCKET=false`);
      }
    }
    
    console.log('\n✅ Discovery complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);