import type { HttpClient } from '../core/http-client.js';
import type {
  Order,
  OrderRequest,
  OrderSide,
} from '../types/trading.js';
import { OrderSchema, OrderRequestSchema } from '../types/trading.js';
import { TradingError } from '../errors/index.js';
import { z } from 'zod';

/**
 * Order modification request
 */
export const OrderModificationSchema = z.object({
  orderId: z.string(),
  quantity: z.number().positive().optional(),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  trailingAmount: z.number().positive().optional(),
  trailingPercent: z.number().positive().optional(),
});

export type OrderModification = z.infer<typeof OrderModificationSchema>;

/**
 * Order query filters
 */
export const OrderQuerySchema = z.object({
  accountId: z.string().optional(),
  symbol: z.string().optional(),
  status: z.enum(['PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED']).optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  type: z.enum(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT', 'TRAILING_STOP', 'OCO']).optional(),
  fromDate: z.number().optional(),
  toDate: z.number().optional(),
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(1000).default(100),
});

export type OrderQuery = z.infer<typeof OrderQuerySchema>;

/**
 * OCO (One-Cancels-Other) order request
 */
export const OcoOrderRequestSchema = z.object({
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive(),
  // First order (typically limit)
  primaryOrder: z.object({
    type: z.enum(['LIMIT', 'STOP_LIMIT']),
    price: z.number().positive(),
    stopPrice: z.number().positive().optional(),
  }),
  // Second order (typically stop)
  secondaryOrder: z.object({
    type: z.enum(['STOP', 'STOP_LIMIT']),
    price: z.number().positive().optional(),
    stopPrice: z.number().positive(),
  }),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK', 'DAY']).default('GTC'),
  clientOrderId: z.string().optional(),
});

export type OcoOrderRequest = z.infer<typeof OcoOrderRequestSchema>;

/**
 * Bracket order request (entry + stop loss + take profit)
 */
export const BracketOrderRequestSchema = z.object({
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive(),
  // Entry order
  entryOrder: z.object({
    type: z.enum(['MARKET', 'LIMIT', 'STOP']),
    price: z.number().positive().optional(),
    stopPrice: z.number().positive().optional(),
  }),
  // Stop loss order
  stopLoss: z.number().positive(),
  // Take profit order
  takeProfit: z.number().positive(),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK', 'DAY']).default('GTC'),
  clientOrderId: z.string().optional(),
});

export type BracketOrderRequest = z.infer<typeof BracketOrderRequestSchema>;

/**
 * Order execution report
 */
export const OrderExecutionSchema = z.object({
  orderId: z.string(),
  executionId: z.string(),
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number(),
  price: z.number(),
  commission: z.number(),
  timestamp: z.number(),
  liquidity: z.enum(['MAKER', 'TAKER']).optional(),
});

export type OrderExecution = z.infer<typeof OrderExecutionSchema>;

/**
 * Orders REST API client
 */
export class OrdersApi {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Place a new order
   */
  async placeOrder(request: OrderRequest, accountId?: string): Promise<Order> {
    // Validate request
    const validatedRequest = OrderRequestSchema.parse(request);
    
    const url = accountId ? `/accounts/${accountId}/orders` : '/orders';
    
    const response = await this.httpClient.post<Order>(url, validatedRequest, {
      idempotencyKey: request.clientOrderId,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to place order',
        {
          symbol: request.symbol,
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = OrderSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Place OCO (One-Cancels-Other) order
   */
  async placeOcoOrder(request: OcoOrderRequest, accountId?: string): Promise<{
    primaryOrder: Order;
    secondaryOrder: Order;
    ocoGroup: string;
  }> {
    // Validate request
    const validatedRequest = OcoOrderRequestSchema.parse(request);
    
    const url = accountId ? `/accounts/${accountId}/orders/oco` : '/orders/oco';
    
    const response = await this.httpClient.post<{
      primaryOrder: Order;
      secondaryOrder: Order;
      ocoGroup: string;
    }>(url, validatedRequest, {
      idempotencyKey: request.clientOrderId,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to place OCO order',
        {
          symbol: request.symbol,
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = z.object({
      primaryOrder: OrderSchema,
      secondaryOrder: OrderSchema,
      ocoGroup: z.string(),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Place bracket order (entry + stop loss + take profit)
   */
  async placeBracketOrder(request: BracketOrderRequest, accountId?: string): Promise<{
    entryOrder: Order;
    stopLossOrder: Order;
    takeProfitOrder: Order;
    bracketGroup: string;
  }> {
    // Validate request
    const validatedRequest = BracketOrderRequestSchema.parse(request);
    
    const url = accountId ? `/accounts/${accountId}/orders/bracket` : '/orders/bracket';
    
    const response = await this.httpClient.post<{
      entryOrder: Order;
      stopLossOrder: Order;
      takeProfitOrder: Order;
      bracketGroup: string;
    }>(url, validatedRequest, {
      idempotencyKey: request.clientOrderId,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to place bracket order',
        {
          symbol: request.symbol,
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = z.object({
      entryOrder: OrderSchema,
      stopLossOrder: OrderSchema,
      takeProfitOrder: OrderSchema,
      bracketGroup: z.string(),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string, accountId?: string): Promise<Order> {
    const url = accountId ? `/accounts/${accountId}/orders/${orderId}` : `/orders/${orderId}`;
    
    const response = await this.httpClient.get<Order>(url);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve order');
    }

    // Validate response data
    const validatedData = OrderSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Get orders with optional filtering
   */
  async getOrders(query: OrderQuery = { limit: 100 }): Promise<{
    orders: Order[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    // Validate query parameters
    const validatedQuery = OrderQuerySchema.parse(query);
    
    const url = query.accountId ? `/accounts/${query.accountId}/orders` : '/orders';
    
    // Remove accountId from query params as it's in the URL
    const { accountId, ...params } = validatedQuery;
    
    const response = await this.httpClient.get<{
      orders: Order[];
      pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(url, params);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve orders');
    }

    // Validate response data
    const validatedData = z.object({
      orders: z.array(OrderSchema),
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
   * Get pending orders
   */
  async getPendingOrders(accountId?: string): Promise<Order[]> {
    const result = await this.getOrders({
      accountId,
      status: 'PENDING',
      limit: 100,
    });
    
    return result.orders;
  }

  /**
   * Get order history
   */
  async getOrderHistory(
    options: {
      accountId?: string;
      symbol?: string;
      fromDate?: number;
      toDate?: number;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    orders: Order[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    return this.getOrders({
      ...options,
      status: 'FILLED',
      limit: options.limit ?? 100,
    });
  }

  /**
   * Modify existing order
   */
  async modifyOrder(modification: OrderModification, accountId?: string): Promise<Order> {
    // Validate modification request
    const validatedModification = OrderModificationSchema.parse(modification);
    
    const url = accountId 
      ? `/accounts/${accountId}/orders/${modification.orderId}`
      : `/orders/${modification.orderId}`;
    
    const response = await this.httpClient.put<Order>(url, validatedModification, {
      idempotencyKey: `modify-${modification.orderId}-${Date.now()}`,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to modify order',
        {
          orderRef: modification.orderId,
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = OrderSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Cancel order by ID
   */
  async cancelOrder(orderId: string, accountId?: string): Promise<Order> {
    const url = accountId 
      ? `/accounts/${accountId}/orders/${orderId}/cancel`
      : `/orders/${orderId}/cancel`;
    
    const response = await this.httpClient.post<Order>(url, {}, {
      idempotencyKey: `cancel-${orderId}-${Date.now()}`,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to cancel order',
        {
          orderRef: orderId,
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = OrderSchema.parse(response.data);
    return validatedData;
  }

  /**
   * Cancel multiple orders
   */
  async cancelOrders(
    orderIds: string[],
    accountId?: string
  ): Promise<{
    cancelled: Order[];
    failed: Array<{ orderId: string; error: string }>;
  }> {
    if (orderIds.length === 0) {
      return { cancelled: [], failed: [] };
    }

    if (orderIds.length > 100) {
      throw new Error('Too many orders to cancel (max 100)');
    }

    const url = accountId ? `/accounts/${accountId}/orders/cancel-multiple` : '/orders/cancel-multiple';
    
    const response = await this.httpClient.post<{
      cancelled: Order[];
      failed: Array<{ orderId: string; error: string }>;
    }>(url, { orderIds }, {
      idempotencyKey: `cancel-multiple-${Date.now()}`,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to cancel orders',
        {
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = z.object({
      cancelled: z.array(OrderSchema),
      failed: z.array(z.object({
        orderId: z.string(),
        error: z.string(),
      })),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Cancel all orders for symbol or account
   */
  async cancelAllOrders(
    options: {
      accountId?: string;
      symbol?: string;
      side?: OrderSide;
    } = {}
  ): Promise<{
    cancelled: Order[];
    failed: Array<{ orderId: string; error: string }>;
  }> {
    const url = options.accountId 
      ? `/accounts/${options.accountId}/orders/cancel-all`
      : '/orders/cancel-all';
    
    const params = {
      symbol: options.symbol,
      side: options.side,
    };

    const response = await this.httpClient.post<{
      cancelled: Order[];
      failed: Array<{ orderId: string; error: string }>;
    }>(url, params, {
      idempotencyKey: `cancel-all-${Date.now()}`,
    });
    
    if (!response.success || !response.data) {
      throw new TradingError(
        response.message ?? 'Failed to cancel all orders',
        {
          symbol: options.symbol,
          details: { errors: response.errors },
        }
      );
    }

    // Validate response data
    const validatedData = z.object({
      cancelled: z.array(OrderSchema),
      failed: z.array(z.object({
        orderId: z.string(),
        error: z.string(),
      })),
    }).parse(response.data);

    return validatedData;
  }

  /**
   * Get order executions/fills
   */
  async getOrderExecutions(
    orderId: string,
    accountId?: string
  ): Promise<OrderExecution[]> {
    const url = accountId 
      ? `/accounts/${accountId}/orders/${orderId}/executions`
      : `/orders/${orderId}/executions`;
    
    const response = await this.httpClient.get<OrderExecution[]>(url);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to retrieve order executions');
    }

    // Validate response data
    const validatedData = z.array(OrderExecutionSchema).parse(response.data);
    return validatedData;
  }

  /**
   * Estimate order (dry run without placing)
   */
  async estimateOrder(request: OrderRequest, accountId?: string): Promise<{
    estimatedPrice: number;
    estimatedCommission: number;
    marginRequired: number;
    estimatedSlippage?: number;
  }> {
    // Validate request
    const validatedRequest = OrderRequestSchema.parse(request);
    
    const url = accountId ? `/accounts/${accountId}/orders/estimate` : '/orders/estimate';
    
    const response = await this.httpClient.post<{
      estimatedPrice: number;
      estimatedCommission: number;
      marginRequired: number;
      estimatedSlippage?: number;
    }>(url, validatedRequest);
    
    if (!response.success || !response.data) {
      throw new Error(response.message ?? 'Failed to estimate order');
    }

    // Validate response data
    const validatedData = z.object({
      estimatedPrice: z.number(),
      estimatedCommission: z.number(),
      marginRequired: z.number(),
      estimatedSlippage: z.number().optional(),
    }).parse(response.data);

    return validatedData;
  }
}