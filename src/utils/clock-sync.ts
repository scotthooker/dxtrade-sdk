import { ClockSyncError } from '../errors/index.js';
import type { ClockSync } from '../types/common.js';

/**
 * Clock synchronization utility for handling server time drift
 */
export class ClockSynchronizer {
  private readonly config: Required<ClockSync>;
  private offset = 0;
  private lastSync = 0;
  private syncInProgress = false;
  private syncPromise?: Promise<void>;

  constructor(config: Partial<ClockSync> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      maxDrift: config.maxDrift ?? 5000,
      syncInterval: config.syncInterval ?? 300000,
    };
  }

  /**
   * Get current server time estimate
   */
  getServerTime(): number {
    return Date.now() + this.offset;
  }

  /**
   * Get current time offset from server
   */
  getOffset(): number {
    return this.offset;
  }

  /**
   * Get time since last sync
   */
  getTimeSinceLastSync(): number {
    return Date.now() - this.lastSync;
  }

  /**
   * Check if sync is needed
   */
  needsSync(): boolean {
    if (!this.config.enabled) return false;
    
    return (
      this.lastSync === 0 ||
      Date.now() - this.lastSync > this.config.syncInterval
    );
  }

  /**
   * Synchronize with server time
   */
  async sync(getServerTime: () => Promise<number>): Promise<void> {
    if (!this.config.enabled) return;
    
    if (this.syncInProgress) {
      await this.syncPromise;
      return;
    }

    this.syncInProgress = true;
    this.syncPromise = this.performSync(getServerTime);
    
    try {
      await this.syncPromise;
    } finally {
      this.syncInProgress = false;
      this.syncPromise = undefined;
    }
  }

  /**
   * Validate timestamp against acceptable drift
   */
  validateTimestamp(timestamp: number): void {
    if (!this.config.enabled) return;

    const now = this.getServerTime();
    const drift = Math.abs(timestamp - now);

    if (drift > this.config.maxDrift) {
      throw new ClockSyncError(
        `Clock drift exceeded maximum allowed (${this.config.maxDrift}ms)`,
        timestamp,
        now,
        drift
      );
    }
  }

  /**
   * Generate timestamp for request
   */
  generateTimestamp(): number {
    return this.getServerTime();
  }

  /**
   * Get sync status
   */
  getStatus(): {
    enabled: boolean;
    offset: number;
    lastSync: number;
    timeSinceLastSync: number;
    needsSync: boolean;
    syncInProgress: boolean;
  } {
    return {
      enabled: this.config.enabled,
      offset: this.offset,
      lastSync: this.lastSync,
      timeSinceLastSync: this.getTimeSinceLastSync(),
      needsSync: this.needsSync(),
      syncInProgress: this.syncInProgress,
    };
  }

  /**
   * Reset clock synchronization
   */
  reset(): void {
    this.offset = 0;
    this.lastSync = 0;
    this.syncInProgress = false;
    this.syncPromise = undefined;
  }

  /**
   * Perform actual time synchronization using NTP-like algorithm
   */
  private async performSync(getServerTime: () => Promise<number>): Promise<void> {
    const samples: Array<{ offset: number; roundTrip: number }> = [];
    
    // Take multiple samples for better accuracy
    for (let i = 0; i < 5; i++) {
      const t1 = Date.now();
      
      try {
        const serverTime = await getServerTime();
        const t2 = Date.now();
        
        const roundTrip = t2 - t1;
        const estimatedServerTime = serverTime - roundTrip / 2;
        const offset = estimatedServerTime - t1;
        
        samples.push({ offset, roundTrip });
        
        // Small delay between samples
        if (i < 4) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        // Skip this sample if server time request fails
        continue;
      }
    }

    if (samples.length === 0) {
      throw new ClockSyncError(
        'Unable to synchronize with server time',
        0,
        Date.now(),
        0
      );
    }

    // Use sample with smallest round trip time for best accuracy
    const bestSample = samples.reduce((best, current) => 
      current.roundTrip < best.roundTrip ? current : best
    );

    const previousOffset = this.offset;
    this.offset = bestSample.offset;
    this.lastSync = Date.now();

    // Check if offset changed significantly
    const offsetChange = Math.abs(this.offset - previousOffset);
    if (offsetChange > 1000) { // More than 1 second change
      console.warn(
        `Significant clock offset change detected: ${offsetChange}ms ` +
        `(old: ${previousOffset}ms, new: ${this.offset}ms)`
      );
    }
  }
}

/**
 * High-resolution timestamp generator with jitter protection
 */
export class TimestampGenerator {
  private lastTimestamp = 0;
  private sequence = 0;

  constructor(private readonly clockSync?: ClockSynchronizer) {}

  /**
   * Generate unique, monotonically increasing timestamp
   */
  generate(): number {
    const now = this.clockSync?.getServerTime() ?? Date.now();
    
    if (now <= this.lastTimestamp) {
      // Handle clock going backwards or same millisecond
      this.sequence++;
      return this.lastTimestamp + this.sequence;
    }
    
    this.lastTimestamp = now;
    this.sequence = 0;
    return now;
  }

  /**
   * Generate timestamp with microsecond precision (simulated)
   */
  generateMicro(): number {
    const timestamp = this.generate();
    return timestamp * 1000 + (performance.now() % 1) * 1000;
  }

  /**
   * Generate timestamp with nanosecond precision (simulated)
   */
  generateNano(): bigint {
    const timestamp = this.generate();
    const nanoOffset = BigInt(Math.floor((performance.now() % 1) * 1000000));
    return BigInt(timestamp) * 1000000n + nanoOffset;
  }

  /**
   * Reset generator state
   */
  reset(): void {
    this.lastTimestamp = 0;
    this.sequence = 0;
  }
}

/**
 * Utility functions for timestamp handling
 */
export const TimestampUtils = {
  /**
   * Convert timestamp to ISO string
   */
  toISO(timestamp: number): string {
    return new Date(timestamp).toISOString();
  },

  /**
   * Parse ISO string to timestamp
   */
  fromISO(iso: string): number {
    return new Date(iso).getTime();
  },

  /**
   * Get timestamp from Unix epoch seconds
   */
  fromUnixSeconds(seconds: number): number {
    return seconds * 1000;
  },

  /**
   * Convert timestamp to Unix epoch seconds
   */
  toUnixSeconds(timestamp: number): number {
    return Math.floor(timestamp / 1000);
  },

  /**
   * Check if timestamp is valid
   */
  isValid(timestamp: number): boolean {
    return (
      Number.isInteger(timestamp) &&
      timestamp > 0 &&
      timestamp <= Date.now() + 365 * 24 * 60 * 60 * 1000 // Not more than 1 year in future
    );
  },

  /**
   * Calculate age of timestamp in milliseconds
   */
  age(timestamp: number): number {
    return Date.now() - timestamp;
  },

  /**
   * Check if timestamp is within acceptable age
   */
  isRecent(timestamp: number, maxAge: number = 30000): boolean {
    return this.age(timestamp) <= maxAge;
  },
};