import type {
  BackrunCandidate,
  BackrunSimulationResult,
  PaperExecutionPlan,
  PaperExecutionResult,
} from "../../types/mev";

import {
  paperExecutionStore,
} from "./paperExecutionStore";

// ======================================================
// PAPER EXECUTION SERVICE
// ======================================================
//
// Phase 2 MEV development only.
//
// IMPORTANT:
//
// This service NEVER:
// - connects a wallet
// - requests a signature
// - sends a transaction
// - calls a write contract method
// - modifies blockchain state
//
// It only creates deterministic hypothetical
// execution plans from completed simulations.
//
// Successful plans are stored in the shared
// PaperExecutionStore for the current browser session.
// ======================================================

export class PaperExecutionService {
  // ====================================================
  // CREATE PAPER EXECUTION PLAN
  // ====================================================

  createPlan(
    candidate: BackrunCandidate,
    simulation: BackrunSimulationResult,
  ): PaperExecutionResult {
    try {
      if (!candidate.triggerTransactionHash) {
        throw new Error(
          "Paper execution requires a trigger transaction hash.",
        );
      }

      if (!candidate.tokenIn || !candidate.tokenOut) {
        throw new Error(
          "Paper execution requires tokenIn and tokenOut.",
        );
      }

      if (
        candidate.amountIn === undefined ||
        candidate.amountIn <= 0n
      ) {
        throw new Error(
          "Paper execution requires a valid amountIn.",
        );
      }

      if (
        candidate.expectedAmountOut === undefined ||
        candidate.expectedAmountOut <= 0n
      ) {
        throw new Error(
          "Paper execution requires a valid expectedAmountOut.",
        );
      }

      if (!simulation.success) {
        throw new Error(
          simulation.error ??
            "Backrun simulation was not successful.",
        );
      }

      if (
        !simulation.profitable ||
        simulation.netProfit <= 0n
      ) {
        throw new Error(
          "Paper execution rejected: simulated net profit is not positive.",
        );
      }

      if (
        simulation.triggerTransactionHash !==
        candidate.triggerTransactionHash
      ) {
        throw new Error(
          "Simulation trigger transaction does not match candidate.",
        );
      }

      const paperExecutionId =
        `PAPER-${Date.now()}-${candidate.blockNumber}`;

      const plan: PaperExecutionPlan = {
        paperExecutionId,
        triggerTransactionHash:
          candidate.triggerTransactionHash,
        blockNumber:
          candidate.blockNumber,
        tokenIn:
          candidate.tokenIn,
        tokenOut:
          candidate.tokenOut,
        amountIn:
          candidate.amountIn,
        expectedAmountOut:
          candidate.expectedAmountOut,
        expectedProfit:
          simulation.expectedProfit,
        gasCost:
          simulation.gasCost,
        netProfit:
          simulation.netProfit,
        profitable:
          simulation.profitable,
        createdAt:
          Date.now(),
        paperOnly:
          true,
        state:
         "PAPER_ACCEPTED",
      };

      // ==================================================
      // Store successful paper execution
      // ==================================================

      paperExecutionStore.add(
        plan,
      );

      console.log(
        "[MEV PAPER EXECUTION] " +
          "Paper execution plan created:",
        plan,
      );

      return {
        success: true,
        plan,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown paper execution error.",
      };
    }
  }

  // ====================================================
  // GET ALL PAPER EXECUTION PLANS
  // ====================================================

  getAll(): PaperExecutionPlan[] {
    return paperExecutionStore.getAll();
  }

  // ====================================================
  // GET LATEST PAPER EXECUTION PLAN
  // ====================================================

  getLatest():
    PaperExecutionPlan | null {
    return paperExecutionStore.getLatest();
  }

  // ====================================================
  // GET PAPER EXECUTION COUNT
  // ====================================================

  getCount(): number {
    return paperExecutionStore.getCount();
  }

  // ====================================================
  // CLEAR PAPER EXECUTION HISTORY
  // ====================================================

  clearHistory(): void {
    paperExecutionStore.clear();
  }
}