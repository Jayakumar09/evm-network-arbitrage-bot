import {
  type Provider,
} from "ethers";

import type {
  Operation3LegSimulationResult,
  Operation3SimulationRequest,
  Operation3SimulationResult,
} from "../../types/mev";

import {
  getV2PairState,
  type V2PairState,
} from "./v2PairState";

import {
  simulateV2Swap,
} from "./v2StateSimulator";

// ======================================================
// OPERATION 3 REPAYMENT REQUIREMENT
// ======================================================
//
// Calculates the minimum final tokenIn balance required
// for an Operation 3 flash-loan simulation.
//
// Formula:
//
// requiredBalance =
//   flashLoanAmount
//   + flashLoanPremium
//   + minProfit
//
// IMPORTANT:
// This is a pure mathematical calculation.
// It does NOT execute a transaction.
// It does NOT access the blockchain.
// ======================================================

export function simulateOperation3Repayment(
  request: Operation3SimulationRequest,
): bigint {
  return (
    request.flashLoanAmount +
    request.flashLoanPremium +
    request.executionData.minProfit
  );
}

// ======================================================
// OPERATION 3 LEG OUTPUT VALIDATION
// ======================================================
//
// Validates whether the simulated output of one Operation 3
// leg satisfies its configured minimum output.
//
// Formula:
//
// amountOutValid = expectedAmountOut >= minAmountOut
//
// IMPORTANT:
// This is pure simulation logic.
// It does NOT query a DEX.
// It does NOT access the blockchain.
// It does NOT execute a swap.
// ======================================================

export function validateOperation3LegOutput(
  dex: "V2" | "V3",
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  expectedAmountOut: bigint,
  minAmountOut: bigint,
): Operation3LegSimulationResult {
  const amountOutValid =
    expectedAmountOut >= minAmountOut;

  return {
    success: amountOutValid,

    dex,

    tokenIn,
    tokenOut,

    amountIn,
    expectedAmountOut,

    minAmountOut,

    amountOutValid,

    ...(amountOutValid
      ? {}
      : {
          error:
            "Simulated output is below the minimum output.",
        }),
  };
}

// ======================================================
// OPERATION 3 V2 PAIR-STATE BRIDGE
// ======================================================
//
// Retrieves the existing V2 pair state used by the
// Operation 3 simulator.
//
// IMPORTANT:
// - Read-only blockchain access only.
// - Reuses the existing V2 pair-state implementation.
// - Does NOT send a transaction.
// - Does NOT execute a swap.
// ======================================================

export async function getOperation3V2PairState(
  provider: Provider,
  tokenIn: string,
  tokenOut: string,
) {
  return getV2PairState(
    provider,
    tokenIn,
    tokenOut,
  );
}

// ======================================================
// OPERATION 3 STATEFUL V2 LEG SIMULATION
// ======================================================
//
// Reuses the existing V2 state simulator.
//
// Flow:
//   V2PairState
//       ↓
//   simulateV2Swap()
//       ↓
//   expected amountOut
//       ↓
//   Operation 3 minOut validation
//
// IMPORTANT:
// - Read-only simulation.
// - No transaction.
// - No wallet signing.
// - No blockchain state change.
// - Reuses existing V2 simulation logic.
// ======================================================

export function simulateOperation3V2StatefulLeg(
  pairState: V2PairState,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  minAmountOut: bigint,
): Operation3LegSimulationResult {
  const simulation =
    simulateV2Swap(
      pairState,
      tokenIn,
      tokenOut,
      amountIn,
    );

  return validateOperation3LegOutput(
    "V2",
    tokenIn,
    tokenOut,
    simulation.amountIn,
    simulation.amountOut,
    minAmountOut,
  );
}

// ======================================================
// OPERATION 3 V2 LEG SIMULATION
// ======================================================
//
// Simulates one V2 leg using the supplied pair state.
//
// This is read-only.
// No wallet transaction is created.
// ======================================================

