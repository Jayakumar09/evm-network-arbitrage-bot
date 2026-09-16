import {
  Contract,
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

import {
  simulateV3Swap,
  simulateV3SwapWithPool,
} from "./v3StateSimulator";

import {
  WETH_ADDRESS,
} from "../../config/contracts";

// ======================================================
// ERC20 TOKEN DECIMALS
// ======================================================
//
// Read-only token metadata lookup.
//
// Required by the Uniswap V3 SDK because Token objects
// require token decimal precision.
//
// IMPORTANT:
// - No transaction
// - No wallet
// - No signing
// - No blockchain state modification
// ======================================================

const ERC20_DECIMALS_ABI = [
  "function decimals() view returns (uint8)",
];

async function getTokenDecimals(
  provider: Provider,
  tokenAddress: string,
): Promise<number> {
  if (!tokenAddress) {
    throw new Error(
      "[OPERATION 3 SIMULATOR] Token address is required for decimals.",
    );
  }

  const token =
    new Contract(
      tokenAddress,
      ERC20_DECIMALS_ABI,
      provider,
    );

  const decimals =
    await token.decimals();

  const result =
    Number(decimals);

  if (
    !Number.isInteger(result) ||
    result < 0
  ) {
    throw new Error(
      "[OPERATION 3 SIMULATOR] Invalid token decimals.",
    );
  }

  return result;
}

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
//       â†“
//   simulateV2Swap()
//       â†“
//   expected amountOut
//       â†“
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
//       â†“
//     Leg 1
//       â†“
//    amountOut1
//       â†“
//     Leg 2
//       â†“
//    amountOut2
//       â†“
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
// Supported routes:
// - V2 -> V2
// - V2 -> V3
// - V3 -> V2
//
// V3 -> V3 remains intentionally deferred.
//
// IMPORTANT:
// - Read-only simulation only.
// - No transaction is sent.
// - No wallet signing.
// - No Executor write method is called.
// - No blockchain state is modified.
// ======================================================

export class Operation3Simulator {
  /**
   * Simulate an Operation 3 route.
   *
   * Stage 2.26.15+:
   * - V2 -> V2 simulation is supported.
   * - V2 -> V3 simulation is supported.
   * - V3 -> V2 simulation is supported.
   * - V3 -> V3 simulation remains intentionally deferred.
   *
   * READ-ONLY:
   * - No transaction is sent.
   * - No wallet signing.
   * - No blockchain state is changed.
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

      if (
        executionData.dex1 === "V3" &&
        executionData.uniFee1 === 0
      ) {
        throw new Error(
          "Operation 3 V3 leg 1 requires a non-zero fee.",
        );
      }

      if (
        executionData.dex2 === "V3" &&
        executionData.uniFee2 === 0
      ) {
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

      const { getProvider } =
        await import("../blockchain");

      const provider =
        await getProvider();

      // ==================================================
      // V2 -> V2
      //
      // Existing stateful V2 simulation.
      // ==================================================

      if (
        executionData.dex1 === "V2" &&
        executionData.dex2 === "V2"
      ) {
        const pairState =
          await getOperation3V2PairState(
            provider,
            executionData.tokenIn,
            executionData.tokenOut,
          );

        const leg1Simulation =
          simulateV2Swap(
            pairState,
            executionData.tokenIn,
            executionData.tokenOut,
            flashLoanAmount,
          );

        const leg1 =
          validateOperation3LegOutput(
            "V2",
            executionData.tokenIn,
            executionData.tokenOut,
            leg1Simulation.amountIn,
            leg1Simulation.amountOut,
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
              "Operation 3 V2 leg 1 simulation failed.",
          };
        }

        const postLeg1PairState: V2PairState = {
          ...pairState,
          reserve0:
            leg1Simulation.newReserve0,
          reserve1:
            leg1Simulation.newReserve1,
        };

        const leg2Simulation =
          simulateV2Swap(
            postLeg1PairState,
            executionData.tokenOut,
            executionData.tokenIn,
            leg1Simulation.amountOut,
          );

        const leg2 =
          validateOperation3LegOutput(
            "V2",
            executionData.tokenOut,
            executionData.tokenIn,
            leg2Simulation.amountIn,
            leg2Simulation.amountOut,
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
              "Operation 3 V2 leg 2 simulation failed.",
          };
        }

        return simulateOperation3TwoLegs(
          request,
          leg1Simulation.amountOut,
          leg2Simulation.amountOut,
        );
      }

      // ==================================================
      // V2 -> V3
      //
      // V2 leg 1:
      // tokenIn -> tokenOut
      //
      // V3 leg 2:
      // tokenOut -> tokenIn
      // ==================================================

      if (
        executionData.dex1 === "V2" &&
        executionData.dex2 === "V3"
      ) {
        const pairState =
          await getOperation3V2PairState(
            provider,
            executionData.tokenIn,
            executionData.tokenOut,
          );

        const leg1Simulation =
          simulateV2Swap(
            pairState,
            executionData.tokenIn,
            executionData.tokenOut,
            flashLoanAmount,
          );

        const leg1 =
          validateOperation3LegOutput(
            "V2",
            executionData.tokenIn,
            executionData.tokenOut,
            leg1Simulation.amountIn,
            leg1Simulation.amountOut,
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
              "Operation 3 V2 leg 1 simulation failed.",
          };
        }

        const tokenInDecimals =
          await getTokenDecimals(
            provider,
            executionData.tokenIn,
          );

        const tokenOutDecimals =
          await getTokenDecimals(
            provider,
            executionData.tokenOut,
          );

        const leg2Simulation =
          await simulateV3Swap(
            provider,
            executionData.tokenOut,
            executionData.tokenIn,
            tokenOutDecimals,
            tokenInDecimals,
            leg1Simulation.amountOut,
            executionData.uniFee2,
          );

        const leg2 =
          validateOperation3LegOutput(
            "V3",
            executionData.tokenOut,
            executionData.tokenIn,
            leg1Simulation.amountOut,
            leg2Simulation.amountOut,
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
              "Operation 3 V3 leg 2 simulation failed.",
          };
        }

        return simulateOperation3TwoLegs(
          request,
          leg1Simulation.amountOut,
          leg2Simulation.amountOut,
        );
      }

      // ==================================================
      // V3 -> V2
      //
      // V3 leg 1:
      // tokenIn -> tokenOut
      //
      // V2 leg 2:
      // tokenOut -> tokenIn
      //
      // The two legs use different pools, so the V3
      // simulation does not modify the V2 pair state.
      // ==================================================

      if (
        executionData.dex1 === "V3" &&
        executionData.dex2 === "V2"
      ) {
        const tokenInDecimals =
          await getTokenDecimals(
            provider,
            executionData.tokenIn,
          );

        const tokenOutDecimals =
          await getTokenDecimals(
            provider,
            executionData.tokenOut,
          );

        const leg1Simulation =
          await simulateV3Swap(
            provider,
            executionData.tokenIn,
            executionData.tokenOut,
            tokenInDecimals,
            tokenOutDecimals,
            flashLoanAmount,
            executionData.uniFee1,
          );

        const leg1 =
          validateOperation3LegOutput(
            "V3",
            executionData.tokenIn,
            executionData.tokenOut,
            flashLoanAmount,
            leg1Simulation.amountOut,
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
              "Operation 3 V3 leg 1 simulation failed.",
          };
        }

        const pairState =
          await getOperation3V2PairState(
            provider,
            executionData.tokenOut,
            executionData.tokenIn,
          );

        const leg2Simulation =
          simulateV2Swap(
            pairState,
            executionData.tokenOut,
            executionData.tokenIn,
            leg1Simulation.amountOut,
          );

        const leg2 =
          validateOperation3LegOutput(
            "V2",
            executionData.tokenOut,
            executionData.tokenIn,
            leg2Simulation.amountIn,
            leg2Simulation.amountOut,
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
              "Operation 3 V2 leg 2 simulation failed.",
          };
        }

        return simulateOperation3TwoLegs(
          request,
          leg1Simulation.amountOut,
          leg2Simulation.amountOut,
        );
      }

      // ==================================================
      // V3 -> V3
      //
      // V3 leg 1:
      // tokenIn -> tokenOut
      //
      // V3 leg 2:
      // tokenOut -> tokenIn
      //
      // IMPORTANT:
      // - If both legs use the same fee tier, both legs use
      //   the same V3 pool. Leg 2 MUST start from the
      //   post-leg-1 Pool returned by the SDK.
      //
      // - If the fee tiers differ, the legs use different
      //   V3 pools. Leg 2 can therefore start from its
      //   current on-chain state.
      //
      // No transaction is sent.
      // ==================================================

      if (
        executionData.dex1 === "V3" &&
        executionData.dex2 === "V3"
      ) {
        const tokenInDecimals =
          await getTokenDecimals(
            provider,
            executionData.tokenIn,
          );

        const tokenOutDecimals =
          await getTokenDecimals(
            provider,
            executionData.tokenOut,
          );

        // ================================================
        // LEG 1 - V3
        //
        // tokenIn -> tokenOut
        // ================================================

        const leg1Simulation =
          await simulateV3Swap(
            provider,
            executionData.tokenIn,
            executionData.tokenOut,
            tokenInDecimals,
            tokenOutDecimals,
            flashLoanAmount,
            executionData.uniFee1,
          );

        const leg1 =
          validateOperation3LegOutput(
            "V3",
            executionData.tokenIn,
            executionData.tokenOut,
            flashLoanAmount,
            leg1Simulation.amountOut,
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
              "Operation 3 V3 leg 1 simulation failed.",
          };
        }

        // ================================================
        // LEG 2 - V3
        //
        // tokenOut -> tokenIn
        // ================================================

        let leg2Simulation;

        if (
          executionData.uniFee1 ===
          executionData.uniFee2
        ) {
          // Same token pair + same fee tier means the
          // factory resolves to the same V3 pool.
          //
          // Reuse the post-leg-1 SDK Pool so the second
          // swap starts from the simulated post-trade state.
          leg2Simulation =
            await simulateV3SwapWithPool(
              leg1Simulation.updatedPool,
              leg1Simulation.poolAddress,
              executionData.tokenOut,
              executionData.tokenIn,
              leg1Simulation.amountOut,
            );
        } else {
          // Different fee tiers mean different V3 pools.
          // Build leg 2 from its current on-chain state.
          leg2Simulation =
            await simulateV3Swap(
              provider,
              executionData.tokenOut,
              executionData.tokenIn,
              tokenOutDecimals,
              tokenInDecimals,
              leg1Simulation.amountOut,
              executionData.uniFee2,
            );
        }

        const leg2 =
          validateOperation3LegOutput(
            "V3",
            executionData.tokenOut,
            executionData.tokenIn,
            leg1Simulation.amountOut,
            leg2Simulation.amountOut,
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
              "Operation 3 V3 leg 2 simulation failed.",
          };
        }

        return simulateOperation3TwoLegs(
          request,
          leg1Simulation.amountOut,
          leg2Simulation.amountOut,
        );
      }

      throw new Error(
        "Operation 3 route simulation is not implemented.",
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

if (import.meta.env.DEV) {
  (window as any).testOperation3V2V2Simulation =
    async () => {
      console.log(
        "[OPERATION 3 V2->V2 TEST] Starting",
      );

      const tokenIn =
        "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

      const tokenOut =
        "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";

      const flashLoanAmount =
        1000000n;

      const flashLoanPremium =
        0n;

      const executionData = {
        dex1: "V2" as const,
        dex2: "V2" as const,
        tokenIn,
        tokenOut,
        uniFee1: 0,
        uniFee2: 0,
        minOut1: 1n,
        minOut2: 1n,
        minProfit: 0n,
      };

      const simulator =
        new Operation3Simulator();

      const result =
        await simulator.simulate({
          executionData,
          flashLoanAsset: tokenIn,
          flashLoanAmount,
          flashLoanPremium,
        });

      console.log(
        "[OPERATION 3 V2->V2 TEST] Result:",
        {
          ...result,
          expectedProfit:
            result.expectedProfit.toString(),
          gasCost:
            result.gasCost.toString(),
          netProfit:
            result.netProfit.toString(),
        },
      );

      if (!result.success) {
        throw new Error(
          result.error ??
          "Operation 3 V2->V2 simulation failed.",
        );
      }

      if (!result.executionData) {
        throw new Error(
          "Operation 3 simulation did not return execution data.",
        );
      }

      console.log(
        "[OPERATION 3 V2->V2 TEST] PASS",
      );

      return result;
    };
}

// ======================================================
// DEV: OPERATION 3 V2 -> V3 RUNTIME TEST
// ======================================================

if (import.meta.env.DEV) {
  (window as any).testOperation3V2V3Simulation =
    async () => {
      console.log(
        "[OPERATION 3 V2->V3 TEST] Starting",
      );

      const tokenIn =
        "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

      const tokenOut =
        WETH_ADDRESS;

      const flashLoanAmount =
        1000000n;

      const flashLoanPremium =
        0n;

      const executionData = {
        dex1: "V2" as const,
        dex2: "V3" as const,

        tokenIn,
        tokenOut,

        uniFee1: 0,
        uniFee2: 3000,

        minOut1: 1n,
        minOut2: 1n,

        minProfit: 0n,
      };

      const simulator =
        new Operation3Simulator();

      const result =
        await simulator.simulate({
          executionData,

          flashLoanAsset:
            tokenIn,

          flashLoanAmount,

          flashLoanPremium,
        });

      console.log(
        "[OPERATION 3 V2->V3 TEST] Result:",
        {
          ...result,

          expectedProfit:
            result.expectedProfit.toString(),

          gasCost:
            result.gasCost.toString(),

          netProfit:
            result.netProfit.toString(),
        },
      );

      if (!result.success) {
        throw new Error(
          result.error ??
          "Operation 3 V2->V3 simulation failed.",
        );
      }

      if (!result.executionData) {
        throw new Error(
          "Operation 3 V2->V3 simulation did not return execution data.",
        );
      }

      if (
        result.executionData.dex1 !== "V2" ||
        result.executionData.dex2 !== "V3"
      ) {
        throw new Error(
          "Operation 3 V2->V3 execution data route is incorrect.",
        );
      }

      if (
        result.executionData.uniFee2 !== 3000
      ) {
        throw new Error(
          "Operation 3 V2->V3 V3 fee is incorrect.",
        );
      }

      console.log(
        "[OPERATION 3 V2->V3 TEST] PASS",
      );

      return result;
    };
}

// ======================================================
// DEV: OPERATION 3 V3 -> V2 RUNTIME TEST
// ======================================================

if (import.meta.env.DEV) {
  (window as any).testOperation3V3V2Simulation =
    async () => {
      console.log(
        "[OPERATION 3 V3->V2 TEST] Starting",
      );

      const tokenIn =
        "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

      const tokenOut =
        WETH_ADDRESS;

      const flashLoanAmount =
        1000000n;

      const flashLoanPremium =
        0n;

      const executionData = {
        dex1: "V3" as const,
        dex2: "V2" as const,

        tokenIn,
        tokenOut,

        uniFee1: 3000,
        uniFee2: 0,

        minOut1: 1n,
        minOut2: 1n,

        minProfit: 0n,
      };

      const simulator =
        new Operation3Simulator();

      const result =
        await simulator.simulate({
          executionData,

          flashLoanAsset:
            tokenIn,

          flashLoanAmount,

          flashLoanPremium,
        });

      console.log(
        "[OPERATION 3 V3->V2 TEST] Result:",
        {
          ...result,

          expectedProfit:
            result.expectedProfit.toString(),

          gasCost:
            result.gasCost.toString(),

          netProfit:
            result.netProfit.toString(),
        },
      );

      if (!result.success) {
        throw new Error(
          result.error ??
          "Operation 3 V3->V2 simulation failed.",
        );
      }

      if (!result.executionData) {
        throw new Error(
          "Operation 3 V3->V2 simulation did not return execution data.",
        );
      }

      if (
        result.executionData.dex1 !== "V3" ||
        result.executionData.dex2 !== "V2"
      ) {
        throw new Error(
          "Operation 3 V3->V2 execution data route is incorrect.",
        );
      }

      if (
        result.executionData.uniFee1 !== 3000
      ) {
        throw new Error(
          "Operation 3 V3->V2 V3 fee is incorrect.",
        );
      }

      console.log(
        "[OPERATION 3 V3->V2 TEST] PASS",
      );

      return result;
    };
}


// ======================================================
// DEV: OPERATION 3 V3 -> V3 RUNTIME TEST
// ======================================================
//
// Uses the same Sepolia V3 pool for both legs.
//
// This specifically verifies that the second V3 leg
// reuses the post-first-leg Pool state.
// ======================================================

if (import.meta.env.DEV) {
  (window as any).testOperation3V3V3Simulation =
    async () => {
      console.log(
        "[OPERATION 3 V3->V3 TEST] Starting",
      );

      const tokenIn =
        "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

      const tokenOut =
        WETH_ADDRESS;

      const flashLoanAmount =
        1000000n;

      const flashLoanPremium =
        0n;

      const executionData = {
        dex1: "V3" as const,
        dex2: "V3" as const,

        tokenIn,
        tokenOut,

        uniFee1: 3000,
        uniFee2: 3000,

        minOut1: 1n,
        minOut2: 1n,

        minProfit: 0n,
      };

      const simulator =
        new Operation3Simulator();

      const result =
        await simulator.simulate({
          executionData,

          flashLoanAsset:
            tokenIn,

          flashLoanAmount,

          flashLoanPremium,
        });

      console.log(
        "[OPERATION 3 V3->V3 TEST] Result:",
        {
          ...result,

          expectedProfit:
            result.expectedProfit.toString(),

          gasCost:
            result.gasCost.toString(),

          netProfit:
            result.netProfit.toString(),
        },
      );

      if (!result.success) {
        throw new Error(
          result.error ??
          "Operation 3 V3->V3 simulation failed.",
        );
      }

      if (!result.executionData) {
        throw new Error(
          "Operation 3 V3->V3 simulation did not return execution data.",
        );
      }

      if (
        result.executionData.dex1 !== "V3" ||
        result.executionData.dex2 !== "V3"
      ) {
        throw new Error(
          "Operation 3 V3->V3 execution data route is incorrect.",
        );
      }

      if (
        result.executionData.uniFee1 !== 3000 ||
        result.executionData.uniFee2 !== 3000
      ) {
        throw new Error(
          "Operation 3 V3->V3 fee configuration is incorrect.",
        );
      }

      console.log(
        "[OPERATION 3 V3->V3 TEST] PASS",
      );

      return result;
    };
}