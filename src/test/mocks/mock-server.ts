import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'ws';
import type {
  WebSocketMessage,
  QuoteUpdateMessage,
  OrderBookUpdateMessage,
} from '../../types/websocket.js';

/**
 * Mock WebSocket server for testing
 */
export class MockWebSocketServer extends EventEmitter {
  private server?: Server;
  private clients = new Set<WebSocket>();
  private port: number;
  private isRunning = false;

  constructor(port = 0) {
    super();
    this.port = port;
  }

  /**
   * Start mock server
   */
  async start(): Promise<number> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ port: this.port });

      this.server.on('listening', () => {
        const address = this.server?.address();
        const actualPort = typeof address === 'object' && address ? address.port : this.port;
        this.port = actualPort;
        this.isRunning = true;
        this.emit('listening', actualPort);
        resolve(actualPort);
      });

      this.server.on('error', (error) => {
        reject(error);
      });

      this.server.on('connection', (ws) => {
        this.clients.add(ws);
        this.emit('connection', ws);

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString()) as WebSocketMessage;
            this.handleClientMessage(ws, message);
          } catch (error) {
            this.sendError(ws, 400, 'Invalid JSON');
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
          this.emit('clientDisconnect', ws);
        });

        ws.on('error', (error) => {
          this.emit('clientError', ws, error);
        });
      });
    });
  }

  /**
   * Stop mock server
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      // Close all client connections
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();

      // Close server
      this.server?.close(() => {
        this.isRunning = false;
        this.emit('closed');
        resolve();
      });
    });
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    if (!this.isRunning) {
      throw new Error('Server is not running');
    }
    return `ws://localhost:${this.port}`;
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: WebSocketMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Send message to specific client
   */
  sendToClient(client: WebSocket, message: WebSocketMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  /**
   * Send error message
   */
  sendError(client: WebSocket, code: number, message: string): void {
    this.sendToClient(client, {
      type: 'ERROR',
      data: {
        code,
        message,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Simulate quote updates
   */
  simulateQuoteUpdates(symbol: string, count = 10, interval = 100): void {
    let counter = 0;
    const timer = setInterval(() => {
      if (counter >= count || !this.isRunning) {
        clearInterval(timer);
        return;
      }

      const quote: QuoteUpdateMessage = {
        type: 'QUOTE',
        data: {
          symbol,
          bid: 1.1000 + Math.random() * 0.01,
          ask: 1.1010 + Math.random() * 0.01,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      };

      this.broadcast(quote);
      counter++;
    }, interval);
  }

  /**
   * Simulate order book updates
   */
  simulateOrderBookUpdates(symbol: string, count = 5, interval = 200): void {
    let counter = 0;
    const timer = setInterval(() => {
      if (counter >= count || !this.isRunning) {
        clearInterval(timer);
        return;
      }

      const orderBook: OrderBookUpdateMessage = {
        type: 'ORDER_BOOK',
        data: {
          symbol,
          bids: Array.from({ length: 5 }, (_, i) => [
            1.1000 - i * 0.0001,
            1000 + Math.random() * 500,
          ] as [number, number]),
          asks: Array.from({ length: 5 }, (_, i) => [
            1.1010 + i * 0.0001,
            1000 + Math.random() * 500,
          ] as [number, number]),
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      };

      this.broadcast(orderBook);
      counter++;
    }, interval);
  }

  /**
   * Handle client messages
   */
  private handleClientMessage(client: WebSocket, message: WebSocketMessage): void {
    this.emit('message', client, message);

    switch (message.type) {
      case 'AUTH':
        this.handleAuth(client, message);
        break;

      case 'HEARTBEAT':
        this.handleHeartbeat(client, message);
        break;

      case 'SUBSCRIBE':
        this.handleSubscribe(client, message);
        break;

      case 'UNSUBSCRIBE':
        this.handleUnsubscribe(client, message);
        break;

      default:
        this.sendError(client, 400, `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle authentication
   */
  private handleAuth(client: WebSocket, message: WebSocketMessage): void {
    if (message.type === 'AUTH') {
      // Simple auth validation - accept any token for testing
      const token = message.data.token;
      
      if (token && typeof token === 'string' && token.length > 0) {
        this.sendToClient(client, {
          type: 'AUTH',
          data: { success: true },
          timestamp: Date.now(),
        });
        this.emit('authenticated', client);
      } else {
        this.sendError(client, 401, 'Invalid token');
      }
    }
  }

  /**
   * Handle heartbeat
   */
  private handleHeartbeat(client: WebSocket, message: WebSocketMessage): void {
    if (message.type === 'HEARTBEAT') {
      // Echo back the heartbeat
      this.sendToClient(client, {
        type: 'HEARTBEAT',
        data: message.data,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle subscription
   */
  private handleSubscribe(client: WebSocket, message: WebSocketMessage): void {
    if (message.type === 'SUBSCRIBE') {
      // Acknowledge subscription
      this.sendToClient(client, {
        type: 'SUBSCRIBE',
        channel: message.channel,
        symbols: message.symbols,
        timestamp: Date.now(),
      });

      this.emit('subscribe', client, message.channel, message.symbols);

      // Start sending sample data for quotes
      if (message.channel === 'quotes' && message.symbols) {
        setTimeout(() => {
          for (const symbol of message.symbols!) {
            this.simulateQuoteUpdates(symbol, 3, 100);
          }
        }, 100);
      }
    }
  }

  /**
   * Handle unsubscription
   */
  private handleUnsubscribe(client: WebSocket, message: WebSocketMessage): void {
    if (message.type === 'UNSUBSCRIBE') {
      // Acknowledge unsubscription
      this.sendToClient(client, {
        type: 'UNSUBSCRIBE',
        channel: message.channel,
        symbols: message.symbols,
        timestamp: Date.now(),
      });

      this.emit('unsubscribe', client, message.channel, message.symbols);
    }
  }

  /**
   * Force disconnect all clients
   */
  disconnectAll(): void {
    for (const client of this.clients) {
      client.close(1000, 'Server shutdown');
    }
  }

  /**
   * Force disconnect specific client
   */
  disconnectClient(client: WebSocket, code = 1000, reason = 'Disconnected by server'): void {
    client.close(code, reason);
  }
}

/**
 * Mock HTTP response for testing
 */
export class MockHttpResponse {
  constructor(
    public status: number,
    public data: unknown,
    public headers: Record<string, string> = {}
  ) {}

  ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  json(): Promise<unknown> {
    return Promise.resolve(this.data);
  }

  text(): Promise<string> {
    return Promise.resolve(JSON.stringify(this.data));
  }
}

/**
 * Mock fetch function for HTTP testing
 */
export class MockFetch {
  private responses = new Map<string, MockHttpResponse[]>();
  private requestLog: Array<{ url: string; options?: RequestInit }> = [];

  /**
   * Set mock response for URL pattern
   */
  mockResponse(urlPattern: string, response: MockHttpResponse): void {
    if (!this.responses.has(urlPattern)) {
      this.responses.set(urlPattern, []);
    }
    this.responses.get(urlPattern)!.push(response);
  }

  /**
   * Mock implementation of fetch
   */
  fetch = async (url: string | URL, options?: RequestInit): Promise<Response> => {
    const urlString = url.toString();
    this.requestLog.push({ url: urlString, options });

    // Find matching mock response
    for (const [pattern, responses] of this.responses) {
      if (urlString.includes(pattern) && responses.length > 0) {
        const response = responses.shift()!;
        
        return {
          ok: response.ok(),
          status: response.status,
          statusText: response.status === 200 ? 'OK' : 'Error',
          headers: new Headers(response.headers),
          json: response.json.bind(response),
          text: response.text.bind(response),
        } as Response;
      }
    }

    // Default 404 response
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      json: () => Promise.resolve({ error: 'Not found' }),
      text: () => Promise.resolve('Not found'),
    } as Response;
  };

  /**
   * Get request log
   */
  getRequestLog(): Array<{ url: string; options?: RequestInit }> {
    return [...this.requestLog];
  }

  /**
   * Clear request log
   */
  clearLog(): void {
    this.requestLog.length = 0;
  }

  /**
   * Clear all mock responses
   */
  clear(): void {
    this.responses.clear();
    this.requestLog.length = 0;
  }
}