import type { BackoffConfig } from '../types/common.js';

/**
 * Exponential backoff implementation with full jitter
 */
export class ExponentialBackoff {
  private readonly config: Required<BackoffConfig>;
  private attempt = 0;

  constructor(config: Partial<BackoffConfig> = {}) {
    this.config = {
      initialDelay: config.initialDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      multiplier: config.multiplier ?? 2,
      jitter: config.jitter ?? true,
      maxAttempts: config.maxAttempts ?? 5,
    };
  }

  /**
   * Get next delay in milliseconds
   */
  next(): number {
    if (this.attempt >= this.config.maxAttempts) {
      return -1; // No more attempts
    }

    const delay = Math.min(
      this.config.initialDelay * Math.pow(this.config.multiplier, this.attempt),
      this.config.maxDelay
    );

    this.attempt++;

    return this.config.jitter ? this.addJitter(delay) : delay;
  }

  /**
   * Reset backoff state
   */
  reset(): void {
    this.attempt = 0;
  }

  /**
   * Get current attempt number
   */
  getCurrentAttempt(): number {
    return this.attempt;
  }

  /**
   * Check if max attempts reached
   */
  isMaxAttemptsReached(): boolean {
    return this.attempt >= this.config.maxAttempts;
  }

  /**
   * Get remaining attempts
   */
  getRemainingAttempts(): number {
    return Math.max(0, this.config.maxAttempts - this.attempt);
  }

  /**
   * Create a promise that resolves after the next backoff delay
   */
  async wait(): Promise<number> {
    const delay = this.next();
    
    if (delay < 0) {
      throw new Error('Maximum retry attempts exceeded');
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }

  /**
   * Add full jitter to delay
   * Full jitter: random value between 0 and computed delay
   */
  private addJitter(delay: number): number {
    return Math.random() * delay;
  }
}

/**
 * Decorrelated jitter backoff implementation
 * More sophisticated jitter that reduces thundering herd effect
 */
export class DecorrelatedJitterBackoff {
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly maxAttempts: number;
  private attempt = 0;
  private previousDelay: number;

  constructor(config: Partial<BackoffConfig> = {}) {
    this.baseDelay = config.initialDelay ?? 1000;
    this.maxDelay = config.maxDelay ?? 30000;
    this.maxAttempts = config.maxAttempts ?? 5;
    this.previousDelay = this.baseDelay;
  }

  /**
   * Get next delay using decorrelated jitter
   */
  next(): number {
    if (this.attempt >= this.maxAttempts) {
      return -1;
    }

    const delay = Math.min(
      this.maxDelay,
      Math.random() * (this.previousDelay * 3 - this.baseDelay) + this.baseDelay
    );

    this.previousDelay = delay;
    this.attempt++;

    return delay;
  }

  /**
   * Reset backoff state
   */
  reset(): void {
    this.attempt = 0;
    this.previousDelay = this.baseDelay;
  }

  /**
   * Get current attempt number
   */
  getCurrentAttempt(): number {
    return this.attempt;
  }

  /**
   * Check if max attempts reached
   */
  isMaxAttemptsReached(): boolean {
    return this.attempt >= this.maxAttempts;
  }

  /**
   * Create a promise that resolves after the next backoff delay
   */
  async wait(): Promise<number> {
    const delay = this.next();
    
    if (delay < 0) {
      throw new Error('Maximum retry attempts exceeded');
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }
}

/**
 * Retry utility function with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    backoff?: ExponentialBackoff | DecorrelatedJitterBackoff;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number, delay: number) => void;
  } = {}
): Promise<T> {
  const backoff = options.backoff ?? new ExponentialBackoff();
  const shouldRetry = options.shouldRetry ?? (() => true);
  const onRetry = options.onRetry ?? (() => {});

  let lastError: unknown;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error, backoff.getCurrentAttempt())) {
        throw error;
      }

      const delay = backoff.next();
      
      if (delay < 0) {
        throw lastError;
      }

      onRetry(error, backoff.getCurrentAttempt(), delay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Circuit breaker pattern implementation
 * Prevents cascading failures by opening circuit after threshold failures
 */
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeout: number = 60000, // 1 minute
    private readonly successThreshold: number = 3 // successes needed to close circuit
  ) {}

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }

  /**
   * Get failure statistics
   */
  getStats(): {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.successCount = 0;
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}