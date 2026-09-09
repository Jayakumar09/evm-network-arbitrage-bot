export interface ProfitCalculationInput {
  amountIn: bigint;
  amountOut: bigint;

  /**
   * Amount that must be repaid to the flash-loan provider.
   * This should include the principal and flash-loan fee.
   */
  flashLoanRepayment: bigint;

  /**
   * Total DEX fees expressed in the same token
   * as amountOut.
   */
  dexFees: bigint;

  /**
   * Estimated gas cost expressed in the same token
   * as amountOut.
   */
  gasCost: bigint;

  /**
   * Estimated slippage cost expressed in the same token
   * as amountOut.
   */
  slippageCost: bigint;

  /**
   * Any additional execution cost.
   */
  executionCost?: bigint;
}

export interface ProfitCalculationResult {
  grossProfit: bigint;
  totalCosts: bigint;
  netProfit: bigint;
  profitable: boolean;
}

/**
 * Calculate the actual net result of an opportunity.
 *
 * All bigint values must use the SAME token denomination.
 *
 * Example:
 *
 * amountOut            = 1,010 USDC
 * flashLoanRepayment   = 1,000 USDC
 * dexFees              = 3 USDC
 * gasCost              = 2 USDC
 * slippageCost         = 1 USDC
 *
 * netProfit = 4 USDC
 */
export function calculateNetProfit(
  input: ProfitCalculationInput,
): ProfitCalculationResult {
  const executionCost = input.executionCost ?? 0n;

  const grossProfit =
    input.amountOut - input.flashLoanRepayment;

  const totalCosts =
    input.dexFees +
    input.gasCost +
    input.slippageCost +
    executionCost;

  const netProfit =
    grossProfit - totalCosts;

  return {
    grossProfit,
    totalCosts,
    netProfit,
    profitable: netProfit > 0n,
  };
}

/**
 * Check whether an opportunity meets a minimum
 * required profit.
 */
export function meetsMinimumProfit(
  netProfit: bigint,
  minimumProfit: bigint,
): boolean {
  return netProfit >= minimumProfit;
}