import { RateLimitError } from '../errors/index.js';
import type { RateLimiterState } from '../types/common.js';

/**
 * Token bucket rate limiter implementation
 */
export class RateLimiter {
  private readonly requests: number;
  private readonly windowMs: number;
  private readonly timestamps: number[] = [];
  private retryAfter?: number;

  constructor(requests: number, windowMs: number) {
    this.requests = requests;
    this.windowMs = windowMs;
  }

  /**
   * Check if request is allowed and consume a token
   */
  async consume(): Promise<void> {
    const now = Date.now();
    this.cleanup(now);

    // Check if we have capacity
    if (this.timestamps.length >= this.requests) {
      const oldestRequest = this.timestamps[0];
      if (oldestRequest !== undefined) {
        const retryAfter = oldestRequest + this.windowMs - now;
        
        throw new RateLimitError('Rate limit exceeded', {
          retryAfter: Math.max(0, retryAfter),
          limit: this.requests,
          remaining: 0,
          resetTime: oldestRequest + this.windowMs,
        });
      }
    }

    // Add current request
    this.timestamps.push(now);
  }

  /**
   * Get current rate limit status
   */
  getStatus(): {
    limit: number;
    remaining: number;
    resetTime?: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    this.cleanup(now);

    const remaining = Math.max(0, this.requests - this.timestamps.length);
    const oldestRequest = this.timestamps[0];
    const resetTime = oldestRequest ? oldestRequest + this.windowMs : undefined;
    const retryAfter = resetTime && resetTime > now ? resetTime - now : undefined;

    return {
      limit: this.requests,
      remaining,
      resetTime,
      retryAfter,
    };
  }

  /**
   * Update rate limiter based on server response headers
   */
  updateFromHeaders(headers: Record<string, string>): void {
    const retryAfter = headers['retry-after'];
    if (retryAfter) {
      // Retry-After can be in seconds or HTTP date format
      const retryAfterMs = /^\d+$/.test(retryAfter) 
        ? parseInt(retryAfter, 10) * 1000 
        : new Date(retryAfter).getTime() - Date.now();
      
      if (retryAfterMs > 0) {
        this.retryAfter = Date.now() + retryAfterMs;
      }
    }

    // Handle standard rate limit headers
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    
    if (remaining === '0' && reset) {
      const resetTime = parseInt(reset, 10) * 1000;
      if (resetTime > Date.now()) {
        this.retryAfter = resetTime;
      }
    }
  }

  /**
   * Check if we're currently in a retry-after period
   */
  isInRetryPeriod(): boolean {
    if (!this.retryAfter) return false;
    
    const now = Date.now();
    if (now >= this.retryAfter) {
      this.retryAfter = undefined;
      return false;
    }
    
    return true;
  }

  /**
   * Get time until retry is allowed
   */
  getRetryAfter(): number {
    if (!this.retryAfter) return 0;
    return Math.max(0, this.retryAfter - Date.now());
  }

  /**
   * Reset rate limiter state
   */
  reset(): void {
    this.timestamps.length = 0;
    this.retryAfter = undefined;
  }

  /**
   * Export current state
   */
  exportState(): RateLimiterState {
    return {
      requests: [...this.timestamps],
      resetTime: this.retryAfter,
    };
  }

  /**
   * Import state from previous session
   */
  importState(state: RateLimiterState): void {
    const now = Date.now();
    
    // Filter out expired timestamps
    this.timestamps.length = 0;
    this.timestamps.push(
      ...state.requests.filter(timestamp => now - timestamp < this.windowMs)
    );
    
    // Restore retry-after if still valid
    if (state.resetTime && state.resetTime > now) {
      this.retryAfter = state.resetTime;
    }
  }

  /**
   * Remove expired timestamps
   */
  private cleanup(now: number): void {
    const cutoff = now - this.windowMs;
    
    // Remove timestamps older than the window
    let i = 0;
    while (i < this.timestamps.length && (this.timestamps[i] ?? 0) <= cutoff) {
      i++;
    }
    
    if (i > 0) {
      this.timestamps.splice(0, i);
    }
  }
}

/**
 * Adaptive rate limiter that adjusts based on server responses
 */
export class AdaptiveRateLimiter extends RateLimiter {
  private successCount = 0;
  private errorCount = 0;
  private lastAdjustment = Date.now();
  private currentMultiplier = 1;
  
  private readonly minMultiplier = 0.1;
  private readonly maxMultiplier = 1;
  private readonly adjustmentInterval = 60000; // 1 minute

  /**
   * Record successful request
   */
  recordSuccess(): void {
    this.successCount++;
    this.maybeAdjustRate();
  }

  /**
   * Record failed request
   */
  recordError(): void {
    this.errorCount++;
    this.maybeAdjustRate();
  }

  /**
   * Get effective rate limit (adjusted by current multiplier)
   */
  getEffectiveLimit(): number {
    return Math.floor(this.requests * this.currentMultiplier);
  }

  /**
   * Adjust rate based on success/error ratio
   */
  private maybeAdjustRate(): void {
    const now = Date.now();
    if (now - this.lastAdjustment < this.adjustmentInterval) {
      return;
    }

    const totalRequests = this.successCount + this.errorCount;
    if (totalRequests < 10) {
      return; // Not enough data
    }

    const errorRate = this.errorCount / totalRequests;
    
    if (errorRate < 0.01) {
      // Very low error rate, increase rate
      this.currentMultiplier = Math.min(this.maxMultiplier, this.currentMultiplier * 1.1);
    } else if (errorRate > 0.05) {
      // High error rate, decrease rate
      this.currentMultiplier = Math.max(this.minMultiplier, this.currentMultiplier * 0.8);
    }

    // Reset counters
    this.successCount = 0;
    this.errorCount = 0;
    this.lastAdjustment = now;
  }
}