import type {
  MevProfitInput,
  MevProfitResult,
} from "../../types/mev";

export class MevProfitCalculator {
  /**
   * Calculate MEV opportunity profitability.
   *
   * All values must use the same denomination.
   */
  calculate(
    input: MevProfitInput,
  ): MevProfitResult {
    const flashLoanRepayment =
      input.flashLoanRepayment ?? 0n;

    const dexFees =
      input.dexFees ?? 0n;

    const gasCost =
      input.gasCost ?? 0n;

    const slippageCost =
      input.slippageCost ?? 0n;

    const executionCost =
      input.executionCost ?? 0n;

    const grossProfit =
      input.expectedRevenue -
      flashLoanRepayment;

    const totalCosts =
      dexFees +
      gasCost +
      slippageCost +
      executionCost;

    const netProfit =
      grossProfit -
      totalCosts;

    return {
      grossProfit,
      totalCosts,
      netProfit,
      profitable:
        netProfit > 0n,
    };
  }

  /**
   * Check whether net profit exceeds
   * a configured minimum.
   */
  isAboveThreshold(
    netProfit: bigint,
    minimumProfit: bigint,
  ): boolean {
    return (
      netProfit >= minimumProfit
    );
  }
}