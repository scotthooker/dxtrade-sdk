import { HttpClient } from './core/http-client.js';
import { AccountsApi } from './rest/accounts.js';
import { InstrumentsApi } from './rest/instruments.js';
import { OrdersApi } from './rest/orders.js';
import { PositionsApi } from './rest/positions.js';
import { PushClient } from './websocket/push-client.js';
import { UnifiedWebSocketStream, startUnifiedWebSocketStream } from './websocket/unified-stream.js';
import { DXTradeStreamManager, createDXTradeStreamManager } from './websocket/dxtrade-stream-manager.js';
import { ConfigError } from './errors/index.js';
import type { SDKConfig } from './types/common.js';
import type { PushClientConfig } from './websocket/push-client.js';
import type { StreamOptions, StreamCallbacks } from './websocket/unified-stream.js';
import type { DXTradeStreamOptions, DXTradeStreamCallbacks } from './types/dxtrade-messages.js';
import { SDKConfigSchema } from './types/common.js';

/**
 * Combined SDK configuration
 */
export interface DXTradeClientConfig extends SDKConfig {
  enablePushAPI?: boolean;
}

/**
 * Main DXtrade SDK client
 */
export class DXTradeClient {
  public readonly config: Required<SDKConfig>;
  public readonly http: HttpClient;
  public readonly accounts: AccountsApi;
  public readonly instruments: InstrumentsApi;
  public readonly orders: OrdersApi;
  public readonly positions: PositionsApi;
  public readonly push?: PushClient;

  constructor(config: DXTradeClientConfig) {
    // Validate configuration
    const parsedConfig = SDKConfigSchema.parse(config);
    
    // Ensure baseUrl is set and websocket config has defaults
    this.config = {
      ...parsedConfig,
      baseUrl: parsedConfig.baseUrl ?? this.getDefaultBaseUrl(parsedConfig.environment),
      websocket: parsedConfig.websocket ?? {
        marketDataPath: '/md',
        portfolioPath: '/?format=JSON',
      },
    };
    
    // Initialize HTTP client
    this.http = new HttpClient(this.config);
    
    // Initialize REST API modules
    this.accounts = new AccountsApi(this.http);
    this.instruments = new InstrumentsApi(this.http);
    this.orders = new OrdersApi(this.http);
    this.positions = new PositionsApi(this.http);
    
    // Initialize WebSocket client if enabled and supported
    const features = (parsedConfig as any).features || {};
    if (config.enablePushAPI !== false && features.websocket !== false) {
      try {
        this.push = this.createPushClient(config);
      } catch (error) {
        console.warn('WebSocket client initialization failed:', error);
        this.logWebSocketTroubleshooting();
        // Continue without WebSocket support
      }
    }
  }

  /**
   * Connect to DXtrade APIs
   */
  async connect(): Promise<void> {
    // Skip clock sync for now - not all servers support /time endpoint
    // await this.http.syncClock();
    
    // Connect WebSocket if available
    if (this.push) {
      await this.push.connect();
    }
  }

  /**
   * Disconnect from DXtrade APIs
   */
  async disconnect(): Promise<void> {
    if (this.push) {
      await this.push.disconnect();
    }
  }

  /**
   * Check if client is ready for trading
   */
  isReady(): boolean {
    // HTTP client is always ready if properly configured
    const httpReady = true;
    
    // WebSocket client needs to be connected and authenticated
    const pushReady = this.push ? this.push.isReady() : true;
    
    return httpReady && pushReady;
  }

  /**
   * Get comprehensive client status
   */
  getStatus(): {
    http: {
      rateLimitStatus: ReturnType<HttpClient['getRateLimitStatus']>;
      clockSyncStatus: ReturnType<HttpClient['getClockSyncStatus']>;
    };
    websocket?: ReturnType<PushClient['getStats']>;
    ready: boolean;
  } {
    return {
      http: {
        rateLimitStatus: this.http.getRateLimitStatus(),
        clockSyncStatus: this.http.getClockSyncStatus(),
      },
      websocket: this.push?.getStats(),
      ready: this.isReady(),
    };
  }