export function simulateOperation3V2Leg(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
): bigint {
  if (reserveIn <= 0n) {
    throw new Error(
      "[OPERATION 3 SIMULATOR] V2 reserveIn must be greater than zero",
    );
  }

  if (reserveOut <= 0n) {
    throw new Error(
      "[OPERATION 3 SIMULATOR] V2 reserveOut must be greater than zero",
    );
  }

  if (amountIn <= 0n) {
    throw new Error(
      "[OPERATION 3 SIMULATOR] V2 amountIn must be greater than zero",
    );
  }

  const amountInWithFee = amountIn * 997n;

  const numerator =
    amountInWithFee * reserveOut;

  const denominator =
    reserveIn * 1000n + amountInWithFee;

  if (denominator <= 0n) {
    throw new Error(
      "[OPERATION 3 SIMULATOR] V2 simulation denominator must be greater than zero",
    );
  }

  const amountOut =
    numerator / denominator;

  if (amountOut <= 0n) {
    throw new Error(
      "[OPERATION 3 SIMULATOR] V2 simulated output must be greater than zero",
    );
  }

  if (amountOut >= reserveOut) {
    throw new Error(
      "[OPERATION 3 SIMULATOR] V2 simulated output exceeds available reserve",
    );
  }

  return amountOut;
}

// ======================================================
// OPERATION 3 TWO-LEG SIMULATION
// ======================================================
//
// Composes two already-simulated swap outputs into an
// Operation 3 route result.
//
// Route:
//
// flashLoanAmount
//       ↓
//     Leg 1
//       ↓
//    amountOut1
//       ↓
//     Leg 2
//       ↓
//    amountOut2
//       ↓
// final tokenIn balance
//
// IMPORTANT:
// The caller supplies simulated outputs.
// This function does NOT query a DEX.
// It does NOT access the blockchain.
// It does NOT execute a swap.
// ======================================================

export function simulateOperation3TwoLegs(
  request: Operation3SimulationRequest,
  amountOut1: bigint,
  amountOut2: bigint,
): Operation3SimulationResult {
  const {
    executionData,
    flashLoanAmount,
    flashLoanPremium,
  } = request;

  const leg1 = validateOperation3LegOutput(
    executionData.dex1,
    executionData.tokenIn,
    executionData.tokenOut,
    flashLoanAmount,
    amountOut1,
    executionData.minOut1,
  );

  if (!leg1.success) {
    return {
      success: false,
      executionData,
      expectedProfit: 0n,
      gasCost: 0n,
      netProfit: 0n,
      profitable: false,
      error:
        leg1.error ??
        "Operation 3 leg 1 output validation failed.",
    };
  }

  const leg2 = validateOperation3LegOutput(
    executionData.dex2,
    executionData.tokenOut,
    executionData.tokenIn,
    amountOut1,
    amountOut2,
    executionData.minOut2,
  );

  if (!leg2.success) {
    return {
      success: false,
      executionData,
      expectedProfit: 0n,
      gasCost: 0n,
      netProfit: 0n,
      profitable: false,
      error:
        leg2.error ??
        "Operation 3 leg 2 output validation failed.",
    };
  }

  const requiredBalance =
    simulateOperation3Repayment(request);

  const expectedProfit =
    amountOut2 -
    flashLoanAmount -
    flashLoanPremium;

  const profitable =
    amountOut2 >= requiredBalance;

  return {
    success: true,
    executionData,

    expectedProfit,

    // Gas is intentionally zero here because this stage
    // does not perform gas estimation.
    gasCost: 0n,

    netProfit: expectedProfit,

    profitable,
  };
}

// ======================================================
// OPERATION 3 SIMULATOR
// ======================================================
//
// Dedicated simulation boundary for Executor Operation 3.
//
// IMPORTANT:
// This stage only validates the Operation 3 request.
// Actual V3/V2 pool-state simulation will be added later.
//
// This simulator:
// - does NOT send transactions
// - does NOT call Executor write methods
// - does NOT access a wallet
// - does NOT modify blockchain state
// - does NOT replace BackrunSimulator
// ======================================================

