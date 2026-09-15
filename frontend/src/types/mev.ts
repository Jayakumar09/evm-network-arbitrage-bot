export interface MonitoredBlock {
  number: number;
  hash: string;
  timestamp: number;
  transactionCount: number;
}

export interface MonitoredTransaction {
  hash: string;
  blockNumber: number;
  from: string;
  to: string | null;
  value: bigint;
  gasLimit?: bigint;
  gasPrice?: bigint;
  nonce?: number;
  data: string;
}

export interface TransactionMonitorOptions {
  includeFailed?: boolean;
  addresses?: string[];
}

export type MevDex = "V2" | "V3";

export interface BackrunCandidate {
  triggerTransactionHash: string;
  blockNumber: number;

  tokenIn?: string;
  tokenOut?: string;

  amountIn?: bigint;
  expectedAmountOut?: bigint;

  // V2 trigger execution constraints
  amountOutMin?: bigint;
  path?: string[];

  // Future backrun execution data
  backrunDex?: MevDex;
  backrunTokenIn?: string;
  backrunTokenOut?: string;
  backrunAmountIn?: bigint;
  backrunExpectedAmountOut?: bigint;
  backrunMinAmountOut?: bigint;

  // Future flash-loan execution data
  flashLoanAsset?: string;
  flashLoanAmount?: bigint;
  minProfit?: bigint;

  description: string;

  detectedAt: number;
}

// ======================================================
// Paper Execution
// ======================================================
//
// Represents a hypothetical MEV backrun execution.
//
// IMPORTANT:
// This is PAPER ONLY.
// No wallet signature is requested.
// No blockchain transaction is submitted.
// No blockchain state is modified.
// ======================================================

// ======================================================
// PAPER EXECUTION STATE
// ======================================================
//
// Phase 2 MEV development only.
//
// These states describe the lifecycle of a hypothetical
// paper execution. They do NOT represent blockchain
// transaction states.
// ======================================================

export type PaperExecutionState =
  | "SIMULATED"
  | "PAPER_ACCEPTED"
  | "PAPER_RECORDED";

export interface PaperExecutionPlan {
  paperExecutionId: string;
  triggerTransactionHash: string;

  // Backrun execution data
  backrunDex: MevDex;
  backrunTokenIn: string;
  backrunTokenOut: string;
  backrunAmountIn: bigint;
  backrunExpectedAmountOut: bigint;

  blockNumber: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  expectedAmountOut: bigint;
  expectedProfit: bigint;
  gasCost: bigint;
  netProfit: bigint;
  profitable: boolean;
  createdAt: number;
  paperOnly: true;
  state: PaperExecutionState;
}

export interface PaperExecutionResult {
  success: boolean;

  plan?: PaperExecutionPlan;

  error?: string;
}

export interface MevProfitInput {
  expectedRevenue: bigint;
  flashLoanRepayment?: bigint;
  dexFees?: bigint;
  gasCost?: bigint;
  slippageCost?: bigint;
  executionCost?: bigint;
}

export interface MevProfitResult {
  grossProfit: bigint;
  totalCosts: bigint;
  netProfit: bigint;
  profitable: boolean;
}

export interface BackrunSimulationResult {
  success: boolean;

  triggerTransactionHash: string;

  // Backrun execution data
  backrunDex?: MevDex;
  backrunTokenIn?: string;
  backrunTokenOut?: string;
  backrunAmountIn?: bigint;
  backrunExpectedAmountOut?: bigint;

  expectedProfit: bigint;
  gasCost: bigint;
  netProfit: bigint;

  profitable: boolean;

  error?: string;
}
