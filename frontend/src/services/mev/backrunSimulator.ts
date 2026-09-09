import type { Provider } from "ethers";

import type {
  BackrunCandidate,
  BackrunSimulationResult,
} from "../../types/mev";

import {
  getV2PairState,
} from "./v2PairState";

import {
  simulateV2Swap,
} from "./v2StateSimulator";

import {
  MevProfitCalculator,
} from "./mevProfitCalculator";

import {
  MevGasEstimator,
} from "./mevGasEstimator";

export interface BackrunSimulatorConfig {
  /**
   * Minimum net profit required for the
   * candidate to be considered profitable.
   */
  minimumProfit?: bigint;

  /**
   * Estimated gas units for the future backrun.
   *
   * This is an estimate only until an executable
   * backrun transaction is available for
   * eth_estimateGas.
   */
  estimatedGasUnits?: bigint;

  /**
   * Token used for profitability calculations.
   *
   * Current Phase 2 MEV pipeline uses Sepolia USDC.
   */
  profitToken?: string;

  /**
   * Wrapped native token used to convert the
   * native gas cost into the profit token.
   *
   * Current Phase 2 MEV pipeline uses Sepolia WETH.
   */
  wrappedNativeToken?: string;
}

const DEFAULT_PROFIT_TOKEN =
  "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

const DEFAULT_WRAPPED_NATIVE_TOKEN =
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";

export class BackrunSimulator {
  private provider: Provider;

  private calculator:
    MevProfitCalculator;

  private gasEstimator:
    MevGasEstimator;

  private config:
    BackrunSimulatorConfig;

  constructor(
    provider: Provider,
    config: BackrunSimulatorConfig = {},
  ) {
    this.provider = provider;

    this.calculator =
      new MevProfitCalculator();

    this.config = {
      minimumProfit: 0n,

      estimatedGasUnits:
        300000n,

      profitToken:
        DEFAULT_PROFIT_TOKEN,

      wrappedNativeToken:
        DEFAULT_WRAPPED_NATIVE_TOKEN,

      ...config,
    };

    this.gasEstimator =
      new MevGasEstimator(
        this.provider,
        {
          estimatedGasUnits:
            this.config.estimatedGasUnits,

          profitToken:
            this.config.profitToken!,

          wrappedNativeToken:
            this.config.wrappedNativeToken!,
        },
      );
  }

