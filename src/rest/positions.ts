import type { HttpClient } from '../core/http-client.js';
import type { Position, PositionSide } from '../types/trading.js';
import { PositionSchema } from '../types/trading.js';
import { TradingError } from '../errors/index.js';
import { z } from 'zod';

/**
 * Position query filters
 */
export const PositionQuerySchema = z.object({
  accountId: z.string().optional(),
  symbol: z.string().optional(),
  side: z.enum(['LONG', 'SHORT']).optional(),
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(1000).default(100),
});

export type PositionQuery = z.infer<typeof PositionQuerySchema>;

/**
 * Position modification request
 */
export const PositionModificationSchema = z.object({
  positionId: z.string(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  trailingStop: z.object({
    amount: z.number().positive().optional(),
    percent: z.number().positive().optional(),
  }).optional(),
});

export type PositionModification = z.infer<typeof PositionModificationSchema>;

/**
 * Position close request
 */
export const PositionCloseRequestSchema = z.object({
  positionId: z.string(),
  quantity: z.number().positive().optional(), // If not specified, close entire position
  price: z.number().positive().optional(), // For limit close orders
});

export type PositionCloseRequest = z.infer<typeof PositionCloseRequestSchema>;

/**
 * Position statistics
 */
export const PositionStatisticsSchema = z.object({
  positionId: z.string(),
  symbol: z.string(),
  openTime: z.number(),
  holdingPeriod: z.number(), // in milliseconds
  maxUnrealizedProfit: z.number(),
  maxUnrealizedLoss: z.number(),
  maxDrawdown: z.number(),
  maxDrawdownPercent: z.number(),
  averagePrice: z.number(),
  totalSwap: z.number(),
  totalCommission: z.number(),
  netProfit: z.number(), // unrealized PnL - swap - commission
  returnOnInvestment: z.number(), // as percentage
});

export type PositionStatistics = z.infer<typeof PositionStatisticsSchema>;

/**
 * Position risk metrics
 */
export const PositionRiskSchema = z.object({
  positionId: z.string(),
  symbol: z.string(),
  marginUsed: z.number(),
  marginLevel: z.number(),
  valueAtRisk: z.number(), // 1-day 95% VaR
  expectedShortfall: z.number(), // Conditional VaR
  beta: z.number().optional(), // If position is correlated to market
  sharpeRatio: z.number().optional(),
  maxLeverage: z.number(),
  currentLeverage: z.number(),
  liquidationPrice: z.number().optional(),
});

export type PositionRisk = z.infer<typeof PositionRiskSchema>;

/**
 * Portfolio summary
 */
export const PortfolioSummarySchema = z.object({
  totalPositions: z.number(),
  longPositions: z.number(),
  shortPositions: z.number(),
  totalUnrealizedPnl: z.number(),
  totalRealizedPnl: z.number(),
  totalMarginUsed: z.number(),
  totalNotionalValue: z.number(),
  netExposure: z.number(),
  grossExposure: z.number(),
  portfolioBeta: z.number().optional(),
  portfolioSharpe: z.number().optional(),
  concentrationRisk: z.number(), // Percentage of portfolio in largest position
  timestamp: z.number(),
});

export type PortfolioSummary = z.infer<typeof PortfolioSummarySchema>;

/**
 * Positions REST API client
 */
export class PositionsApi {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Get all positions with optional filtering
   */
  async getPositions(query: PositionQuery = { limit: 100 }): Promise<{
    positions: Position[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    // Validate query parameters
    const validatedQuery = PositionQuerySchema.parse(query);
    
    const url = query.accountId ? `/accounts/${query.accountId}/positions` : '/positions';
    
    // Remove accountId from query params as it's in the URL
    const { accountId, ...params } = validatedQuery;
    
    const response = await this.httpClient.get<{
      positions: Position[];
      pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(url, params);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve positions');
    }

    // Validate response data
    const validatedData = z.object({
      positions: z.array(PositionSchema),
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
   * Get position by ID
   */
  async getPosition(positionId: string, accountId?: string): Promise<Position> {
    const url = accountId 
      ? `/accounts/${accountId}/positions/${positionId}`
      : `/positions/${positionId}`;
    
    const response = await this.httpClient.get<Position>(url);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve position');
    }

    // Validate response data
    const validatedData = PositionSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get positions for specific symbol
   */
  async getPositionsBySymbol(symbol: string, accountId?: string): Promise<Position[]> {
    const result = await this.getPositions({
      accountId,
      symbol,
      limit: 100,
    });
    
    return result.positions;
  }

  /**
   * Get open positions only
   */
  async getOpenPositions(accountId?: string): Promise<Position[]> {
    const result = await this.getPositions({ accountId, limit: 100 });
    
    // Filter positions with non-zero size
    return result.positions.filter(position => position.size !== 0);
  }

  /**
   * Modify position (add/modify stop loss, take profit, trailing stop)
   */
  async modifyPosition(
    modification: PositionModification,
    accountId?: string
  ): Promise<Position> {
    // Validate modification request
    const validatedModification = PositionModificationSchema.parse(modification);
    
    const url = accountId 
      ? `/accounts/${accountId}/positions/${modification.positionId}`
      : `/positions/${modification.positionId}`;
    
    const response = await this.httpClient.put<Position>(url, validatedModification, {
      idempotencyKey: `modify-position-${modification.positionId}-${Date.now()}`,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to modify position',
        {
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = PositionSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Close position (fully or partially)
   */
  async closePosition(
    request: PositionCloseRequest,
    accountId?: string
  ): Promise<{
    position: Position;
    orderId?: string;
  }> {
    // Validate close request
    const validatedRequest = PositionCloseRequestSchema.parse(request);
    
    const url = accountId 
      ? `/accounts/${accountId}/positions/${request.positionId}/close`
      : `/positions/${request.positionId}/close`;
    
    const response = await this.httpClient.post<{
      position: Position;
      orderId?: string;
    }>(url, validatedRequest, {
      idempotencyKey: `close-position-${request.positionId}-${Date.now()}`,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to close position',
        {
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = z.object({
      position: PositionSchema,
      orderId: z.string().optional(),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Close multiple positions
   */
  async closePositions(
    positionIds: string[],
    accountId?: string
  ): Promise<{
    closed: Array<{ position: Position; orderId?: string }>;
    failed: Array<{ positionId: string; error: string }>;
  }> {
    if (positionIds.length === 0) {
      return { closed: [], failed: [] };
    }

    if (positionIds.length > 100) {
      throw new Error('Too many positions to close (max 100)');
    }

    const url = accountId 
      ? `/accounts/${accountId}/positions/close-multiple`
      : '/positions/close-multiple';
    
    const response = await this.httpClient.post<{
      closed: Array<{ position: Position; orderId?: string }>;
      failed: Array<{ positionId: string; error: string }>;
    }>(url, { positionIds }, {
      idempotencyKey: `close-multiple-positions-${Date.now()}`,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to close positions',
        {
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = z.object({
      closed: z.array(z.object({
        position: PositionSchema,
        orderId: z.string().optional(),
      })),
      failed: z.array(z.object({
        positionId: z.string(),
        error: z.string(),
      })),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Close all positions for symbol or account
   */
  async closeAllPositions(
    options: {
      accountId?: string;
      symbol?: string;
      side?: PositionSide;
    } = {}
  ): Promise<{
    closed: Array<{ position: Position; orderId?: string }>;
    failed: Array<{ positionId: string; error: string }>;
  }> {
    const url = options.accountId 
      ? `/accounts/${options.accountId}/positions/close-all`
      : '/positions/close-all';
    
    const params = {
      symbol: options.symbol,
      side: options.side,
    };

    const response = await this.httpClient.post<{
      closed: Array<{ position: Position; orderId?: string }>;
      failed: Array<{ positionId: string; error: string }>;
    }>(url, params, {
      idempotencyKey: `close-all-positions-${Date.now()}`,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to close all positions',
        {
          symbol: options.symbol,
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = z.object({
      closed: z.array(z.object({
        position: PositionSchema,
        orderId: z.string().optional(),
      })),
      failed: z.array(z.object({
        positionId: z.string(),
        error: z.string(),
      })),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Get position statistics
   */
  async getPositionStatistics(
    positionId: string,
    accountId?: string
  ): Promise<PositionStatistics> {
    const url = accountId 
      ? `/accounts/${accountId}/positions/${positionId}/statistics`
      : `/positions/${positionId}/statistics`;
    
    const response = await this.httpClient.get<PositionStatistics>(url);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve position statistics');
    }

    // Validate response data
    const validatedData = PositionStatisticsSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get position risk metrics
   */
  async getPositionRisk(
    positionId: string,
    accountId?: string
  ): Promise<PositionRisk> {
    const url = accountId 
      ? `/accounts/${accountId}/positions/${positionId}/risk`
      : `/positions/${positionId}/risk`;
    
    const response = await this.httpClient.get<PositionRisk>(url);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve position risk');
    }

    // Validate response data
    const validatedData = PositionRiskSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(accountId?: string): Promise<PortfolioSummary> {
    const url = accountId 
      ? `/accounts/${accountId}/portfolio/summary`
      : '/portfolio/summary';
    
    const response = await this.httpClient.get<PortfolioSummary>(url);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve portfolio summary');
    }

    // Validate response data
    const validatedData = PortfolioSummarySchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get net position for symbol (sum of all positions for the same symbol)
   */
  async getNetPosition(
    symbol: string,
    accountId?: string
  ): Promise<{
    symbol: string;
    netSize: number;
    netSide: PositionSide | null;
    averageEntryPrice: number;
    totalUnrealizedPnl: number;
    totalMargin: number;
    positionCount: number;
  }> {
    const url = accountId 
      ? `/accounts/${accountId}/positions/${symbol}/net`
      : `/positions/${symbol}/net`;
    
    const response = await this.httpClient.get<{
      symbol: string;
      netSize: number;
      netSide: PositionSide | null;
      averageEntryPrice: number;
      totalUnrealizedPnl: number;
      totalMargin: number;
      positionCount: number;
    }>(url);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve net position');
    }

    // Validate response data
    const validatedData = z.object({
      symbol: z.string(),
      netSize: z.number(),
      netSide: z.enum(['LONG', 'SHORT']).nullable(),
      averageEntryPrice: z.number(),
      totalUnrealizedPnl: z.number(),
      totalMargin: z.number(),
      positionCount: z.number(),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Calculate position size for risk amount
   */
  async calculatePositionSize(
    symbol: string,
    riskAmount: number,
    entryPrice: number,
    stopLossPrice: number,
    accountId?: string
  ): Promise<{
    positionSize: number;
    marginRequired: number;
    riskReward?: number;
  }> {
    const params = {
      riskAmount,
      entryPrice,
      stopLossPrice,
    };

    const url = accountId 
      ? `/accounts/${accountId}/positions/${symbol}/calculate-size`
      : `/positions/${symbol}/calculate-size`;
    
    const response = await this.httpClient.get<{
      positionSize: number;
      marginRequired: number;
      riskReward?: number;
    }>(url, params);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to calculate position size');
    }

    // Validate response data
    const validatedData = z.object({
      positionSize: z.number(),
      marginRequired: z.number(),
      riskReward: z.number().optional(),
    }).parse(response.data);

    return validatedData;
  }
}