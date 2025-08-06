/**
 * DXtrade REST API module exports
 */

export { AccountsApi } from './accounts.js';
export { InstrumentsApi } from './instruments.js';
export { OrdersApi } from './orders.js';
export { PositionsApi } from './positions.js';

// Re-export types from each module
export type {
  AccountBalance,
  AccountSummary,
  AccountHistoryEntry,
  AccountHistoryQuery,
} from './accounts.js';

export type {
  InstrumentFilter,
  MarketHours,
  InstrumentSpec,
  HistoricalData,
  PriceStatistics,
} from './instruments.js';

export type {
  OrderModification,
  OrderQuery,
  OcoOrderRequest,
  BracketOrderRequest,
  OrderExecution,
} from './orders.js';

export type {
  PositionQuery,
  PositionModification,
  PositionCloseRequest,
  PositionStatistics,
  PositionRisk,
  PortfolioSummary,
} from './positions.js';