import { HttpClient } from './core/http-client.js';
import { AccountsApi } from './rest/accounts.js';
import { InstrumentsApi } from './rest/instruments.js';
import { OrdersApi } from './rest/orders.js';
import { PositionsApi } from './rest/positions.js';
import { PushClient } from './websocket/push-client.js';
import { ConfigError } from './errors/index.js';
import type { SDKConfig } from './types/common.js';
import type { PushClientConfig } from './websocket/push-client.js';
import { SDKConfigSchema } from './types/common.js';

/**
 * Combined SDK configuration
 */
export interface DXTradeClientConfig extends SDKConfig {
  websocket?: Partial<PushClientConfig['websocket']> & {
    enabled?: boolean;
  };
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
    
    // Ensure baseUrl is set
    this.config = {
      ...parsedConfig,
      baseUrl: parsedConfig.baseUrl ?? this.getDefaultBaseUrl(parsedConfig.environment),
    };
    
    // Initialize HTTP client
    this.http = new HttpClient(this.config);
    
    // Initialize REST API modules
    this.accounts = new AccountsApi(this.http);
    this.instruments = new InstrumentsApi(this.http);
    this.orders = new OrdersApi(this.http);
    this.positions = new PositionsApi(this.http);
    
    // Initialize WebSocket client if enabled
    if (config.enablePushAPI !== false) {
      this.push = this.createPushClient(config);
    }
  }

  /**
   * Connect to DXtrade APIs
   */
  async connect(): Promise<void> {
    // HTTP client is already ready, just sync clock if needed
    await this.http.syncClock();
    
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
   * Update authentication token for session-based auth
   */
  setSessionToken(token: string): void {
    this.http.setSessionToken(token);
    
    // Note: WebSocket auth is handled separately in the push client
    // You may need to reconnect the WebSocket with the new token
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
      };
    } catch (error) {
      results.http = {
        healthy: false,
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
  private createPushClient(config: DXTradeClientConfig): PushClient {
    const websocketConfig = config.websocket ?? {};
    
    // Generate WebSocket URL from HTTP base URL
    const wsUrl = this.generateWebSocketUrl();
    
    // Map HTTP auth config to WebSocket auth config
    const wsAuth = this.mapAuthConfig();
    
    const pushConfig: PushClientConfig = {
      websocket: {
        url: wsUrl,
        heartbeatInterval: websocketConfig.heartbeatInterval ?? 30000,
        reconnectDelay: websocketConfig.reconnectDelay ?? 1000,
        maxReconnectDelay: websocketConfig.maxReconnectDelay ?? 30000,
        maxReconnectAttempts: websocketConfig.maxReconnectAttempts ?? 5,
        pingTimeout: websocketConfig.pingTimeout ?? 10000,
        pongTimeout: websocketConfig.pongTimeout ?? 5000,
        maxQueueSize: websocketConfig.maxQueueSize ?? 1000,
        enableBackfill: websocketConfig.enableBackfill ?? true,
        backfillLimit: websocketConfig.backfillLimit ?? 100,
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
   * Generate WebSocket URL from HTTP base URL
   */
  private generateWebSocketUrl(): string {
    const baseUrl = this.config.baseUrl;
    
    if (baseUrl.includes('demo')) {
      return 'wss://demo-ws.dx.trade/v1/push';
    } else {
      return 'wss://ws.dx.trade/v1/push';
    }
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