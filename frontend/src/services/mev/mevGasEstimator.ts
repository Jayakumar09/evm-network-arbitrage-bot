import type { Provider } from "ethers";

import {
  getV2Quote,
} from "../blockchain";

/**
 * Native gas-cost estimate.
 *
 * gasCostNative is denominated in wei.
 * gasCostProfitToken is denominated in the
 * configured profit-token smallest unit.
 */
export interface MevGasEstimate {
  success: boolean;

  gasUnits: bigint;

  gasPriceWei: bigint;

  gasCostNative: bigint;

  gasCostProfitToken: bigint;

  profitToken: string;

  error?: string;
}

export interface MevGasEstimatorConfig {
  /**
   * Estimated gas units for the future backrun.
   *
   * This is intentionally configurable because
   * there is no executable backrun transaction
   * available for eth_estimateGas yet.
   */
  estimatedGasUnits?: bigint;

  /**
   * Token used to express profitability.
   *
   * Current MEV pipeline uses USDC.
   */
  profitToken: string;

  /**
   * Wrapped native token.
   *
   * On Sepolia this is WETH.
   */
  wrappedNativeToken: string;
}

/**
 * Read-only MEV gas estimator.
 *
 * IMPORTANT:
 *
 * This service does NOT:
 * - send transactions
 * - request wallet signatures
 * - modify blockchain state
 *
 * It obtains current fee data and converts the
 * estimated native-token gas cost into the same
 * smallest-unit denomination used by the MEV
 * profit calculation.
 */
export class MevGasEstimator {
  private provider: Provider;

  private config: MevGasEstimatorConfig;

  constructor(
    provider: Provider,
    config: MevGasEstimatorConfig,
  ) {
    this.provider = provider;

    this.config = {
      estimatedGasUnits:
        300000n,

      ...config,
    };

    if (
      this.config.estimatedGasUnits === undefined ||
      this.config.estimatedGasUnits <= 0n
    ) {
      throw new Error(
        "estimatedGasUnits must be greater than zero",
      );
    }

    if (
      !this.config.profitToken
    ) {
      throw new Error(
        "profitToken is required",
      );
    }

    if (
      !this.config.wrappedNativeToken
    ) {
      throw new Error(
        "wrappedNativeToken is required",
      );
    }
  }

  /**
   * Estimate the gas cost for the current
   * configured backrun gas-unit assumption.
   *
   * Gas cost is first calculated in native
   * currency:
   *
   *   gasUnits × gasPriceWei
   *
   * The native amount is then treated as an
   * equivalent WETH amount and quoted into
   * the configured profit token.
   */
  async estimate(): Promise<MevGasEstimate> {
    try {
      const feeData =
          await this.provider.getFeeData();

        /*
        * Prefer maxFeePerGas for EIP-1559
        * transactions and fall back to gasPrice.
        */
        const gasPriceWei =
          feeData.maxFeePerGas ??
          feeData.gasPrice;

        if (
          gasPriceWei === null ||
          gasPriceWei <= 0n
        ) {
          throw new Error(
            "Current gas price could not be determined",
          );
        }

      if (
        gasPriceWei === null ||
        gasPriceWei <= 0n
      ) {
        throw new Error(
          "Current gas price could not be determined",
        );
      }

      const gasUnits =
        this.config.estimatedGasUnits!;

      const gasCostNative =
        gasUnits * gasPriceWei;

      if (
        gasCostNative <= 0n
      ) {
        throw new Error(
          "Calculated native gas cost is zero",
        );
      }

      /*
       * ETH and WETH represent the same underlying
       * economic amount for this read-only estimate.
       *
       * Quote:
       *
       *   WETH gas cost -> profit token
       */
      const gasCostProfitToken =
        await getV2Quote(
          gasCostNative,
          [
            this.config.wrappedNativeToken,
            this.config.profitToken,
          ],
        );

      if (
        gasCostProfitToken <= 0n
      ) {
        throw new Error(
          "Profit-token gas-cost quote returned zero",
        );
      }

      return {
        success: true,

        gasUnits,

        gasPriceWei,

        gasCostNative,

        gasCostProfitToken,

        profitToken:
          this.config.profitToken,
      };
    } catch (error) {
      return {
        success: false,

        gasUnits:
          this.config.estimatedGasUnits!,

        gasPriceWei: 0n,

        gasCostNative: 0n,

        gasCostProfitToken: 0n,

        profitToken:
          this.config.profitToken,

        error:
          error instanceof Error
            ? error.message
            : "Unknown gas estimation error",
      };
    }
  }
}

/**
 * --------------------------------------------------
 * DEV TEST
 * --------------------------------------------------
 *
 * Run from browser console:
 *
 *   await window.testMevGasEstimator()
 *
 * This performs only read-only RPC calls.
 */
if (
  typeof window !== "undefined"
) {
  (
    window as Window & {
      testMevGasEstimator?: () => Promise<void>;
    }
  ).testMevGasEstimator =
    async () => {
      console.log(
        "[MEV GAS] Starting gas estimator test...",
      );

      const {
        getProvider,
      } = await import("../blockchain");

      const provider =
        await getProvider();

      const estimator =
        new MevGasEstimator(
          provider,
          {
            estimatedGasUnits:
              300000n,

            profitToken:
              "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",

            wrappedNativeToken:
              "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
          },
        );

      const result =
        await estimator.estimate();

      console.log(
        "[MEV GAS] Result:",
        result,
      );

      if (
        !result.success
      ) {
        throw new Error(
          result.error ??
          "Gas estimator test failed",
        );
      }

      if (
        result.gasUnits <= 0n
      ) {
        throw new Error(
          "Gas units validation failed",
        );
      }

      if (
        result.gasPriceWei <= 0n
      ) {
        throw new Error(
          "Gas price validation failed",
        );
      }

      if (
        result.gasCostNative <= 0n
      ) {
        throw new Error(
          "Native gas cost validation failed",
        );
      }

      if (
        result.gasCostProfitToken <= 0n
      ) {
        throw new Error(
          "Profit-token gas cost validation failed",
        );
      }

      console.log(
        "[MEV GAS] Gas units:",
        result.gasUnits.toString(),
      );

      console.log(
        "[MEV GAS] Gas price:",
        result.gasPriceWei.toString(),
        "wei",
      );

      console.log(
        "[MEV GAS] Native gas cost:",
        result.gasCostNative.toString(),
        "wei",
      );

      console.log(
        "[MEV GAS] Profit-token gas cost:",
        result.gasCostProfitToken.toString(),
      );

      console.log(
        "[MEV GAS] TEST PASSED",
      );
    };
}