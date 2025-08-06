import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ExponentialBackoff } from '../utils/backoff.js';
import { WebSocketError, TimeoutError } from '../errors/index.js';
import type {
  ConnectionState,
  WebSocketConfig,
  WebSocketMessage,
  WebSocketEventMap,
  SubscriptionType,
  SubscriptionState,
} from '../types/websocket.js';
import {
  ConnectionStateSchema,
  WebSocketConfigSchema,
  WebSocketMessageSchema,
} from '../types/websocket.js';

/**
 * WebSocket connection state machine and manager
 */
export class ConnectionManager extends EventEmitter<WebSocketEventMap> {
  private readonly config: Required<WebSocketConfig>;
  private ws?: WebSocket;
  private state: ConnectionState = 'IDLE';
  private reconnectBackoff: ExponentialBackoff;
  private heartbeatTimer?: NodeJS.Timeout;
  private pingTimeout?: NodeJS.Timeout;
  private lastPing = 0;
  private lastPong = 0;
  private messageQueue: Array<{
    message: WebSocketMessage;
    timestamp: number;
  }> = [];
  private subscriptions = new Map<string, SubscriptionState>();
  private reconnectAttempt = 0;
  private isDestroyed = false;

  constructor(config: WebSocketConfig) {
    super();
    
    this.config = {
      ...WebSocketConfigSchema.parse(config),
    };

    this.reconnectBackoff = new ExponentialBackoff({
      initialDelay: this.config.reconnectDelay,
      maxDelay: this.config.maxReconnectDelay,
      maxAttempts: this.config.maxReconnectAttempts,
    });

    // Bind methods to preserve 'this' context
    this.handleOpen = this.handleOpen.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.sendHeartbeat = this.sendHeartbeat.bind(this);
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connection is open and ready
   */
  isConnected(): boolean {
    return this.state === 'OPEN';
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    state: ConnectionState;
    reconnectAttempt: number;
    lastPing: number;
    lastPong: number;
    queueSize: number;
    subscriptions: number;
    uptime?: number;
  } {
    return {
      state: this.state,
      reconnectAttempt: this.reconnectAttempt,
      lastPing: this.lastPing,
      lastPong: this.lastPong,
      queueSize: this.messageQueue.length,
      subscriptions: this.subscriptions.size,
      uptime: this.lastPong > 0 ? Date.now() - this.lastPong : undefined,
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.isDestroyed) {
      throw new WebSocketError('Connection manager is destroyed');
    }

    if (this.state === 'CONNECTING' || this.state === 'OPEN') {
      return;
    }

    this.setState('CONNECTING');

    try {
      await this.createConnection();
    } catch (error) {
      this.setState('ERROR');
      
      if (this.shouldReconnect()) {
        this.scheduleReconnect();
      }
      
      throw error;
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  async disconnect(): Promise<void> {
    if (this.state === 'CLOSED' || this.state === 'IDLE') {
      return;
    }

    this.setState('CLOSING');
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
    }

    // Wait for close event or timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.setState('CLOSED');
        resolve();
      }, 5000);

      const onClose = () => {
        clearTimeout(timeout);
        resolve();
      };

      if (this.state === 'CLOSED') {
        clearTimeout(timeout);
        resolve();
      } else {
        this.once('close', onClose);
      }
    });
  }

  /**
   * Send message to server
   */
  send(message: WebSocketMessage): void {
    if (this.isDestroyed) {
      throw new WebSocketError('Connection manager is destroyed');
    }

    // Validate message
    const validatedMessage = WebSocketMessageSchema.parse(message);

    if (this.isConnected()) {
      this.sendMessage(validatedMessage);
    } else {
      this.queueMessage(validatedMessage);
      
      // Auto-connect if not connecting
      if (this.state === 'IDLE' || this.state === 'CLOSED') {
        this.connect().catch((error) => {
          this.emit('error', new WebSocketError('Failed to auto-connect', {
            cause: error as Error,
          }));
        });
      }
    }
  }

  /**
   * Subscribe to channel
   */
  subscribe(channel: SubscriptionType, symbols?: string[]): void {
    const subscriptionKey = this.getSubscriptionKey(channel, symbols);
    
    this.subscriptions.set(subscriptionKey, {
      channel,
      symbols: symbols ?? [],
      active: false,
    });

    this.send({
      type: 'SUBSCRIBE',
      channel,
      symbols,
      timestamp: Date.now(),
    });
  }

  /**
   * Unsubscribe from channel
   */
  unsubscribe(channel: SubscriptionType, symbols?: string[]): void {
    const subscriptionKey = this.getSubscriptionKey(channel, symbols);
    
    this.subscriptions.delete(subscriptionKey);

    this.send({
      type: 'UNSUBSCRIBE',
      channel,
      symbols,
      timestamp: Date.now(),
    });
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): SubscriptionState[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
  }

  /**
   * Destroy connection manager and cleanup resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    
    this.stopHeartbeat();
    this.clearTimeouts();
    this.clearSubscriptions();
    this.messageQueue.length = 0;

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close(1000, 'Destroying connection');
      this.ws = undefined;
    }

    this.setState('CLOSED');
    this.removeAllListeners();
  }

  /**
   * Create WebSocket connection
   */
  private async createConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);
        
        // Set up event listeners
        this.ws.once('open', () => {
          this.handleOpen();
          resolve();
        });
        
        this.ws.once('error', (error) => {
          this.handleError(error);
          reject(new WebSocketError('Connection failed', {
            cause: error,
            reconnectAttempt: this.reconnectAttempt,
          }));
        });

        this.ws.on('close', this.handleClose);
        this.ws.on('message', this.handleMessage);
        
        // Connection timeout
        const timeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.terminate();
            reject(new TimeoutError('Connection timeout', 10000, {
              operation: 'WebSocket connection',
            }));
          }
        }, 10000);

        this.ws.once('open', () => clearTimeout(timeout));
        
      } catch (error) {
        reject(new WebSocketError('Failed to create connection', {
          cause: error as Error,
        }));
      }
    });
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {
    this.setState('OPEN');
    this.reconnectBackoff.reset();
    this.reconnectAttempt = 0;
    
    this.startHeartbeat();
    this.processMessageQueue();
    this.resubscribeAll();
    
    if (this.reconnectAttempt > 0) {
      this.emit('reconnected');
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(code: number, reason: Buffer): void {
    this.setState('CLOSED');
    this.stopHeartbeat();
    
    const reasonString = reason.toString();
    this.emit('close', code, reasonString);
    
    // Auto-reconnect unless it's a normal closure or we're destroyed
    if (code !== 1000 && !this.isDestroyed && this.shouldReconnect()) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(error: Error): void {
    this.setState('ERROR');
    
    const wsError = new WebSocketError('WebSocket error', {
      cause: error,
      connectionState: this.state,
      lastPing: this.lastPing,
      reconnectAttempt: this.reconnectAttempt,
    });
    
    this.emit('error', wsError);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const raw = data.toString();
      const parsed = JSON.parse(raw) as unknown;
      
      // Validate message structure
      const message = WebSocketMessageSchema.parse(parsed);
      
      // Handle special message types
      this.handleSpecialMessages(message);
      
      // Emit message event
      this.emit('message', message);
      
    } catch (error) {
      this.emit('error', new WebSocketError('Failed to parse message', {
        cause: error as Error,
        details: { data: data.toString().slice(0, 1000) },
      }));
    }
  }

  /**
   * Handle special message types (heartbeat, subscriptions, etc.)
   */
  private handleSpecialMessages(message: WebSocketMessage): void {
    switch (message.type) {
      case 'HEARTBEAT':
        this.handleHeartbeatMessage(message);
        break;
        
      case 'ERROR':
        this.handleErrorMessage(message);
        break;
        
      case 'SUBSCRIBE':
      case 'UNSUBSCRIBE':
        this.handleSubscriptionResponse(message);
        break;
    }
  }

  /**
   * Handle heartbeat message
   */
  private handleHeartbeatMessage(message: WebSocketMessage): void {
    if (message.type === 'HEARTBEAT') {
      this.lastPong = Date.now();
      
      if (this.pingTimeout) {
        clearTimeout(this.pingTimeout);
        this.pingTimeout = undefined;
      }
      
      this.emit('heartbeat', this.lastPong);
    }
  }

  /**
   * Handle error message from server
   */
  private handleErrorMessage(message: WebSocketMessage): void {
    if (message.type === 'ERROR') {
      const error = new WebSocketError(message.data.message, {
        details: message.data.details,
      });
      
      this.emit('error', error);
    }
  }

  /**
   * Handle subscription response
   */
  private handleSubscriptionResponse(message: WebSocketMessage): void {
    if (message.type === 'SUBSCRIBE' || message.type === 'UNSUBSCRIBE') {
      const subscriptionKey = this.getSubscriptionKey(
        message.channel,
        message.symbols
      );
      
      if (message.type === 'SUBSCRIBE') {
        const subscription = this.subscriptions.get(subscriptionKey);
        if (subscription) {
          subscription.active = true;
          subscription.lastUpdate = Date.now();
        }
        
        this.emit('subscribed', message.channel, message.symbols ?? []);
      } else {
        this.emit('unsubscribed', message.channel, message.symbols ?? []);
      }
    }
  }

  /**
   * Send message to WebSocket
   */
  private sendMessage(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new WebSocketError('WebSocket not open');
    }

    try {
      const serialized = JSON.stringify(message);
      this.ws.send(serialized);
    } catch (error) {
      throw new WebSocketError('Failed to send message', {
        cause: error as Error,
      });
    }
  }

  /**
   * Queue message for later sending
   */
  private queueMessage(message: WebSocketMessage): void {
    // Implement backpressure by limiting queue size
    if (this.messageQueue.length >= this.config.maxQueueSize) {
      // Remove oldest messages to make room
      const removeCount = Math.floor(this.config.maxQueueSize * 0.1);
      this.messageQueue.splice(0, removeCount);
    }

    this.messageQueue.push({
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const queued = this.messageQueue.shift();
      if (queued) {
        try {
          this.sendMessage(queued.message);
        } catch (error) {
          // Re-queue message if sending fails
          this.messageQueue.unshift(queued);
          break;
        }
      }
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }
  }

  /**
   * Send heartbeat ping
   */
  private sendHeartbeat(): void {
    if (!this.isConnected()) {
      return;
    }

    this.lastPing = Date.now();
    
    // Set timeout for pong response
    this.pingTimeout = setTimeout(() => {
      this.handleError(new Error('Heartbeat timeout - no pong received'));
    }, this.config.pongTimeout);

    this.send({
      type: 'HEARTBEAT',
      data: {
        ping: this.lastPing,
      },
      timestamp: this.lastPing,
    });
  }

  /**
   * Resubscribe to all channels after reconnection
   */
  private resubscribeAll(): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.active = false;
      
      this.send({
        type: 'SUBSCRIBE',
        channel: subscription.channel,
        symbols: subscription.symbols.length > 0 ? subscription.symbols : undefined,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Check if should attempt reconnection
   */
  private shouldReconnect(): boolean {
    return (
      !this.isDestroyed &&
      this.reconnectAttempt < this.config.maxReconnectAttempts
    );
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect()) {
      return;
    }

    this.reconnectAttempt++;
    
    const delay = this.reconnectBackoff.next();
    
    if (delay < 0) {
      this.emit('error', new WebSocketError('Max reconnection attempts exceeded'));
      return;
    }

    this.emit('reconnecting', this.reconnectAttempt);

    setTimeout(() => {
      if (!this.isDestroyed && this.state !== 'OPEN') {
        this.connect().catch((error) => {
          this.emit('error', new WebSocketError('Reconnection failed', {
            cause: error as Error,
            reconnectAttempt: this.reconnectAttempt,
          }));
        });
      }
    }, delay);
  }

  /**
   * Set connection state and emit event if changed
   */
  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = ConnectionStateSchema.parse(newState);
      
      // Emit state-specific events
      if (newState === 'OPEN') {
        this.emit('open');
      }
    }
  }

  /**
   * Clear all timeouts
   */
  private clearTimeouts(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }
  }

  /**
   * Generate subscription key
   */
  private getSubscriptionKey(channel: SubscriptionType, symbols?: string[]): string {
    const symbolsKey = symbols?.sort().join(',') ?? '';
    return `${channel}:${symbolsKey}`;
  }
}