  /**
   * Create unified WebSocket stream for real-time data
   * 
   * This provides dual WebSocket connections (market data + portfolio) 
   * matching the Python implementation architecture.
   */
  createUnifiedStream(options: StreamOptions = {}, callbacks: StreamCallbacks = {}): UnifiedWebSocketStream {
    // Get session token from HTTP client for authentication
    const sessionToken = this.getSessionToken();
    if (!sessionToken) {
      throw new Error('Session token not available. Ensure client is authenticated first.');
    }
    
    return new UnifiedWebSocketStream(this.config, sessionToken, options, callbacks);
  }
  
  /**
   * Start unified WebSocket stream (Python compatibility helper)
   * 
   * Returns the same structure as Python version for compatibility:
   * { client, stream, thread }
   */
  startUnifiedStream(options: StreamOptions = {}, callbacks: StreamCallbacks = {}) {
    const sessionToken = this.getSessionToken();
    if (!sessionToken) {
      throw new Error('Session token not available. Ensure client is authenticated first.');
    }
    
    return startUnifiedWebSocketStream(this.config, sessionToken, options, callbacks);
  }

  /**
   * Create DXTrade WebSocket stream manager with enhanced functionality
   * 
   * This is the recommended way to manage DXTrade WebSocket connections.
   * Based on the tested implementation from test-websocket-5min.ts
   */
  createDXTradeStream(options: DXTradeStreamOptions = {}, callbacks: DXTradeStreamCallbacks = {}): DXTradeStreamManager {
    const sessionToken = this.getSessionToken();
    if (!sessionToken) {
      throw new Error('Session token not available. Ensure client is authenticated first.');
    }
    
    return createDXTradeStreamManager(this.config, sessionToken, options, callbacks);
  }

  /**
   * Start DXTrade WebSocket stream and connect immediately
   * 
   * Convenience method that creates and connects the stream manager.
   */
  async startDXTradeStream(options: DXTradeStreamOptions = {}, callbacks: DXTradeStreamCallbacks = {}): Promise<DXTradeStreamManager> {
    const streamManager = this.createDXTradeStream(options, callbacks);
    
    const connected = await streamManager.connect();
    if (!connected) {
      throw new Error('Failed to connect to DXTrade WebSocket streams');
    }
    
    return streamManager;
  }

  /**
   * Run a DXTrade WebSocket stability test
   * 
   * Based on the test-websocket-5min.ts implementation.
   * Useful for validating connection stability and ping/pong handling.
   */
  async runDXTradeStreamTest(
    durationMs: number = 300000, // 5 minutes default
    options: DXTradeStreamOptions = {},
    callbacks: DXTradeStreamCallbacks = {}
  ) {
    const streamManager = this.createDXTradeStream(options, callbacks);
    return await streamManager.runStabilityTest(durationMs);
  }

  /**
   * Update authentication token for session-based auth
   */
  setSessionToken(token: string): void {
    this.http.setSessionToken(token);
    
    // Note: WebSocket auth is handled separately in the push client
    // You may need to reconnect the WebSocket with the new token
  }
  
  /**
   * Get current session token
   */
  private getSessionToken(): string | undefined {
    // First check if we have a session token from authentication
    const sessionToken = this.http.getSessionToken();
    if (sessionToken) {
      return sessionToken;
    }
    
    // Fallback to configured session token
    const auth = this.config.auth;
    if (auth.type === 'session') {
      return auth.token;
    }
    
    return undefined;
  }

  /**
   * Clear session token
   */
  clearSessionToken(): void {
    this.http.clearSessionToken();
  }

