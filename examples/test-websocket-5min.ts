/**
 * 5-minute WebSocket test with proper server ping response handling
 * The server sends PingRequest every 5 seconds - we respond to maintain connection
 */

import { createConfigWithEnv } from '../dist/config/env-config.js';
import { DXTradeClient } from '../dist/index.js';
import WebSocket from 'ws';

interface ExtendedTestResult {
  success: boolean;
  duration: number;
  messageCount: number;
  marketDataCount: number;
  portfolioCount: number;
  pingRequestsReceived: number;
  pingResponsesSent: number;
  connectionStable: boolean;
  error?: string;
}

async function test5MinuteWebSocket(): Promise<void> {
  console.log('🕐 5-Minute WebSocket Stability Test');
  console.log('====================================');
  console.log('Duration: 5 minutes (300 seconds)');
  console.log('Keep-alive: Respond to server PingRequest messages');
  console.log('Monitoring: Connection stability and message flow\n');

  const config = createConfigWithEnv();
  const client = new DXTradeClient(config);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  const sessionToken = client.http.getSessionToken();
  
  if (!sessionToken) {
    console.log('❌ No session token available');
    return;
  }
  
  console.log(`✅ Session token: ${sessionToken.substring(0, 20)}...`);

  // Get URLs and account from environment/config
  const marketDataUrl = config.urls?.wsMarketData || process.env.DXTRADE_WS_MARKET_DATA_URL || 'wss://demo.dx.trade/dxsca-web/md?format=JSON';
  const portfolioUrl = config.urls?.wsPortfolio || process.env.DXTRADE_WS_PORTFOLIO_URL || 'wss://demo.dx.trade/dxsca-web/?format=JSON';
  const account = process.env.DXTRADE_ACCOUNT || 'default:demo';

  // Test both streams concurrently
  const tests = [
    {
      name: 'Market Data Stream',
      url: marketDataUrl,
      messageType: 'MarketDataSubscriptionRequest',
      payload: {
        account: account,
        symbols: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'],
        eventTypes: [{
          type: 'Quote',
          format: 'COMPACT'
        }]
      }
    },
    {
      name: 'Portfolio Stream',
      url: portfolioUrl,
      messageType: 'AccountPortfoliosSubscriptionRequest',
      payload: {
        requestType: 'ALL',
        includeOffset: 'true'
      }
    }
  ];

  const results: ExtendedTestResult[] = [];

  // Run tests sequentially to avoid overwhelming the output
  for (const test of tests) {
    console.log(`\n🔗 Starting ${test.name} (5 minutes)`);
    console.log(`   URL: ${test.url}\n`);
    
    const result = await test5MinuteStream(
      test.url,
      sessionToken,
      test.messageType,
      test.payload,
      test.name
    );
    
    results.push(result);
    
    console.log(`\n📊 ${test.name} Results:`);
    console.log(`   Success: ${result.success ? '✅ YES' : '❌ NO'}`);
    console.log(`   Duration: ${result.duration.toFixed(1)}s`);
    console.log(`   Messages: ${result.messageCount}`);
    console.log(`   Market Data: ${result.marketDataCount}`);
    console.log(`   Portfolio Data: ${result.portfolioCount}`);
    console.log(`   Ping Requests: ${result.pingRequestsReceived}`);
    console.log(`   Ping Responses: ${result.pingResponsesSent}`);
    console.log(`   Stable: ${result.connectionStable ? '✅ YES' : '❌ NO'}`);
    
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    // Short break between tests
    if (tests.indexOf(test) < tests.length - 1) {
      console.log('\n   ⏸️ 10 second break...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  // Final summary
  console.log('\n🎯 5-Minute WebSocket Test Summary');
  console.log('==================================');
  
  const successful = results.filter(r => r.success).length;
  const allStable = results.every(r => r.connectionStable);
  const totalMessages = results.reduce((sum, r) => sum + r.messageCount, 0);
  const totalPings = results.reduce((sum, r) => sum + r.pingRequestsReceived, 0);
  
  console.log(`Tests passed: ${successful}/${results.length}`);
  console.log(`Connections stable: ${allStable ? '✅ YES' : '❌ NO'}`);
  console.log(`Total messages: ${totalMessages}`);
  console.log(`Total ping requests: ${totalPings}`);
  
  if (successful === results.length && allStable) {
    console.log('\n🎉 All 5-minute WebSocket tests passed!');
    console.log('💡 WebSocket connections are stable for long-running operations');
    console.log('🔄 Server ping/pong mechanism is working correctly');
  } else {
    console.log('\n⚠️ Some tests failed or connections were unstable');
    console.log('💡 Review individual test results above');
  }
}

async function test5MinuteStream(
  wsUrl: string,
  sessionToken: string,
  messageType: string,
  payload: any,
  streamName: string
): Promise<ExtendedTestResult> {
  
  return new Promise((resolve) => {
    const testDuration = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();
    
    let messageCount = 0;
    let marketDataCount = 0;
    let portfolioCount = 0;
    let pingRequestsReceived = 0;
    let pingResponsesSent = 0;
    // let connected = false; // Commented out - declared but never read
    let errors: string[] = [];
    
    const headers = {
      'Authorization': `DXAPI ${sessionToken}`,
      'X-Auth-Token': sessionToken
    };
    
    const ws = new WebSocket(wsUrl, { headers });
    
    // Progress reporting every 30 seconds
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, (testDuration - (Date.now() - startTime)) / 1000);
      
      console.log(`   ⏱️ ${Math.floor(elapsed)}s | Remaining: ${Math.floor(remaining)}s | ` +
                 `Messages: ${messageCount} | Pings: ${pingRequestsReceived}/${pingResponsesSent}`);
    }, 30000);
    
    // Test completion timeout
    const testTimeout = setTimeout(() => {
      clearInterval(progressInterval);
      ws.close();
      
      const duration = (Date.now() - startTime) / 1000;
      const pingSuccessRate = pingRequestsReceived > 0 ? 
        (pingResponsesSent / pingRequestsReceived * 100) : 100;
      
      resolve({
        success: true,
        duration: duration,
        messageCount: messageCount,
        marketDataCount: marketDataCount,
        portfolioCount: portfolioCount,
        pingRequestsReceived: pingRequestsReceived,
        pingResponsesSent: pingResponsesSent,
        connectionStable: errors.length === 0 && pingSuccessRate >= 90
      });
    }, testDuration);
    
    ws.on('open', () => {
      // connected = true;
      console.log('   ✅ WebSocket connected');
      
      // Send subscription
      const subscriptionMessage = {
        type: messageType,
        requestId: `extended_${streamName.replace(/\s+/g, '_')}_${Date.now()}`,
        session: sessionToken,
        payload: payload
      };
      
      ws.send(JSON.stringify(subscriptionMessage));
      console.log(`   📤 Sent ${messageType} subscription`);
    });
    
    ws.on('message', (data) => {
      messageCount++;
      const response = data.toString();
      
      try {
        const parsed = JSON.parse(response);
        const msgType = parsed.type;
        
        if (msgType === 'MarketData') {
          marketDataCount++;
        } else if (msgType === 'AccountPortfolios') {
          portfolioCount++;
        } else if (msgType === 'PingRequest') {
          // Server is asking for a ping response - respond immediately
          pingRequestsReceived++;
          
          try {
            const pongResponse = {
              type: 'Ping',
              session: sessionToken,
              timestamp: parsed.timestamp || new Date().toISOString()
            };
            
            ws.send(JSON.stringify(pongResponse));
            pingResponsesSent++;
            
            // Log first few ping responses
            if (pingRequestsReceived <= 3) {
              const elapsed = (Date.now() - startTime) / 1000;
              console.log(`   📤 Ping response sent at ${Math.floor(elapsed)}s (${pingResponsesSent} total)`);
            }
          } catch (error: any) {
            console.log(`   ❌ Failed to send ping response: ${error.message}`);
            errors.push(`Ping response failed: ${error.message}`);
          }
        }
        
        // Log first few messages and periodic summaries
        if (messageCount <= 5 && msgType !== 'PingRequest') {
          console.log(`   📥 Message ${messageCount}: ${msgType}`);
        } else if (messageCount % 500 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`   📊 ${messageCount} messages in ${Math.floor(elapsed)}s ` +
                     `(MD: ${marketDataCount}, Portfolio: ${portfolioCount}, Pings: ${pingRequestsReceived})`);
        }
        
      } catch (e) {
        console.log(`   📥 Non-JSON message ${messageCount}`);
      }
    });
    
    ws.on('error', (error) => {
      const errorMsg = error.message;
      console.log(`   ❌ WebSocket error: ${errorMsg}`);
      errors.push(errorMsg);
      
      clearInterval(progressInterval);
      clearTimeout(testTimeout);
      
      resolve({
        success: false,
        duration: (Date.now() - startTime) / 1000,
        messageCount: messageCount,
        marketDataCount: marketDataCount,
        portfolioCount: portfolioCount,
        pingRequestsReceived: pingRequestsReceived,
        pingResponsesSent: pingResponsesSent,
        connectionStable: false,
        error: errorMsg
      });
    });
    
    ws.on('close', (code, reason) => {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`   🔚 Connection closed at ${Math.floor(elapsed)}s: ${code} - ${reason || 'no reason'}`);
      // connected = false;
    });
  });
}

// Run the 5-minute test
test5MinuteWebSocket().catch(console.error);