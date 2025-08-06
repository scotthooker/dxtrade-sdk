/**
 * Environment variable configuration helper
 * Allows platform-specific configurations to be loaded from environment variables
 */

import type { SDKConfig, AuthConfig } from '../types/common.js';

/**
 * Load SDK configuration from environment variables
 */
export function loadConfigFromEnv(): Partial<SDKConfig> {
  const config: Partial<SDKConfig> = {};

  // Load base URL (legacy fallback)
  if (process.env.DXTRADE_BASE_URL || process.env.DXTRADE_API_URL) {
    config.baseUrl = process.env.DXTRADE_BASE_URL || process.env.DXTRADE_API_URL;
  }

  // Load environment
  if (process.env.DXTRADE_ENVIRONMENT) {
    config.environment = process.env.DXTRADE_ENVIRONMENT as 'demo' | 'live';
  }

  // Load authentication
  const auth = loadAuthFromEnv();
  if (auth) {
    config.auth = auth;
  }

  // Load timeout
  if (process.env.DXTRADE_TIMEOUT) {
    config.timeout = parseInt(process.env.DXTRADE_TIMEOUT, 10);
  }

  // Load retries
  if (process.env.DXTRADE_RETRIES) {
    config.retries = parseInt(process.env.DXTRADE_RETRIES, 10);
  }

  // Load rate limiting with new variable names
  if (process.env.DXTRADE_RATE_LIMIT_PER_MINUTE || process.env.DXTRADE_RATE_LIMIT_REQUESTS || process.env.DXTRADE_RATE_LIMIT_WINDOW) {
    config.rateLimit = {
      requests: parseInt(
        process.env.DXTRADE_RATE_LIMIT_PER_MINUTE || 
        process.env.DXTRADE_RATE_LIMIT_REQUESTS || 
        '100', 10
      ),
      window: parseInt(process.env.DXTRADE_RATE_LIMIT_WINDOW || '60000', 10),
    };
  }
  
  // Load retry configuration
  if (process.env.DXTRADE_RETRY_MAX_ATTEMPTS) {
    config.retries = parseInt(process.env.DXTRADE_RETRY_MAX_ATTEMPTS, 10);
  }

  // Load features
  config.features = {
    clockSync: process.env.DXTRADE_FEATURE_CLOCK_SYNC !== 'false',
    websocket: process.env.DXTRADE_FEATURE_WEBSOCKET !== 'false',
    autoReconnect: process.env.DXTRADE_FEATURE_AUTO_RECONNECT !== 'false',
  };
  
  // Load WebSocket configuration
  if (process.env.DXTRADE_WS_PING_INTERVAL || process.env.DXTRADE_WS_RECONNECT_ATTEMPTS || process.env.DXTRADE_WS_RECONNECT_DELAY) {
    config.websocket = {
      marketDataPath: '/md',
      portfolioPath: '/?format=JSON',
      ...(config.websocket || {}),
      pingInterval: process.env.DXTRADE_WS_PING_INTERVAL ? parseInt(process.env.DXTRADE_WS_PING_INTERVAL, 10) * 1000 : undefined, // Convert to milliseconds
      reconnectAttempts: process.env.DXTRADE_WS_RECONNECT_ATTEMPTS ? parseInt(process.env.DXTRADE_WS_RECONNECT_ATTEMPTS, 10) : undefined,
      reconnectDelay: process.env.DXTRADE_WS_RECONNECT_DELAY ? parseFloat(process.env.DXTRADE_WS_RECONNECT_DELAY) * 1000 : undefined, // Convert to milliseconds
    };
  }

  // Load explicit URL configuration (preferred)
  const urls = {
    // Authentication URLs
    login: process.env.DXTRADE_LOGIN_URL,
    logout: process.env.DXTRADE_LOGOUT_URL,
    refreshToken: process.env.DXTRADE_REFRESH_TOKEN_URL,
    
    // Market Data URLs
    quotes: process.env.DXTRADE_QUOTES_URL,
    candles: process.env.DXTRADE_CANDLES_URL,
    instruments: process.env.DXTRADE_INSTRUMENTS_URL,
    marketData: process.env.DXTRADE_MARKET_DATA_URL,
    
    // Account & Portfolio URLs
    account: process.env.DXTRADE_ACCOUNT_URL,
    accounts: process.env.DXTRADE_ACCOUNTS_URL,
    portfolio: process.env.DXTRADE_PORTFOLIO_URL,
    balance: process.env.DXTRADE_BALANCE_URL,
    metrics: process.env.DXTRADE_METRICS_URL,
    positions: process.env.DXTRADE_POSITIONS_URL,
    
    // Trading URLs
    orders: process.env.DXTRADE_ORDERS_URL,
    ordersHistory: process.env.DXTRADE_ORDERS_HISTORY_URL,
    trades: process.env.DXTRADE_TRADES_URL,
    history: process.env.DXTRADE_HISTORY_URL,
    
    // System URLs
    time: process.env.DXTRADE_TIME_URL,
    status: process.env.DXTRADE_STATUS_URL,
    version: process.env.DXTRADE_VERSION_URL,
    conversionRates: process.env.DXTRADE_CONVERSION_RATES_URL,
    
    // WebSocket endpoints
    wsMarketData: process.env.DXTRADE_WS_MARKET_DATA_URL,
    wsPortfolio: process.env.DXTRADE_WS_PORTFOLIO_URL,
  };

  // Only set urls if at least one URL is configured
  if (Object.values(urls).some(url => url)) {
    config.urls = urls;
  }

  // Legacy endpoint configuration (fallback)
  config.endpoints = {
    login: process.env.DXTRADE_ENDPOINT_LOGIN || '/login',
    marketData: process.env.DXTRADE_ENDPOINT_MARKET_DATA || '/marketdata',
    time: process.env.DXTRADE_ENDPOINT_TIME || '/time',
    account: process.env.DXTRADE_ENDPOINT_ACCOUNT || '/account',
    wsMarketData: process.env.DXTRADE_ENDPOINT_WS_MARKET_DATA || '/md',
    wsPortfolio: process.env.DXTRADE_ENDPOINT_WS_PORTFOLIO || '/?format=JSON',
  };

  // Legacy WebSocket configuration (fallback)
  if (process.env.DXTRADE_WS_URL || process.env.DXTRADE_WS_MARKET_DATA_PATH || process.env.DXTRADE_WS_PORTFOLIO_PATH) {
    config.websocket = {
      baseUrl: process.env.DXTRADE_WS_URL,
      marketDataPath: process.env.DXTRADE_WS_MARKET_DATA_PATH || '/md',
      portfolioPath: process.env.DXTRADE_WS_PORTFOLIO_PATH || '/?format=JSON',
    };
  }

  return config;
}

