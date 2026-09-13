import {
  getV2Quote,
} from "../blockchain";

import type {
  BackrunCandidate,
} from "../../types/mev";

export interface MevV2QuoteResult {
  success: boolean;

  tokenIn: string;
  tokenOut: string;

  amountIn: bigint;
  expectedAmountOut: bigint;

  error?: string;
}

export interface MevV2RevalidationResult {
  success: boolean;

  triggerTransactionHash: string;

  originalExpectedAmountOut: bigint;
  currentExpectedAmountOut: bigint;

  changed: boolean;

  error?: string;
}


/**
 * Get a read-only V2 quote for a decoded MEV candidate.
 *
 * IMPORTANT:
 * - No transaction is sent.
 * - No wallet signing is required.
 * - This uses the existing blockchain.ts V2 quote
 *   implementation.
 */
export async function quoteMevV2Candidate(
  candidate: BackrunCandidate,
): Promise<MevV2QuoteResult> {
  try {
    if (!candidate.tokenIn) {
      throw new Error(
        "V2 MEV quote requires tokenIn.",
      );
    }

    if (!candidate.tokenOut) {
      throw new Error(
        "V2 MEV quote requires tokenOut.",
      );
    }

    if (
      candidate.amountIn === undefined ||
      candidate.amountIn <= 0n
    ) {
      throw new Error(
        "V2 MEV quote requires amountIn greater than zero.",
      );
    }

    const expectedAmountOut =
      await getV2Quote(
        candidate.amountIn,
        [
          candidate.tokenIn,
          candidate.tokenOut,
        ],
      );

    return {
      success: true,

      tokenIn:
        candidate.tokenIn,

      tokenOut:
        candidate.tokenOut,

      amountIn:
        candidate.amountIn,

      expectedAmountOut,
    };
  } catch (error) {
    return {
      success: false,

      tokenIn:
        candidate.tokenIn ?? "",

      tokenOut:
        candidate.tokenOut ?? "",

      amountIn:
        candidate.amountIn ?? 0n,

      expectedAmountOut:
        0n,

      error:
        error instanceof Error
          ? error.message
          : "Unknown V2 quote error",
    };
  }
}

/**
 * Revalidate a V2 MEV candidate against the
 * current V2 router quote.
 *
 * IMPORTANT:
 * - This does NOT replay the trigger transaction.
 * - This does NOT run BackrunSimulator.
 * - This does NOT send a transaction.
 * - This does NOT modify blockchain state.
 *
 * The purpose is only to determine whether the
 * same candidate route and amount can still obtain
 * a valid current V2 quote.
 */
export async function revalidateMevV2Candidate(
  candidate: BackrunCandidate,
): Promise<MevV2RevalidationResult> {
  try {
    if (!candidate.triggerTransactionHash) {
      throw new Error(
        "Trigger transaction hash is required.",
      );
    }

    if (!candidate.tokenIn) {
      throw new Error(
        "V2 revalidation requires tokenIn.",
      );
    }

    if (!candidate.tokenOut) {
      throw new Error(
        "V2 revalidation requires tokenOut.",
      );
    }

    if (
      candidate.amountIn === undefined ||
      candidate.amountIn <= 0n
    ) {
      throw new Error(
        "V2 revalidation requires amountIn greater than zero.",
      );
    }

    if (
      candidate.expectedAmountOut === undefined ||
      candidate.expectedAmountOut <= 0n
    ) {
      throw new Error(
        "V2 revalidation requires the original expectedAmountOut.",
      );
    }

    const quote =
      await quoteMevV2Candidate(
        candidate,
      );

    if (!quote.success) {
      throw new Error(
        quote.error ??
          "Current V2 quote failed during revalidation.",
      );
    }

    if (
      quote.expectedAmountOut <= 0n
    ) {
      throw new Error(
        "Current V2 quote returned zero.",
      );
    }

    const changed =
      quote.expectedAmountOut !==
      candidate.expectedAmountOut;

    return {
      success: true,

      triggerTransactionHash:
        candidate.triggerTransactionHash,

      originalExpectedAmountOut:
        candidate.expectedAmountOut,

      currentExpectedAmountOut:
        quote.expectedAmountOut,

      changed,
    };
  } catch (error) {
    return {
      success: false,

      triggerTransactionHash:
        candidate.triggerTransactionHash,

      originalExpectedAmountOut:
        candidate.expectedAmountOut ?? 0n,

      currentExpectedAmountOut:
        0n,

      changed: false,

      error:
        error instanceof Error
          ? error.message
          : "Unknown V2 revalidation error",
    };
  }
}

// ======================================================
// DEVELOPMENT TEST HOOK
// ======================================================

