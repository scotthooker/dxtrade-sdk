import type { HttpClient } from '../core/http-client.js';
import type { Instrument, Quote, InstrumentType } from '../types/trading.js';
import { InstrumentSchema, QuoteSchema } from '../types/trading.js';
import { z } from 'zod';

/**
 * Instrument search filters
 */
export const InstrumentFilterSchema = z.object({
  type: z.enum(['FOREX', 'CFD', 'CRYPTO', 'COMMODITY', 'INDEX', 'STOCK']).optional(),
  tradable: z.boolean().optional(),
  search: z.string().optional(),
  baseAsset: z.string().optional(),
  quoteAsset: z.string().optional(),
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(1000).default(100),
});

export type InstrumentFilter = z.infer<typeof InstrumentFilterSchema>;

/**
 * Market hours information
 */
export const MarketHoursSchema = z.object({
  symbol: z.string(),
  timezone: z.string(),
  sessions: z.array(z.object({
    name: z.string(),
    start: z.string(), // HH:MM format
    end: z.string(),   // HH:MM format
    days: z.array(z.number().min(0).max(6)), // 0 = Sunday, 6 = Saturday
  })),
  holidays: z.array(z.string()), // ISO date strings
  currentSession: z.object({
    name: z.string(),
    isOpen: z.boolean(),
    nextOpen: z.number().optional(),
    nextClose: z.number().optional(),
  }).optional(),
});

export type MarketHours = z.infer<typeof MarketHoursSchema>;

/**
 * Instrument specification with trading conditions
 */
export const InstrumentSpecSchema = InstrumentSchema.extend({
  contractSize: z.number(),
  pointValue: z.number(),
  minCommission: z.number().optional(),
  commissionType: z.enum(['FIXED', 'PERCENTAGE', 'PER_LOT']).optional(),
  commissionRate: z.number().optional(),
  financingRate: z.object({
    long: z.number(),
    short: z.number(),
  }).optional(),
  hedging: z.boolean(),
  maxLeverage: z.number(),
  tradingHours: MarketHoursSchema.optional(),
});

export type InstrumentSpec = z.infer<typeof InstrumentSpecSchema>;

/**
 * Historical price data
 */