export class Operation3Simulator {
  /**
   * Validate an Operation 3 simulation request.
   *
   * Actual route simulation is intentionally not implemented
   * at this stage.
   */
  async simulate(
    request: Operation3SimulationRequest,
  ): Promise<Operation3SimulationResult> {
    try {
      if (!request.executionData) {
        throw new Error(
          "Operation 3 simulation requires execution data.",
        );
      }

      const {
        executionData,
        flashLoanAsset,
        flashLoanAmount,
        flashLoanPremium,
      } = request;

      if (!flashLoanAsset) {
        throw new Error(
          "Operation 3 simulation requires a flash-loan asset.",
        );
      }

      if (
        flashLoanAsset.toLowerCase() !==
        executionData.tokenIn.toLowerCase()
      ) {
        throw new Error(
          "Operation 3 flash-loan asset must match executionData.tokenIn.",
        );
      }

      if (flashLoanAmount <= 0n) {
        throw new Error(
          "Operation 3 flash-loan amount must be greater than zero.",
        );
      }

      if (flashLoanPremium < 0n) {
        throw new Error(
          "Operation 3 flash-loan premium cannot be negative.",
        );
      }

      if (
        executionData.dex1 !== "V2" &&
        executionData.dex1 !== "V3"
      ) {
        throw new Error(
          "Operation 3 dex1 is invalid.",
        );
      }

      if (
        executionData.dex2 !== "V2" &&
        executionData.dex2 !== "V3"
      ) {
        throw new Error(
          "Operation 3 dex2 is invalid.",
        );
      }

      if (!executionData.tokenIn) {
        throw new Error(
          "Operation 3 tokenIn is required.",
        );
      }

      if (!executionData.tokenOut) {
        throw new Error(
          "Operation 3 tokenOut is required.",
        );
      }

      if (
        executionData.tokenIn.toLowerCase() ===
        executionData.tokenOut.toLowerCase()
      ) {
        throw new Error(
          "Operation 3 tokenIn and tokenOut must differ.",
        );
      }

      if (executionData.uniFee1 < 0) {
        throw new Error(
          "Operation 3 uniFee1 cannot be negative.",
        );
      }

      if (executionData.uniFee2 < 0) {
        throw new Error(
          "Operation 3 uniFee2 cannot be negative.",
        );
      }

      if (executionData.dex1 === "V3" &&
          executionData.uniFee1 === 0) {
        throw new Error(
          "Operation 3 V3 leg 1 requires a non-zero fee.",
        );
      }

      if (executionData.dex2 === "V3" &&
          executionData.uniFee2 === 0) {
        throw new Error(
          "Operation 3 V3 leg 2 requires a non-zero fee.",
        );
      }

      if (executionData.minOut1 <= 0n) {
        throw new Error(
          "Operation 3 minOut1 must be greater than zero.",
        );
      }

      if (executionData.minOut2 <= 0n) {
        throw new Error(
          "Operation 3 minOut2 must be greater than zero.",
        );
      }

      if (executionData.minProfit < 0n) {
        throw new Error(
          "Operation 3 minProfit cannot be negative.",
        );
      }

      // ==================================================
      // SIMULATION IMPLEMENTATION PENDING
      // ==================================================
      //
      // The actual V3/V2 route-state simulation will be
      // introduced in a later stage.
      //
      // Do NOT return a successful simulation here because
      // validation alone does not prove profitability.
      // ==================================================

      throw new Error(
        "Operation 3 route simulation is not implemented yet.",
      );
    } catch (error) {
      return {
        success: false,
        expectedProfit: 0n,
        gasCost: 0n,
        netProfit: 0n,
        profitable: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown Operation 3 simulation error.",
      };
    }
  }
}