/**
 * Load authentication configuration from environment variables
 */
function loadAuthFromEnv(): AuthConfig | undefined {
  // Check for credentials auth
  if (process.env.DXTRADE_USERNAME && process.env.DXTRADE_PASSWORD) {
    return {
      type: 'credentials',
      username: process.env.DXTRADE_USERNAME,
      password: process.env.DXTRADE_PASSWORD,
      domain: process.env.DXTRADE_DOMAIN || 'default',
    };
  }

  // Check for session auth
  if (process.env.DXTRADE_SESSION_TOKEN) {
    return {
      type: 'session',
      token: process.env.DXTRADE_SESSION_TOKEN,
    };
  }

  // Check for bearer auth
  if (process.env.DXTRADE_BEARER_TOKEN) {
    return {
      type: 'bearer',
      token: process.env.DXTRADE_BEARER_TOKEN,
    };
  }

  // Check for HMAC auth
  if (process.env.DXTRADE_API_KEY && process.env.DXTRADE_API_SECRET) {
    return {
      type: 'hmac',
      apiKey: process.env.DXTRADE_API_KEY,
      secret: process.env.DXTRADE_API_SECRET,
    };
  }

  return undefined;
}

/**
 * Create SDK configuration with environment overrides
 */
export function createConfigWithEnv(baseConfig?: Partial<SDKConfig>): SDKConfig {
  const envConfig = loadConfigFromEnv();
  
  // Merge configurations with environment taking precedence
  const merged: Partial<SDKConfig> = {
    ...baseConfig,
    ...envConfig,
  };

  // Ensure auth is provided
  if (!merged.auth) {
    throw new Error('Authentication configuration is required. Set DXTRADE_USERNAME and DXTRADE_PASSWORD or provide auth in config.');
  }

  // Ensure urls is always an object
  if (!merged.urls) {
    merged.urls = {};
  }

  // Type assertion is safe here because we've ensured auth exists
  return merged as SDKConfig;
}