  /**
   * Simulate a V2 backrun candidate.
   *
   * READ-ONLY ONLY.
   *
   * Flow:
   *
   * 1. Validate the trigger transaction.
   * 2. Load the trigger block.
   * 3. Read the current V2 pair state.
   * 4. Simulate the trigger swap.
   * 5. Use the resulting post-trigger reserves.
   * 6. Simulate the reverse backrun against
   *    the post-trigger state.
   * 7. Estimate the current gas cost.
   * 8. Calculate gross/net profit.
   *
   * No transaction is sent.
   * No blockchain state is modified.
   */
  async simulate(
    candidate: BackrunCandidate,
  ): Promise<BackrunSimulationResult> {
    try {
      if (
        !candidate.triggerTransactionHash
      ) {
        throw new Error(
          "Trigger transaction hash is required",
        );
      }

      const blockNumber =
        candidate.blockNumber;

      const block =
        await this.provider.getBlock(
          blockNumber,
          false,
        );

      if (!block) {
        throw new Error(
          `Block ${blockNumber} could not be loaded`,
        );
      }

      /*
       * --------------------------------------------------
       * STEP 1
       *
       * Validate decoded V2 candidate data.
       * --------------------------------------------------
       */
      if (
        !candidate.tokenIn ||
        !candidate.tokenOut
      ) {
        throw new Error(
          "V2 candidate tokenIn and tokenOut are required",
        );
      }

      if (
        candidate.amountIn === undefined ||
        candidate.amountIn <= 0n
      ) {
        throw new Error(
          "V2 candidate amountIn must be greater than zero",
        );
      }

      if (
        candidate.expectedAmountOut === undefined ||
        candidate.expectedAmountOut <= 0n
      ) {
        throw new Error(
          "V2 candidate expectedAmountOut is required",
        );
      }

      /*
       * --------------------------------------------------
       * STEP 2
       *
       * Read current V2 pair state.
       * --------------------------------------------------
       */
      const pairState =
        await getV2PairState(
          this.provider,
          candidate.tokenIn,
          candidate.tokenOut,
        );

      /*
       * --------------------------------------------------
       * STEP 3
       *
       * Simulate the trigger transaction.
       *
       * This produces the theoretical post-trigger
       * reserves.
       *
       * IMPORTANT:
       *
       * The trigger output is compared with the
       * previously obtained live quote.
       * --------------------------------------------------
       */
      const triggerSimulation =
        simulateV2Swap(
          pairState,
          candidate.tokenIn,
          candidate.tokenOut,
          candidate.amountIn,
        );

      /*
       * The simulator must agree with the quote
       * already attached to the candidate.
       *
       * This prevents us from silently simulating
       * a different amountOut than the detector/
       * quote pipeline observed.
       */
      if (
        triggerSimulation.amountOut !==
        candidate.expectedAmountOut
      ) {
        throw new Error(
          "Trigger simulation amountOut does not match candidate expectedAmountOut",
        );
      }

      /*
       * --------------------------------------------------
       * STEP 4
       *
       * Construct the theoretical post-trigger
       * pair state.
       * --------------------------------------------------
       */
      const postTriggerPairState = {
        ...pairState,

        reserve0:
          triggerSimulation.newReserve0,

        reserve1:
          triggerSimulation.newReserve1,
      };

      /*
       * --------------------------------------------------
       * STEP 5
       *
       * Simulate the reverse backrun.
       *
       * tokenOut -> tokenIn
       *
       * The backrun starts with the exact output
       * generated by the trigger simulation.
       *
       * Most importantly, this calculation uses
       * POST-TRIGGER reserves rather than current
       * reserves.
       * --------------------------------------------------
       */
      const backrunSimulation =
        simulateV2Swap(
          postTriggerPairState,
          candidate.tokenOut,
          candidate.tokenIn,
          triggerSimulation.amountOut,
        );

      const expectedReturnAmount =
        backrunSimulation.amountOut;

      if (
        expectedReturnAmount <= 0n
      ) {
        throw new Error(
          "Post-trigger backrun returned zero",
        );
      }

      /*
       * --------------------------------------------------
       * STEP 6
       *
       * Estimate gas.
       *
       * The estimator:
       *
       *   gas units × current gas price
       *        ↓
       *   native ETH cost
       *        ↓
       *   WETH -> profit-token quote
       *
       * This remains read-only.
       * --------------------------------------------------
       */
      const gasEstimate =
        await this.gasEstimator.estimate();

      if (
        !gasEstimate.success
      ) {
        throw new Error(
          gasEstimate.error ??
          "MEV gas estimation failed",
        );
      }

      const gasCostProfitToken =
        gasEstimate.gasCostProfitToken;

      if (
        gasCostProfitToken <= 0n
      ) {
        throw new Error(
          "MEV gas cost in profit token must be greater than zero",
        );
      }

      /*
       * --------------------------------------------------
       * STEP 7
       *
       * Calculate profitability.
       *
       * Revenue:
       *   Amount returned by the backrun.
       *
       * Flash-loan repayment:
       *   Original trigger amount.
       *
       * Gas:
       *   Current read-only gas estimate converted
       *   into the same profit-token denomination.
       * --------------------------------------------------
       */
      const result =
        this.calculator.calculate({
          expectedRevenue:
            expectedReturnAmount,

          flashLoanRepayment:
            candidate.amountIn,

          gasCost:
            gasCostProfitToken,
        });

      const minimumProfit =
        this.config.minimumProfit ?? 0n;

      /*
       * A zero-profit result is never considered
       * profitable.
       */
      const profitable =
        result.netProfit > 0n &&
        result.netProfit >= minimumProfit;

      return {
        success: true,

        triggerTransactionHash:
          candidate.triggerTransactionHash,

        expectedProfit:
          result.grossProfit,

        gasCost:
          result.totalCosts,

        netProfit:
          result.netProfit,

        profitable,
      };
    } catch (error) {
      return {
        success: false,

        triggerTransactionHash:
          candidate.triggerTransactionHash,

        expectedProfit: 0n,

        gasCost: 0n,

        netProfit: 0n,

        profitable: false,

        error:
          error instanceof Error
            ? error.message
            : "Unknown simulation error",
      };
    }
  }
}