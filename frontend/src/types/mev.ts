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

// ======================================================
// Executor Operation 3
// ======================================================
//
// Represents the exact execution parameters required by
// the deployed Executor MEV backrun operation.
//
// IMPORTANT:
// This is execution-data modeling only.
// It does not execute a blockchain transaction.
// ======================================================

export interface Operation3ExecutionData {
  dex1: MevDex;
  dex2: MevDex;

  tokenIn: string;
  tokenOut: string;

  uniFee1: number;
  uniFee2: number;

  minOut1: bigint;
  minOut2: bigint;

  minProfit: bigint;
}

// ======================================================
// OPERATION 3 SIMULATION RESULT
// ======================================================
//
// Represents a fully simulated Operation 3 route.
//
// IMPORTANT:
// This is simulation data only.
// It does NOT execute a transaction.
// ======================================================

export interface Operation3SimulationResult {
  success: boolean;

  executionData?: Operation3ExecutionData;

  expectedProfit: bigint;
  gasCost: bigint;
  netProfit: bigint;

  profitable: boolean;

  error?: string;
}

// ======================================================
// OPERATION 3 SIMULATION REQUEST
// ======================================================
//
// Defines the complete input required by the future
// dedicated Operation 3 simulator.
//
// IMPORTANT:
// This is simulation input only.
// It does NOT execute a transaction.
// It does NOT submit calldata.
// It does NOT access a wallet.
// ======================================================

export interface Operation3SimulationRequest {
  executionData: Operation3ExecutionData;

  /**
   * Flash-loan asset.
   *
   * Must match executionData.tokenIn.
   */
  flashLoanAsset: string;

  /**
   * Flash-loan principal amount.
   */
  flashLoanAmount: bigint;

  /**
   * Flash-loan premium/fee used when calculating
   * the required repayment.
   */
  flashLoanPremium: bigint;
}

// ======================================================
// OPERATION 3 LEG SIMULATION RESULT
// ======================================================
//
// Represents the result of simulating one leg of an
// Operation 3 route.
//
// IMPORTANT:
// This contains simulation data only.
// It does NOT execute a swap.
// ======================================================

export interface Operation3LegSimulationResult {
  success: boolean;

  dex: MevDex;

  tokenIn: string;
  tokenOut: string;

  amountIn: bigint;
  expectedAmountOut: bigint;

  minAmountOut: bigint;

  amountOutValid: boolean;

  error?: string;
}

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

  // Operation 3 simulation result
  operation3SimulationResult?: Operation3SimulationResult;

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
