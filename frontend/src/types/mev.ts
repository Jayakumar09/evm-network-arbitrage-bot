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

export interface BackrunCandidate {
  triggerTransactionHash: string;
  blockNumber: number;

  tokenIn?: string;
  tokenOut?: string;

  amountIn?: bigint;
  expectedAmountOut?: bigint;

  description: string;

  detectedAt: number;
}

export interface BackrunSimulationResult {
  success: boolean;

  triggerTransactionHash: string;

  expectedProfit: bigint;
  gasCost: bigint;
  netProfit: bigint;

  profitable: boolean;

  error?: string;
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