/**
 * Get URL for a specific endpoint with fallback to legacy configuration
 */
export function getEndpointUrl(config: SDKConfig, endpoint: keyof SDKConfig['urls']): string | undefined {
  // First, try to get explicit URL
  if (config.urls?.[endpoint]) {
    return config.urls[endpoint];
  }

  // Fallback to legacy configuration
  if (config.baseUrl && config.endpoints) {
    const endpointPath = getEndpointPath(endpoint, config.endpoints);
    if (endpointPath) {
      return `${config.baseUrl}${endpointPath}`;
    }
  }

  return undefined;
}

/**
 * Map new endpoint names to legacy endpoint paths
 */
function getEndpointPath(endpoint: keyof SDKConfig['urls'], endpoints: SDKConfig['endpoints']): string | undefined {
  switch (endpoint) {
    case 'login':
      return endpoints.login;
    case 'accounts':
    case 'account':
      return endpoints.account;
    case 'time':
      return endpoints.time;
    case 'marketData':
      return endpoints.marketData;
    case 'wsMarketData':
      return endpoints.wsMarketData;
    case 'wsPortfolio':
      return endpoints.wsPortfolio;
    // New endpoints don't have legacy equivalents
    case 'logout':
    case 'refreshToken':
    case 'quotes':
    case 'candles':
    case 'instruments':
    case 'portfolio':
    case 'balance':
    case 'metrics':
    case 'positions':
    case 'orders':
    case 'ordersHistory':
    case 'trades':
    case 'history':
    case 'status':
    case 'version':
    case 'conversionRates':
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Get WebSocket URL for a specific connection type
 */
export function getWebSocketUrl(config: SDKConfig, type: 'marketData' | 'portfolio'): string | undefined {
  // First, try explicit WebSocket URLs
  if (type === 'marketData' && config.urls?.wsMarketData) {
    return config.urls.wsMarketData;
  }
  
  if (type === 'portfolio' && config.urls?.wsPortfolio) {
    return config.urls.wsPortfolio;
  }

  // Fallback to legacy WebSocket configuration
  if (config.websocket?.baseUrl) {
    const path = type === 'marketData' 
      ? config.websocket.marketDataPath 
      : config.websocket.portfolioPath;
    
    return `${config.websocket.baseUrl}${path}`;
  }

  // Derive from base URL if available
  if (config.baseUrl) {
    const wsBaseUrl = config.baseUrl
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')
      .replace('/api', '/ws'); // Common pattern for DXTrade
      
    const path = type === 'marketData' 
      ? config.endpoints?.wsMarketData || '/md'
      : config.endpoints?.wsPortfolio || '/?format=JSON';
      
    return `${wsBaseUrl}${path}`;
  }

  return undefined;
}

/**
 * Legacy function for backward compatibility
 */
export function getWebSocketUrlLegacy(): string | undefined {
  // Check for explicit WebSocket URL
  if (process.env.DXTRADE_WS_URL) {
    return process.env.DXTRADE_WS_URL;
  }

  // Derive from base URL if available
  if (process.env.DXTRADE_BASE_URL || process.env.DXTRADE_API_URL) {
    const baseUrl = process.env.DXTRADE_BASE_URL || process.env.DXTRADE_API_URL;
    return baseUrl!
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:');
  }

  return undefined;
}