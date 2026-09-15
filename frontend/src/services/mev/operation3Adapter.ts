import { encodeMevBackrunParams } from "../blockchain";
import type {
  MevDex,
  Operation3ExecutionData,
} from "../../types/mev";

// ======================================================
// Executor Operation 3 Adapter
// ======================================================
//
// Converts frontend MEV execution data into the numeric
// DEX selectors required by the deployed Executor.
//
// Frontend:
//   V3 = "V3"
//   V2 = "V2"
//
// Solidity:
//   0 = Uniswap V3
//   1 = SushiSwap / V2-compatible DEX
//
// IMPORTANT:
// This function ONLY prepares calldata.
// It does NOT execute a transaction.
// ======================================================

function encodeDexSelector(dex: MevDex): number {
  if (dex === "V3") {
    return 0;
  }

  if (dex === "V2") {
    return 1;
  }

  throw new Error(
    `[OPERATION 3 ADAPTER] Unsupported DEX: ${dex}`,
  );
}

// ======================================================
// Create Operation 3 Execution Data
// ======================================================
//
// Builds the explicit execution-data model required by
// Executor Operation 3.
//
// IMPORTANT:
// This function ONLY constructs frontend data.
// It does NOT encode calldata.
// It does NOT access RPC/wallet.
// It does NOT execute a transaction.
// ======================================================

export function createOperation3ExecutionData(
  dex1: MevDex,
  dex2: MevDex,
  tokenIn: string,
  tokenOut: string,
  uniFee1: number,
  uniFee2: number,
  minOut1: bigint,
  minOut2: bigint,
  minProfit: bigint,
): Operation3ExecutionData {
  return {
    dex1,
    dex2,
    tokenIn,
    tokenOut,
    uniFee1,
    uniFee2,
    minOut1,
    minOut2,
    minProfit,
  };
}

// ======================================================
// Encode Operation 3 Execution Data
// ======================================================

export function encodeOperation3ExecutionData(
  executionData: Operation3ExecutionData,
): string {
  const dex1 = encodeDexSelector(executionData.dex1);
  const dex2 = encodeDexSelector(executionData.dex2);

  return encodeMevBackrunParams(
    dex1,
    dex2,
    executionData.tokenIn,
    executionData.tokenOut,
    executionData.uniFee1,
    executionData.uniFee2,
    executionData.minOut1,
    executionData.minOut2,
    executionData.minProfit,
  );
}