  /**
   * Perform health check on all services
   */
  async healthCheck(): Promise<{
    http: { healthy: boolean; latency?: number; error?: string };
    websocket?: { healthy: boolean; connected: boolean; authenticated: boolean; error?: string };
    overall: boolean;
  }> {
    const results = {
      http: { healthy: false, latency: undefined as number | undefined, error: undefined as string | undefined },
      websocket: undefined as { healthy: boolean; connected: boolean; authenticated: boolean; error?: string } | undefined,
      overall: false,
    };

    // Test HTTP client
    try {
      const start = Date.now();
      await this.http.get('/health');
      results.http = {
        healthy: true,
        latency: Date.now() - start,
        error: undefined,
      };
    } catch (error) {
      results.http = {
        healthy: false,
        latency: undefined,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test WebSocket client
    if (this.push) {
      try {
        const stats = this.push.getStats();
        results.websocket = {
          healthy: stats.state === 'OPEN',
          connected: stats.state === 'OPEN',
          authenticated: stats.authenticated,
        };
      } catch (error) {
        results.websocket = {
          healthy: false,
          connected: false,
          authenticated: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Overall health
    results.overall = results.http.healthy && (results.websocket?.healthy !== false);

    return results;
  }

  /**
   * Destroy client and cleanup resources
   */
  destroy(): void {
    if (this.push) {
      this.push.destroy();
    }
  }

  /**
   * Create and configure push client
   */
  private createPushClient(_config: DXTradeClientConfig): PushClient {
    // Generate WebSocket URL from HTTP base URL
    const wsUrl = this.generateWebSocketUrl();
    
    // Map HTTP auth config to WebSocket auth config
    const wsAuth = this.mapAuthConfig();
    
    const pushConfig: PushClientConfig = {
      websocket: {
        url: wsUrl,
        heartbeatInterval: 30000,
        reconnectDelay: 1000,
        maxReconnectDelay: 30000,
        maxReconnectAttempts: 5,
        pingTimeout: 10000,
        pongTimeout: 5000,
        maxQueueSize: 1000,
        enableBackfill: true,
        backfillLimit: 100,
      },
      auth: wsAuth,
      autoResubscribe: true,
      bufferUpdates: true,
      bufferInterval: 100,
    };

    return new PushClient(pushConfig);
  }

  /**
   * Get default base URL for environment
   */
  private getDefaultBaseUrl(environment: 'demo' | 'live'): string {
    return environment === 'demo' 
      ? 'https://demo-api.dx.trade/api/v1'
      : 'https://api.dx.trade/api/v1';
  }

  /**
   * Generate WebSocket URL from configuration
   * Now supports explicit URL configuration
   */
  private generateWebSocketUrl(): string {
    // First priority: Use explicit WebSocket URLs if available
    // For now, prefer market data WebSocket as it's more commonly used
    if (this.config.urls?.wsMarketData) {
      console.log('Using explicit market data WebSocket URL:', this.config.urls.wsMarketData);
      return this.config.urls.wsMarketData;
    }
    
    if (this.config.urls?.wsPortfolio) {
      console.log('Using explicit portfolio WebSocket URL:', this.config.urls.wsPortfolio);
      return this.config.urls.wsPortfolio;
    }
    
    // Second priority: Legacy websocket baseUrl
    if (this.config.websocket?.baseUrl) {
      console.log('Using legacy WebSocket base URL:', this.config.websocket.baseUrl);
      return this.config.websocket.baseUrl;
    }
    
    // Third priority: Derive from HTTP base URL (legacy behavior)
    const baseUrl = this.config.baseUrl;
    const wsUrl = baseUrl
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')
      .replace('/api', '/ws'); // Common pattern for DXTrade
    
    const fallbackUrl = `${wsUrl}`;
    console.log('Using derived WebSocket URL (fallback):', fallbackUrl);
    return fallbackUrl;
  }

  /**
   * Log WebSocket troubleshooting information
   */
  private logWebSocketTroubleshooting(): void {
    console.log('\n🔧 WebSocket Connection Troubleshooting:');
    console.log('==========================================');
    
    const wsUrl = this.generateWebSocketUrl();
    console.log(`Current WebSocket URL: ${wsUrl}`);
    
    if (this.config.urls?.wsMarketData || this.config.urls?.wsPortfolio) {
      console.log('✅ Explicit WebSocket URLs detected:');
      if (this.config.urls.wsMarketData) {
        console.log(`   Market Data: ${this.config.urls.wsMarketData}`);
      }
      if (this.config.urls.wsPortfolio) {
        console.log(`   Portfolio: ${this.config.urls.wsPortfolio}`);
      }
    } else {
      console.log('⚠️ No explicit WebSocket URLs configured');
      console.log('   Consider setting:');
      console.log('   DXTRADE_WS_MARKET_DATA_URL=wss://your-broker.com/ws/md?format=JSON');
      console.log('   DXTRADE_WS_PORTFOLIO_URL=wss://your-broker.com/ws/?format=JSON');
    }
    
    console.log('\n🚨 Known Issues:');
    console.log('• Current implementation uses single WebSocket connection');
    console.log('• DXTrade API requires dual WebSocket connections (market data + portfolio)');
    console.log('• WebSocket URLs may need specific format parameters');
    console.log('• Check broker documentation for correct WebSocket endpoints');
    console.log('\n💡 Solutions:');
    console.log('• Set explicit WebSocket URLs in environment variables');
    console.log('• Verify broker supports the specified WebSocket endpoints');
    console.log('• Use dual WebSocket architecture when available');
    console.log('• Disable WebSocket if not required: DXTRADE_FEATURE_WEBSOCKET=false\n');
  }

  /**
   * Map HTTP auth config to WebSocket auth config
   */
  private mapAuthConfig(): PushClientConfig['auth'] {
    const auth = this.config.auth;
    
    switch (auth.type) {
      case 'session':
        return {
          type: 'session',
          token: auth.token,
        };
      
      case 'bearer':
        return {
          type: 'bearer',
          token: auth.token,
        };
      
      case 'hmac':
        return {
          type: 'hmac',
          apiKey: auth.apiKey,
          secret: auth.secret,
        };
      
      case 'credentials':
        // For credentials auth, we'll use session mode
        // The HTTP client will handle the initial login
        return {
          type: 'session',
          // Token will be set after HTTP client authenticates
        };
      
      default:
        throw new ConfigError('Unsupported authentication type for WebSocket');
    }
  }
}

/**
 * Factory function to create DXtrade client with validation
 */
export function createDXTradeClient(config: DXTradeClientConfig): DXTradeClient {
  return new DXTradeClient(config);
}

/**
 * Create demo client with sensible defaults
 */
export function createDemoClient(
  auth: DXTradeClientConfig['auth'],
  options: Partial<DXTradeClientConfig> = {}
): DXTradeClient {
  return createDXTradeClient({
    environment: 'demo',
    auth,
    timeout: 30000,
    retries: 3,
    rateLimit: {
      requests: 100,
      window: 60000,
    },
    features: {
      clockSync: true,
      websocket: true,
      autoReconnect: true,
    },
    urls: {},
    endpoints: {
      login: '/login',
      marketData: '/marketdata',
      time: '/time',
      account: '/account',
      wsMarketData: '/ws/md',
      wsPortfolio: '/ws/portfolio',
    },
    enablePushAPI: true,
    ...options,
  });
}

/**
 * Create live client with sensible defaults
 */
export function createLiveClient(
  auth: DXTradeClientConfig['auth'],
  options: Partial<DXTradeClientConfig> = {}
): DXTradeClient {
  return createDXTradeClient({
    environment: 'live',
    auth,
    timeout: 30000,
    retries: 3,
    rateLimit: {
      requests: 100,
      window: 60000,
    },
    features: {
      clockSync: true,
      websocket: true,
      autoReconnect: true,
    },
    urls: {},
    endpoints: {
      login: '/login',
      marketData: '/marketdata',
      time: '/time',
      account: '/account',
      wsMarketData: '/ws/md',
      wsPortfolio: '/ws/portfolio',
    },
    enablePushAPI: true,
    ...options,
  });
}

/**
 * Create REST-only client (no WebSocket)
 */
export function createRestOnlyClient(config: Omit<DXTradeClientConfig, 'enablePushAPI'>): DXTradeClient {
  return createDXTradeClient({
    ...config,
    enablePushAPI: false,
  });
}