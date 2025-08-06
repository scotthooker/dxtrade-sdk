import type { HttpClient } from '../core/http-client.js';
import type { Account } from '../types/trading.js';
import type { ApiResponse, PaginatedResponseSchema } from '../types/common.js';
import { AccountSchema } from '../types/trading.js';
import { z } from 'zod';

/**
 * Account balance information
 */
export const AccountBalanceSchema = z.object({
  accountId: z.string(),
  currency: z.string(),
  balance: z.number(),
  availableBalance: z.number(),
  equity: z.number(),
  margin: z.number(),
  freeMargin: z.number(),
  marginLevel: z.number().optional(),
  profit: z.number(),
  credit: z.number().optional(),
  commission: z.number().optional(),
  swap: z.number().optional(),
  timestamp: z.number(),
});

export type AccountBalance = z.infer<typeof AccountBalanceSchema>;

/**
 * Account summary information
 */
export const AccountSummarySchema = z.object({
  accountId: z.string(),
  totalEquity: z.number(),
  totalBalance: z.number(),
  totalMargin: z.number(),
  totalFreeMargin: z.number(),
  totalProfit: z.number(),
  marginLevel: z.number(),
  currency: z.string(),
  leverage: z.number(),
  openPositions: z.number(),
  pendingOrders: z.number(),
  lastUpdate: z.number(),
});

export type AccountSummary = z.infer<typeof AccountSummarySchema>;

/**
 * Account history entry
 */
export const AccountHistoryEntrySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRADE', 'COMMISSION', 'SWAP', 'BONUS', 'ADJUSTMENT']),
  amount: z.number(),
  currency: z.string(),
  description: z.string().optional(),
  reference: z.string().optional(),
  timestamp: z.number(),
});

export type AccountHistoryEntry = z.infer<typeof AccountHistoryEntrySchema>;

/**
 * Account history query parameters
 */
export const AccountHistoryQuerySchema = z.object({
  accountId: z.string().optional(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRADE', 'COMMISSION', 'SWAP', 'BONUS', 'ADJUSTMENT']).optional(),
  fromDate: z.number().optional(),
  toDate: z.number().optional(),
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(1000).optional(),
});

export type AccountHistoryQuery = z.infer<typeof AccountHistoryQuerySchema>;

/**
 * Accounts REST API client
 */
export class AccountsApi {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Get all accounts for the authenticated user
   */
  async getAccounts(): Promise<Account[]> {
    const response = await this.httpClient.get<Account[]>('/accounts');
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve accounts');
    }

    // Validate response data
    const validatedData = z.array(AccountSchema).parse(response.data);
    return validatedData;
  }

  /**
   * Get account by ID
   */
  async getAccount(accountId: string): Promise<Account> {
    const response = await this.httpClient.get<Account>(`/accounts/${accountId}`);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve account');
    }

    // Validate response data
    const validatedData = AccountSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get account balance information
   */
  async getAccountBalance(accountId: string): Promise<AccountBalance> {
    const response = await this.httpClient.get<AccountBalance>(`/accounts/${accountId}/balance`);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve account balance');
    }

    // Validate response data
    const validatedData = AccountBalanceSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get account summary with aggregated information
   */
  async getAccountSummary(accountId: string): Promise<AccountSummary> {
    const response = await this.httpClient.get<AccountSummary>(`/accounts/${accountId}/summary`);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve account summary');
    }

    // Validate response data
    const validatedData = AccountSummarySchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get account transaction history
   */
  async getAccountHistory(
    query: AccountHistoryQuery = {}
  ): Promise<{
    entries: AccountHistoryEntry[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    // Validate query parameters
    const validatedQuery = AccountHistoryQuerySchema.parse(query);
    
    const response = await this.httpClient.get<{
      entries: AccountHistoryEntry[];
      pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>('/accounts/history', validatedQuery);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve account history');
    }

    // Validate response data
    const validatedData = z.object({
      entries: z.array(AccountHistoryEntrySchema),
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
   * Get account equity curve data
   */
  async getEquityCurve(
    accountId: string,
    options: {
      fromDate?: number;
      toDate?: number;
      interval?: 'MINUTE' | 'HOUR' | 'DAY';
    } = {}
  ): Promise<Array<{ timestamp: number; equity: number; balance: number }>> {
    const params = {
      fromDate: options.fromDate,
      toDate: options.toDate,
      interval: options.interval,
    };

    const response = await this.httpClient.get<Array<{ 
      timestamp: number; 
      equity: number; 
      balance: number;
    }>>(`/accounts/${accountId}/equity-curve`, params);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve equity curve');
    }

    // Validate response data
    const validatedData = z.array(z.object({
      timestamp: z.number(),
      equity: z.number(),
      balance: z.number(),
    })).parse(response.data);

    return validatedData;
  }

  /**
   * Get account statistics
   */
  async getAccountStatistics(
    accountId: string,
    options: {
      fromDate?: number;
      toDate?: number;
    } = {}
  ): Promise<{
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    averageWin: number;
    averageLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    totalProfit: number;
    totalCommission: number;
    totalSwap: number;
  }> {
    const params = {
      fromDate: options.fromDate,
      toDate: options.toDate,
    };

    const response = await this.httpClient.get<{
      totalTrades: number;
      winningTrades: number;
      losingTrades: number;
      winRate: number;
      averageWin: number;
      averageLoss: number;
      profitFactor: number;
      maxDrawdown: number;
      maxDrawdownPercent: number;
      sharpeRatio: number;
      totalProfit: number;
      totalCommission: number;
      totalSwap: number;
    }>(`/accounts/${accountId}/statistics`, params);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve account statistics');
    }

    // Validate response data
    const validatedData = z.object({
      totalTrades: z.number(),
      winningTrades: z.number(),
      losingTrades: z.number(),
      winRate: z.number(),
      averageWin: z.number(),
      averageLoss: z.number(),
      profitFactor: z.number(),
      maxDrawdown: z.number(),
      maxDrawdownPercent: z.number(),
      sharpeRatio: z.number(),
      totalProfit: z.number(),
      totalCommission: z.number(),
      totalSwap: z.number(),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Get account margin requirements for a potential position
   */
  async calculateMarginRequirement(
    accountId: string,
    symbol: string,
    volume: number,
    side: 'BUY' | 'SELL'
  ): Promise<{
    marginRequired: number;
    marginCurrency: string;
    marginRate: number;
    availableMargin: number;
    marginLevel: number;
  }> {
    const params = {
      symbol,
      volume,
      side,
    };

    const response = await this.httpClient.get<{
      marginRequired: number;
      marginCurrency: string;
      marginRate: number;
      availableMargin: number;
      marginLevel: number;
    }>(`/accounts/${accountId}/margin-requirement`, params);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to calculate margin requirement');
    }

    // Validate response data
    const validatedData = z.object({
      marginRequired: z.number(),
      marginCurrency: z.string(),
      marginRate: z.number(),
      availableMargin: z.number(),
      marginLevel: z.number(),
    }).parse(response.data);

    return validatedData;
  }
}