if (import.meta.env.DEV) {
  ;(window as any).testMevV2Quote =
    async (): Promise<void> => {
      console.log(
        "[MEV V2 QUOTE TEST] Starting",
      );

      // ==================================================
      // PART 1 — INPUT VALIDATION
      // ==================================================

      const missingTokenIn =
        await quoteMevV2Candidate({
          triggerTransactionHash:
            "0x" + "11".repeat(32),

          blockNumber:
            0,

          tokenOut:
            "0x2222222222222222222222222222222222222222",

          amountIn:
            1000000n,

          description:
            "Validation test",

          detectedAt:
            Date.now(),
        });

      if (
        missingTokenIn.success ||
        !missingTokenIn.error
      ) {
        console.error(
          "[MEV V2 QUOTE TEST] FAILED: " +
            "Missing tokenIn was accepted.",
        );

        return;
      }

      const missingTokenOut =
        await quoteMevV2Candidate({
          triggerTransactionHash:
            "0x" + "22".repeat(32),

          blockNumber:
            0,

          tokenIn:
            "0x1111111111111111111111111111111111111111",

          amountIn:
            1000000n,

          description:
            "Validation test",

          detectedAt:
            Date.now(),
        });

      if (
        missingTokenOut.success ||
        !missingTokenOut.error
      ) {
        console.error(
          "[MEV V2 QUOTE TEST] FAILED: " +
            "Missing tokenOut was accepted.",
        );

        return;
      }

      const zeroAmount =
        await quoteMevV2Candidate({
          triggerTransactionHash:
            "0x" + "33".repeat(32),

          blockNumber:
            0,

          tokenIn:
            "0x1111111111111111111111111111111111111111",

          tokenOut:
            "0x2222222222222222222222222222222222222222",

          amountIn:
            0n,

          description:
            "Validation test",

          detectedAt:
            Date.now(),
        });

      if (
        zeroAmount.success ||
        !zeroAmount.error
      ) {
        console.error(
          "[MEV V2 QUOTE TEST] FAILED: " +
            "Zero amount was accepted.",
        );

        return;
      }

      console.log(
        "[MEV V2 QUOTE TEST] " +
          "Input validation PASSED.",
      );

      // ==================================================
      // PART 2 — REAL SEPOLIA V2 QUOTE
      // ==================================================

      const usdc =
        "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

      const weth =
        "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";

      const amountIn =
        1000000n;

      const candidate:
        BackrunCandidate = {
        triggerTransactionHash:
          "0x" + "44".repeat(32),

        blockNumber:
          11625136,

        tokenIn:
          usdc,

        tokenOut:
          weth,

        amountIn,

        description:
          "Real Sepolia V2 quote test",

        detectedAt:
          Date.now(),
      };

      console.log(
        "[MEV V2 QUOTE TEST] " +
          "Running real Sepolia quote...",
      );

      console.log(
        "[MEV V2 QUOTE TEST] Token In:",
        usdc,
      );

      console.log(
        "[MEV V2 QUOTE TEST] Token Out:",
        weth,
      );

      console.log(
        "[MEV V2 QUOTE TEST] Amount In:",
        amountIn.toString(),
      );

      const result =
        await quoteMevV2Candidate(
          candidate,
        );

      console.log(
        "[MEV V2 QUOTE TEST] " +
          "Real quote result:",
        result,
      );

      if (!result.success) {
        console.error(
          "[MEV V2 QUOTE TEST] FAILED: " +
            result.error,
        );

        return;
      }

      if (
        result.expectedAmountOut <= 0n
      ) {
        console.error(
          "[MEV V2 QUOTE TEST] FAILED: " +
            "Expected amount out is zero.",
        );

        return;
      }

      console.log(
        "[MEV V2 QUOTE TEST] " +
          "Expected Amount Out:",
        result.expectedAmountOut.toString(),
      );

      // ==================================================
      // PART 3 — EXPECTED OUTPUT CHECK
      //
      // The pair was previously confirmed against Sepolia.
      // We require a positive result here rather than
      // hard-coding the exact quote because pool reserves
      // can change between calls.
      // ==================================================

      const expectedMinimum =
        1n;

      if (
        result.expectedAmountOut <
        expectedMinimum
      ) {
        console.error(
          "[MEV V2 QUOTE TEST] FAILED: " +
            "Quote output is invalid.",
        );

        return;
      }

      console.log(
        "[MEV V2 QUOTE TEST] " +
          "REAL SEPOLIA V2 QUOTE PASSED.",
      );

      console.log(
        "[MEV V2 QUOTE TEST] " +
          "Read-only quote path verified.",
      );

      console.log(
        "[MEV V2 QUOTE TEST] PASSED",
      );
    };
}