export const HistoricalDataSchema = z.object({
  symbol: z.string(),
  timeframe: z.enum(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1']),
  bars: z.array(z.object({
    timestamp: z.number(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number().optional(),
    tickVolume: z.number().optional(),
  })),
});

export type HistoricalData = z.infer<typeof HistoricalDataSchema>;

/**
 * Price statistics
 */
export const PriceStatisticsSchema = z.object({
  symbol: z.string(),
  high24h: z.number(),
  low24h: z.number(),
  change24h: z.number(),
  changePercent24h: z.number(),
  volume24h: z.number().optional(),
  averagePrice: z.number(),
  volatility: z.number(),
  timestamp: z.number(),
});

export type PriceStatistics = z.infer<typeof PriceStatisticsSchema>;

/**
 * Instruments REST API client
 */
export class InstrumentsApi {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Get all available instruments with optional filtering
   */
  async getInstruments(filter: InstrumentFilter = {}): Promise<{
    instruments: Instrument[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    // Validate filter parameters
    const validatedFilter = InstrumentFilterSchema.parse(filter);
    
    const response = await this.httpClient.get<{
      instruments: Instrument[];
      pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>('/instruments', validatedFilter);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve instruments');
    }

    // Validate response data
    const validatedData = z.object({
      instruments: z.array(InstrumentSchema),
      pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      }).optional(),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Get instrument by symbol
   */
  async getInstrument(symbol: string): Promise<Instrument> {
    const response = await this.httpClient.get<Instrument>(`/instruments/${symbol}`);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve instrument');
    }

    // Validate response data
    const validatedData = InstrumentSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get detailed instrument specification including trading conditions
   */
  async getInstrumentSpec(symbol: string): Promise<InstrumentSpec> {
    const response = await this.httpClient.get<InstrumentSpec>(`/instruments/${symbol}/specification`);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve instrument specification');
    }

    // Validate response data
    const validatedData = InstrumentSpecSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get current quote for instrument
   */
  async getQuote(symbol: string): Promise<Quote> {
    const response = await this.httpClient.get<Quote>(`/instruments/${symbol}/quote`);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve quote');
    }

    // Validate response data
    const validatedData = QuoteSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get quotes for multiple instruments
   */
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) {
      return [];
    }

    if (symbols.length > 100) {
      throw new Error('Too many symbols requested (max 100)');
    }

    const params = {
      symbols: symbols.join(','),
    };

    const response = await this.httpClient.get<Quote[]>('/quotes', params);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve quotes');
    }

    // Validate response data
    const validatedData = z.array(QuoteSchema).parse(response.data);
    return validatedData;
  }

  /**
   * Get market hours for instrument
   */
  async getMarketHours(symbol: string): Promise<MarketHours> {
    const response = await this.httpClient.get<MarketHours>(`/instruments/${symbol}/market-hours`);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve market hours');
    }

    // Validate response data
    const validatedData = MarketHoursSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get historical price data
   */
  async getHistoricalData(
    symbol: string,
    options: {
      timeframe: 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1' | 'MN1';
      fromDate?: number;
      toDate?: number;
      limit?: number;
    }
  ): Promise<HistoricalData> {
    const params = {
      timeframe: options.timeframe,
      fromDate: options.fromDate,
      toDate: options.toDate,
      limit: options.limit,
    };

    const response = await this.httpClient.get<HistoricalData>(
      `/instruments/${symbol}/history`,
      params
    );
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve historical data');
    }

    // Validate response data
    const validatedData = HistoricalDataSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get price statistics for instrument
   */
  async getPriceStatistics(symbol: string): Promise<PriceStatistics> {
    const response = await this.httpClient.get<PriceStatistics>(
      `/instruments/${symbol}/statistics`
    );
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve price statistics');
    }

    // Validate response data
    const validatedData = PriceStatisticsSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Search instruments by name or symbol
   */
  async searchInstruments(
    query: string,
    options: {
      type?: InstrumentType;
      limit?: number;
    } = {}
  ): Promise<Instrument[]> {
    if (!query.trim()) {
      throw new Error('Search query cannot be empty');
    }

    const params = {
      search: query.trim(),
      type: options.type,
      limit: Math.min(options.limit ?? 50, 100),
    };

    const response = await this.httpClient.get<Instrument[]>('/instruments/search', params);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to search instruments');
    }

    // Validate response data
    const validatedData = z.array(InstrumentSchema).parse(response.data);
    return validatedData;
  }

  /**
   * Get instruments by type
   */
  async getInstrumentsByType(type: InstrumentType): Promise<Instrument[]> {
    return this.getInstruments({ type }).then(result => result.instruments);
  }

  /**
   * Check if market is open for instrument
   */
  async isMarketOpen(symbol: string): Promise<{
    isOpen: boolean;
    nextOpen?: number;
    nextClose?: number;
    currentSession?: string;
  }> {
    const response = await this.httpClient.get<{
      isOpen: boolean;
      nextOpen?: number;
      nextClose?: number;
      currentSession?: string;
    }>(`/instruments/${symbol}/market-status`);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve market status');
    }

    // Validate response data
    const validatedData = z.object({
      isOpen: z.boolean(),
      nextOpen: z.number().optional(),
      nextClose: z.number().optional(),
      currentSession: z.string().optional(),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Get instrument price ticks (tick-level data)
   */
  async getTicks(
    symbol: string,
    options: {
      fromTimestamp?: number;
      toTimestamp?: number;
      limit?: number;
    } = {}
  ): Promise<Array<{
    timestamp: number;
    bid: number;
    ask: number;
    volume?: number;
  }>> {
    const params = {
      fromTimestamp: options.fromTimestamp,
      toTimestamp: options.toTimestamp,
      limit: Math.min(options.limit ?? 1000, 10000),
    };

    const response = await this.httpClient.get<Array<{
      timestamp: number;
      bid: number;
      ask: number;
      volume?: number;
    }>>(`/instruments/${symbol}/ticks`, params);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve tick data');
    }

    // Validate response data
    const validatedData = z.array(z.object({
      timestamp: z.number(),
      bid: z.number(),
      ask: z.number(),
      volume: z.number().optional(),
    })).parse(response.data);

    return validatedData;
  }
}