import { useState } from 'react'

import {
  useArbitrage,
} from '../context/ArbitrageContext'

import {
  formatUnits,
  parseUnits,
} from 'ethers'

import {
  getUniswapV3Quote,
  getV2Quote,
  encodeFlashLoanArbitrageParams,
  estimateFlashLoanArbitrage,
  getProvider,
  getAaveFlashLoanPremiumBps,
} from '../services/blockchain'

import {
  USDC_ADDRESS,
  WETH_ADDRESS,
} from '../config/contracts'

import type {
  ArbitrageOpportunity,
  DexType,
} from '../types/arbitrage'


// ==================================================
// Scanner Configuration
// ==================================================

const QUOTE_MAX_AGE_MS = 30_000

// ------------------------------------------------------
// Conservative ETH/USD reference price.
//
// Used ONLY when the external ETH/USD price provider is
// temporarily unavailable.
//
// The value is deliberately HIGH so that gas cost is
// OVERSTATED and estimated net profit is UNDERSTATED.
//
// Therefore this fallback can never publish a false
// profitable opportunity, and a temporary price-provider
// failure no longer destroys an otherwise valid
// blockchain opportunity.
//
// DEX quotes and arbitrage calculations are NOT affected:
// they come from the blockchain RPC providers, not from
// this price.
// ------------------------------------------------------

const CONSERVATIVE_FALLBACK_ETH_USD_PRICE = 10_000

// other existing constants...


interface OpportunityScannerProps {
  onOpportunityFound: (
    opportunity: ArbitrageOpportunity,
  ) => void
}

const SCANNER_DEBUG = false

function scannerLog(
  ...args: unknown[]
) {
  if (SCANNER_DEBUG) {
    console.log(...args)
  }
}

function scannerWarn(
  ...args: unknown[]
) {
  if (SCANNER_DEBUG) {
    console.warn(...args)
  }
}


// ======================================================
// Fetch ETH / USD Price
// ======================================================
//
// Used only for valuing real native-ETH gas cost.
// The arbitrage V2 pool is intentionally NOT used for
// gas valuation because its test liquidity can distort
// the ETH/USDC price.
//

async function getEthUsdPrice(): Promise<number> {

  const PRICE_URL =
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'

  try {

    const response =
      await fetch(
        PRICE_URL,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          cache: 'no-store',
        },
      )

    if (!response.ok) {

       scannerWarn(
        '[LIVE SCANNER] ETH/USD provider returned:',
        response.status,
      )

      return 0
    }

    const data =
      await response.json()

    const ethUsdPrice =
      Number(
        data?.ethereum?.usd,
      )

    if (
      !Number.isFinite(
        ethUsdPrice,
      ) ||
      ethUsdPrice <= 0
    ) {

      scannerWarn(
        '[LIVE SCANNER] Invalid ETH/USD price:',
        data,
      )

      return 0
    }

    scannerLog(
      '[LIVE SCANNER] ETH/USD:',
      ethUsdPrice,
    )

    return ethUsdPrice

  } catch (error) {

    console.warn(
      '[LIVE SCANNER] ETH/USD lookup failed:',
      error,
    )

    return 0
  }
}


// ======================================================
// Opportunity Scanner
// ======================================================

function OpportunityScanner({
  onOpportunityFound,
}: OpportunityScannerProps) {

  const {
    clearOpportunity,
  } = useArbitrage()


  const [
    tokenIn,
    setTokenIn,
  ] = useState('USDC')


  const [
    tokenOut,
    setTokenOut,
  ] = useState('WETH')


  const [
    loanAmount,
    setLoanAmount,
  ] = useState('100')


  const [
    firstDex,
    setFirstDex,
  ] = useState<DexType>(
    'UNISWAP_V3',
  )


  const [
    secondDex,
    setSecondDex,
  ] = useState<DexType>(
    'V2_COMPATIBLE',
  )


  const [
    uniFee,
    setUniFee,
  ] = useState('3000')


  const [
    isScanning,
    setIsScanning,
  ] = useState(false)


  const [
    scanError,
    setScanError,
  ] = useState<string | null>(
    null,
  )


  // ====================================================
  // Scan Opportunity
  // ====================================================

  const handleScan = async () => {

    // --------------------------------------------------
    // Clear previous opportunity
    // --------------------------------------------------

    clearOpportunity()


    // --------------------------------------------------
    // Basic validation
    // --------------------------------------------------

    if (
      !tokenIn ||
      !tokenOut ||
      !loanAmount
    ) {
      return
    }


    if (
      tokenIn !== 'USDC' ||
      tokenOut !== 'WETH'
    ) {

      setScanError(
        'Phase-1 live scanner supports USDC → WETH → USDC only.',
      )

      return
    }


    const numericLoanAmount =
      Number(
        loanAmount,
      )


    if (
      !Number.isFinite(
        numericLoanAmount,
      ) ||
      numericLoanAmount <= 0
    ) {

      setScanError(
        'Enter a valid flash loan amount.',
      )

      return
    }


    setIsScanning(true)
    setScanError(null)


    try {

      // ==================================================
      // Convert user amount to USDC raw units
      // ==================================================

     const amountIn =
        parseUnits(
          loanAmount,
          6,
        )

      // ==================================================
      // LIVE Aave Flash Loan Premium
      // ==================================================

      const flashLoanPremiumBps =
        await getAaveFlashLoanPremiumBps()

      console.log(
        '[LIVE SCANNER] Aave flash-loan premium:',
        flashLoanPremiumBps,
        'bps',
      )


      scannerLog(
        '========================================',
      )

      scannerLog(
        '[LIVE SCANNER] START',
      )

      scannerLog(
        '[LIVE SCANNER] Route scan:',
        'V2 → V3 AND V3 → V2',
      )

      scannerLog(
        '[LIVE SCANNER] Loan amount:',
        loanAmount,
      )

      scannerLog(
        '[LIVE SCANNER] USDC raw amount:',
        amountIn.toString(),
      )


      // ==================================================
      // Evaluate one route
      // ==================================================

      const evaluateRoute = async (
          routeFirstDex: DexType,
          routeSecondDex: DexType,
          flashLoanPremiumBps: number,
        ): Promise<ArbitrageOpportunity> => {

        scannerLog(
          '========================================',
        )

        scannerLog(
          '[LIVE SCANNER] EVALUATING ROUTE:',
          `${routeFirstDex} → ${routeSecondDex}`,
        )


        let amountOut1Raw: bigint
        let amountOut2Raw: bigint


        // ==================================================
        // DEX #1
        // USDC → WETH
        // ==================================================

        if (
          routeFirstDex ===
          'UNISWAP_V3'
        ) {

          amountOut1Raw =
            await getUniswapV3Quote(
              USDC_ADDRESS,
              WETH_ADDRESS,
              amountIn,
              Number(
                uniFee,
              ),
            )

          scannerLog(
            '[LIVE SCANNER] V3 DEX #1 WETH:',
            formatUnits(
              amountOut1Raw,
              18,
            ),
          )

        } else {

          amountOut1Raw =
            await getV2Quote(
              amountIn,
              [
                USDC_ADDRESS,
                WETH_ADDRESS,
              ],
            )

          scannerLog(
            '[LIVE SCANNER] V2 DEX #1 WETH:',
            formatUnits(
              amountOut1Raw,
              18,
            ),
          )
        }


        const amountOut1 =
          formatUnits(
            amountOut1Raw,
            18,
          )


        // ==================================================
        // DEX #2
        // WETH → USDC
        // ==================================================

        if (
          routeSecondDex ===
          'UNISWAP_V3'
        ) {

          amountOut2Raw =
            await getUniswapV3Quote(
              WETH_ADDRESS,
              USDC_ADDRESS,
              amountOut1Raw,
              Number(
                uniFee,
              ),
            )

          scannerLog(
            '[LIVE SCANNER] V3 DEX #2 USDC:',
            formatUnits(
              amountOut2Raw,
              6,
            ),
          )

        } else {

          amountOut2Raw =
            await getV2Quote(
              amountOut1Raw,
              [
                WETH_ADDRESS,
                USDC_ADDRESS,
              ],
            )

          scannerLog(
            '[LIVE SCANNER] V2 DEX #2 USDC:',
            formatUnits(
              amountOut2Raw,
              6,
            ),
          )
        }


        // ==================================================
        // Quote completed
        // ==================================================

        const quoteTimestamp =
          Date.now()

        const amountOut2 =
          formatUnits(
            amountOut2Raw,
            6,
          )

        // ==================================================
        // Profit calculation
        // ==================================================

        const loanAmountNumber =
          Number(
            loanAmount,
          )


        const amountOut2Number =
          Number(
            amountOut2,
          )


        const grossProfit =
          amountOut2Number -
          loanAmountNumber


        // ==================================================
        // LIVE Aave flash-loan premium
        // ==================================================
        //
        // FLASHLOAN_PREMIUM_TOTAL is returned in basis points.
        //
        // Example:
        //   5 bps = 5 / 10,000 = 0.0005 = 0.05%
        //
        // Do NOT hard-code the premium here.
        //

        const flashLoanFee =
          loanAmountNumber *
          (
            flashLoanPremiumBps /
            10_000
          )


        // ==================================================
        // DEX fees
        //
        // Quote functions already include their swap fees.
        // ==================================================

        const dexFees =
          0


        // ==================================================
        // Minimum output protection
        //
        // 1% reserve on both swaps.
        // ==================================================

        const minOut1Raw =
          amountOut1Raw *
          99n /
          100n


        const minOut2Raw =
          amountOut2Raw *
          99n /
          100n


        const minOut1 =
          formatUnits(
            minOut1Raw,
            18,
          )


        const minOut2 =
          formatUnits(
            minOut2Raw,
            6,
          )


        // ==================================================
        // Slippage reserve
        // ==================================================

        const slippageCost =
          Math.max(
            amountOut2Number -
              Number(
                minOut2,
              ),
            0,
          )


        // ==================================================
        // Safety buffer
        //
        // Reserve 10% of positive gross profit.
        // ==================================================

        const safetyBuffer =
          grossProfit > 0
            ? grossProfit *
              0.10
            : 0


        // ==================================================
        // Minimum on-chain profit safety floor
        // ==================================================

        const minimumProfitSafety =
          grossProfit > 0
            ? grossProfit *
              0.10
            : 0

        // ==================================================
        // Final on-chain minimum profit
        // ==================================================

        const minProfit =
          Math.max(
            flashLoanFee,
            minimumProfitSafety,
          )

        // ==================================================
        // REAL GAS ESTIMATION
        // ==================================================
        //
        // IMPORTANT:
        //
        // Only estimate gas when the quoted route has a
        // mathematical possibility of being profitable.
        //
        // A route that already loses money before gas,
        // cannot become profitable after paying gas.
        //
        // This prevents estimateGas() from deliberately
        // simulating an impossible flash-loan repayment.
        //
        // Example:
        //
        //   Loan:          100 USDC
        //   Final output:   21 USDC
        //
        // The Executor cannot repay:
        //
        //   100 USDC + Aave premium
        //
        // Therefore there is no reason to call estimateGas()
        // for that route.
        //
        // For a potentially profitable route, we perform the
        // real Executor estimateGas() simulation.
        //

       let estimatedGas =
          Number.POSITIVE_INFINITY

        let gasEstimationSkipped =
          false

        // --------------------------------------------------
        // Determine whether gas estimation is worthwhile.
        //
        // Required before gas:
        //   gross profit
        //   - flash-loan fee
        //   - slippage reserve
        //   - safety buffer
        //
        // If this is already <= 0, gas can only make the
        // result worse.
        // --------------------------------------------------

        const firstDexNumber =
          routeFirstDex ===
          'UNISWAP_V3'
            ? 0
            : 1

        // ==================================================
        // Final Executor parameters
        // ==================================================
        //
        // This is the exact parameter set that must be used
        // by gas estimation, simulation and execution.
        // ==================================================

        const finalParams =
          encodeFlashLoanArbitrageParams(
            1,
            firstDexNumber,
            USDC_ADDRESS,
            WETH_ADDRESS,
            Number(
              uniFee,
            ),
            minOut1Raw,
            minOut2Raw,
            parseUnits(
              minProfit.toFixed(6),
              6,
            ),
          )

        const preGasProfit =
          grossProfit -
          flashLoanFee -
          dexFees -
          slippageCost -
          safetyBuffer

        if (
          preGasProfit <= 0
        ) {

          scannerLog(
            '[LIVE SCANNER] Gas estimation skipped:',
            'route cannot be profitable before gas.',
          )

          scannerLog(
            '[LIVE SCANNER] Pre-gas profit:',
            preGasProfit,
          )

          // ------------------------------------------------
          // No gas estimation is required.
          //
          // Use zero only for display/accounting because
          // this route has already failed before gas.
          //
          // IMPORTANT:
          // This does NOT mean the real gas cost is zero.
          // It means gas was intentionally not estimated.
          // ------------------------------------------------

          estimatedGas =
            0

          gasEstimationSkipped =
            true

        } else {

          try {

            scannerLog(
              '[LIVE SCANNER] Estimating real Executor gas...',
            )

            scannerLog(
              '[LIVE SCANNER] Route:',
              `${routeFirstDex} → ${routeSecondDex}`,
            )

            scannerLog(
              '[LIVE SCANNER] First DEX number:',
              firstDexNumber,
            )

            // ------------------------------------------------
            // Actual Executor gas estimation.
            //
            // This performs an RPC simulation only.
            // It does NOT submit a transaction.
            // ------------------------------------------------

            const gasLimit =
              await estimateFlashLoanArbitrage(
                USDC_ADDRESS,
                amountIn,
                finalParams,
              )

            // ------------------------------------------------
            // Provider
            // ------------------------------------------------

            const provider =
              await getProvider()

            // ------------------------------------------------
            // Current Sepolia gas price
            // ------------------------------------------------

            const gasPriceHex =
              await provider.send(
                'eth_gasPrice',
                [],
              )

            const gasPrice =
              BigInt(
                gasPriceHex,
              )

            if (
              gasPrice <=
              0n
            ) {

              throw new Error(
                'Invalid Sepolia gas price returned by RPC.',
              )
            }

            // ------------------------------------------------
            // Native ETH gas cost
            // ------------------------------------------------

            const gasCostWei =
              gasLimit *
              gasPrice

            const gasCostEth =
              Number(
                formatUnits(
                  gasCostWei,
                  18,
                ),
              )

            // ------------------------------------------------
            // ETH/USD price
            //
            // A temporary price-provider failure must NOT
            // destroy an otherwise valid blockchain
            // opportunity.
            //
            // When the live price is unavailable, fall back
            // to CONSERVATIVE_FALLBACK_ETH_USD_PRICE, which
            // OVERSTATES gas cost and therefore UNDERSTATES
            // estimated net profit (safe direction).
            //
            // The arbitrage quotes themselves are NOT
            // affected: they come from the DEX RPC calls.
            // ------------------------------------------------

            const liveEthUsdPrice =
              await getEthUsdPrice()

            const ethUsdPrice =
              liveEthUsdPrice > 0
                ? liveEthUsdPrice
                : CONSERVATIVE_FALLBACK_ETH_USD_PRICE

            if (
              liveEthUsdPrice <= 0
            ) {

              scannerWarn(
                '[LIVE SCANNER] ETH/USD provider unavailable. Using conservative fallback:',
                CONSERVATIVE_FALLBACK_ETH_USD_PRICE,
              )
            }

            if (
              !Number.isFinite(
                ethUsdPrice,
              ) ||
              ethUsdPrice <= 0
            ) {

              throw new Error(
                'Invalid ETH/USD price for gas valuation.',
              )
            }

            // ------------------------------------------------
            // Convert gas cost to USDC/USD
            //
            // USDC is treated as USD-denominated for scanner
            // accounting on Sepolia.
            // ------------------------------------------------

            const gasCostUsdc =
              gasCostEth *
              ethUsdPrice

            if (
              !Number.isFinite(
                gasCostUsdc,
              ) ||
              gasCostUsdc < 0
            ) {

              throw new Error(
                'Invalid calculated gas cost.',
              )
            }

            estimatedGas =
              gasCostUsdc

            gasEstimationSkipped =
              false

            // ------------------------------------------------
            // Diagnostics
            // ------------------------------------------------

            scannerLog(
              '[LIVE SCANNER] Gas limit:',
              gasLimit.toString(),
            )

          scannerLog(
              '[LIVE SCANNER] Gas price:',
              gasPrice.toString(),
            )

           scannerLog(
              '[LIVE SCANNER] Gas cost ETH:',
              gasCostEth,
            )

           scannerLog(
              '[LIVE SCANNER] ETH/USD:',
              ethUsdPrice,
            )

            scannerLog(
              '[LIVE SCANNER] Estimated gas USDC:',
              estimatedGas,
            )

          } catch (
            gasError
          ) {

            scannerWarn(
              '[LIVE SCANNER] Real gas estimation failed.',
              gasError,
            )

            // ------------------------------------------------
            // Safety rule:
            //
            // Unknown gas cost means the route cannot be
            // published as profitable.
            // ------------------------------------------------

            estimatedGas =
              Number.POSITIVE_INFINITY

            gasEstimationSkipped =
              false
          }
        }

        // ==================================================
        // Estimated net profit
        // ==================================================

        const estimatedNetProfit =
          gasEstimationSkipped
            ? preGasProfit
            : grossProfit -
              flashLoanFee -
              dexFees -
              estimatedGas -
              slippageCost -
              safetyBuffer


        // ==================================================
        // Profit percentage
        // ==================================================

        const profitPercent =
          loanAmountNumber > 0
            ? (
                estimatedNetProfit /
                loanAmountNumber
              ) *
              100
            : 0


        // ==================================================
        // Profitability check
        // ==================================================

        const isProfitable =
          Number.isFinite(
            estimatedNetProfit,
          ) &&
          estimatedNetProfit >
            minProfit


        // ==================================================
        // Diagnostics
        // ==================================================

       scannerLog(
          '[LIVE SCANNER] ROUTE RESULT:',
          `${routeFirstDex} → ${routeSecondDex}`,
        )

        scannerLog(
          '[LIVE SCANNER] Gross profit:',
          grossProfit,
        )

        scannerLog(
          '[LIVE SCANNER] Flash loan fee:',
          flashLoanFee,
        )

       scannerLog(
          '[LIVE SCANNER] Slippage reserve:',
          slippageCost,
        )

        scannerLog(
          '[LIVE SCANNER] Safety buffer:',
          safetyBuffer,
        )

       scannerLog(
          '[LIVE SCANNER] Estimated gas USDC:',
          estimatedGas,
        )

        scannerLog(
          '[LIVE SCANNER] Estimated net profit:',
          estimatedNetProfit,
        )

        scannerLog(
          '[LIVE SCANNER] Minimum profit safety floor:',
          minimumProfitSafety,
        )

        scannerLog(
          '[LIVE SCANNER] Minimum on-chain profit:',
          minProfit,
        )

       scannerLog(
          '[LIVE SCANNER] Profitable:',
          isProfitable,
        )


        // ==================================================
        // Return opportunity
        // ==================================================

        return {

          tokenIn,
          tokenOut,
          loanAmount,

          firstDex:
            routeFirstDex,

          secondDex:
            routeSecondDex,

          // Keep the fee used by this route.
          uniFee:
            Number(
              uniFee,
            ),

          amountOut1,
          amountOut2,

          grossProfit:
            grossProfit.toFixed(
              6,
            ),

          flashLoanFee:
            flashLoanFee.toFixed(
              6,
            ),

          dexFees:
            dexFees.toFixed(
              6,
            ),

          estimatedGas:
            estimatedGas.toFixed(
              6,
            ),

          slippageCost:
            slippageCost.toFixed(
              6,
            ),

          safetyBuffer:
            safetyBuffer.toFixed(
              6,
            ),

          estimatedNetProfit:
            estimatedNetProfit.toFixed(
              6,
            ),

          profitPercent:
            profitPercent.toFixed(
              4,
            ),

          minOut1,
          minOut2,

          minProfit:
            minProfit.toFixed(
              6,
            ),

          isProfitable,

          quoteTimestamp,

          isStale:
            Date.now() -
              quoteTimestamp >
            QUOTE_MAX_AGE_MS,

          status:
            'OPPORTUNITY_FOUND',
        }
      }


      // ==================================================
      // Evaluate BOTH directions
      // ==================================================

      scannerLog(
        '========================================',
      )

      scannerLog(
        '[LIVE SCANNER] TEST #1:',
        'V2_COMPATIBLE → UNISWAP_V3',
      )


      const v2ToV3 =
        await evaluateRoute(
          'V2_COMPATIBLE',
          'UNISWAP_V3',
          flashLoanPremiumBps,
        )


      scannerLog(
        '========================================',
      )

      scannerLog(
        '[LIVE SCANNER] TEST #2:',
        'UNISWAP_V3 → V2_COMPATIBLE',
      )


      const v3ToV2 =
        await evaluateRoute(
          'UNISWAP_V3',
          'V2_COMPATIBLE',
          flashLoanPremiumBps,
        )


      // ==================================================
      // Candidate list
      // ==================================================

      const candidates =
        [
          v2ToV3,
          v3ToV2,
        ]


      const profitableCandidates =
        candidates.filter(
          (
            candidate,
          ) =>
            candidate.isProfitable,
        )


      scannerLog(
        '========================================',
      )

     scannerLog(
        '[LIVE SCANNER] TOTAL CANDIDATES:',
        candidates.length,
      )

      scannerLog(
        '[LIVE SCANNER] PROFITABLE CANDIDATES:',
        profitableCandidates.length,
      )


      // ==================================================
      // No profitable route
      // ==================================================

      if (
        profitableCandidates.length ===
        0
      ) {

        const bestCandidate =
          candidates.reduce(
            (
              best,
              current,
            ) =>
              Number(
                current.estimatedNetProfit,
              ) >
              Number(
                best.estimatedNetProfit,
              )
                ? current
                : best,
          )


        scannerLog(
          '[LIVE SCANNER] NO PROFITABLE ROUTE',
        )

       scannerLog(
          '[LIVE SCANNER] BEST ROUTE:',
          `${bestCandidate.firstDex} → ${bestCandidate.secondDex}`,
        )

       scannerLog(
          '[LIVE SCANNER] BEST FEE:',
          bestCandidate.uniFee,
        )

        scannerLog(
          '[LIVE SCANNER] BEST NET PROFIT:',
          bestCandidate.estimatedNetProfit,
        )

       scannerLog(
          '[LIVE SCANNER] No opportunity published.',
        )

        return
      }


      // ==================================================
      // Find highest-profit route
      // ==================================================

      const bestOpportunity =
        profitableCandidates.reduce(
          (
            best,
            current,
          ) =>
            Number(
              current.estimatedNetProfit,
            ) >
            Number(
              best.estimatedNetProfit,
            )
              ? current
              : best,
        )


      scannerLog(
        '========================================',
      )

      scannerLog(
        '[LIVE SCANNER] BEST PROFITABLE ROUTE:',
        `${bestOpportunity.firstDex} → ${bestOpportunity.secondDex}`,
      )

      scannerLog(
        '[LIVE SCANNER] BEST FEE:',
        bestOpportunity.uniFee,
      )

      scannerLog(
        '[LIVE SCANNER] BEST NET PROFIT:',
        bestOpportunity.estimatedNetProfit,
      )

      scannerLog(
        '[LIVE SCANNER] PROFITABLE:',
        bestOpportunity.isProfitable,
      )


      // ==================================================
      // Synchronize UI with BEST route
      // ==================================================

      setFirstDex(
        bestOpportunity.firstDex,
      )

      setSecondDex(
        bestOpportunity.secondDex,
      )

      setUniFee(
        String(
          bestOpportunity.uniFee,
        ),
      )


      scannerLog(
        '[LIVE SCANNER] SELECTED ROUTE:',
        `${bestOpportunity.firstDex} → ${bestOpportunity.secondDex}`,
      )

      scannerLog(
        '[LIVE SCANNER] SELECTED FEE:',
        bestOpportunity.uniFee,
      )


      // ==================================================
      // Publish ONLY the best profitable opportunity
      // ==================================================
      //
      // IMPORTANT — quote freshness clock:
      //
      // Each route records quoteTimestamp when ITS own
      // two-leg quote completed.
      //
      // Routes are evaluated sequentially, so for the FIRST
      // evaluated route that timestamp can be many seconds
      // old by the time scanning finishes:
      //
      //   - the winner's own gas estimation, gas price
      //     lookup and ETH/USD lookup all run AFTER its
      //     quoteTimestamp
      //   - the second route is evaluated completely
      //     afterwards
      //
      // Publishing the mid-scan timestamp would mark a
      // freshly scanned opportunity as STALE before the
      // user even reaches the Execution page.
      //
      // The 30-second freshness window protects the user's
      // decision-to-execute window on the PUBLISHED
      // snapshot, so the clock must start when the
      // opportunity is published.
      //
      // On-chain validity is still enforced separately by
      // the pre-flight simulation before any real
      // transaction.
      //

      const publishedAt =
        Date.now()

      const publishDelayMs =
        publishedAt -
        bestOpportunity.quoteTimestamp


      console.log(
        '[LIVE SCANNER] Quote assembly delay:',
        `${(publishDelayMs / 1000).toFixed(1)}s`,
        '— freshness clock starts at publish time.',
      )


      const publishedOpportunity = {
        ...bestOpportunity,

        quoteTimestamp:
          publishedAt,

        isStale:
          Date.now() -
            publishedAt >
          QUOTE_MAX_AGE_MS,
      }


      onOpportunityFound(
        publishedOpportunity,
      )


      scannerLog(
        '[LIVE SCANNER] OPPORTUNITY PUBLISHED',
      )

      scannerLog(
        '========================================',
      )

    } catch (
      error: any
    ) {

      console.error(
        '========================================',
      )

      console.error(
        '[LIVE SCANNER] FAILED',
      )

      console.error(
        '[LIVE SCANNER] Error:',
        error,
      )

      console.error(
        '[LIVE SCANNER] Message:',
        error?.message,
      )

      console.error(
        '[LIVE SCANNER] Reason:',
        error?.reason,
      )

      console.error(
        '[LIVE SCANNER] Short message:',
        error?.shortMessage,
      )

      console.error(
        '[LIVE SCANNER] Data:',
        error?.data,
      )

      console.error(
        '========================================',
      )


      setScanError(
        error?.shortMessage ||
        error?.reason ||
        error?.message ||
        'Live DEX quote failed.',
      )

    } finally {

      setIsScanning(false)
    }
  }


  // ====================================================
  // UI
  // ====================================================

  return (

    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/10">

      {/* Header */}

      <div className="mb-6">

        <div className="flex items-center gap-2">

          <div className="h-2 w-2 rounded-full bg-emerald-400" />

          <h3 className="text-lg font-semibold text-white">
            Arbitrage Opportunity Scanner
          </h3>

        </div>


        <p className="mt-2 text-sm text-slate-400">
          Scan DEX routes for potential flash-loan arbitrage
          opportunities.
        </p>


        <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-400">

          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

          LIVE SEPOLIA QUOTE MODE

        </div>


        {scanError && (

          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">

            {scanError}

          </div>

        )}

      </div>


      {/* Input Grid */}

      <div className="grid gap-5 md:grid-cols-3">

        {/* Token In */}

        <div>

          <label className="mb-2 block text-sm font-medium text-slate-300">
            Token In
          </label>

          <input
            value={tokenIn}
            onChange={(event) =>
              setTokenIn(
                event.target.value.toUpperCase(),
              )
            }
            placeholder="USDC"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/60"
          />

        </div>


        {/* Token Out */}

        <div>

          <label className="mb-2 block text-sm font-medium text-slate-300">
            Token Out
          </label>

          <input
            value={tokenOut}
            onChange={(event) =>
              setTokenOut(
                event.target.value.toUpperCase(),
              )
            }
            placeholder="WETH"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/60"
          />

        </div>


        {/* Loan Amount */}

        <div>

          <label className="mb-2 block text-sm font-medium text-slate-300">
            Flash Loan Amount
          </label>

          <input
            value={loanAmount}
            onChange={(event) =>
              setLoanAmount(
                event.target.value,
              )
            }
            type="number"
            min="0"
            step="any"
            placeholder="100"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/60"
          />

        </div>


        {/* First DEX */}

        <div>

          <label className="mb-2 block text-sm font-medium text-slate-300">
            First DEX
          </label>

          <select
            value={firstDex}
            onChange={(event) =>
              setFirstDex(
                event.target.value as DexType,
              )
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/60"
          >

            <option value="UNISWAP_V3">
              Uniswap V3
            </option>

            <option value="V2_COMPATIBLE">
              V2-Compatible DEX
            </option>

          </select>

        </div>


        {/* Second DEX */}

        <div>

          <label className="mb-2 block text-sm font-medium text-slate-300">
            Second DEX
          </label>

          <select
            value={secondDex}
            onChange={(event) =>
              setSecondDex(
                event.target.value as DexType,
              )
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/60"
          >

            <option value="V2_COMPATIBLE">
              V2-Compatible DEX
            </option>

            <option value="UNISWAP_V3">
              Uniswap V3
            </option>

          </select>

        </div>


        {/* Fee Tier */}

        <div>

          <label className="mb-2 block text-sm font-medium text-slate-300">
            Uniswap Fee Tier
          </label>

          <select
            value={uniFee}
            onChange={(event) =>
              setUniFee(
                event.target.value,
              )
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/60"
          >

            <option value="500">
              0.05%
            </option>

            <option value="3000">
              0.30%
            </option>

            <option value="10000">
              1.00%
            </option>

          </select>

        </div>

      </div>


      {/* Scan Button */}

      <div className="mt-6 flex justify-end">

        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning}
          className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >

          {isScanning
            ? 'Scanning...'
            : 'Scan Opportunity'}

        </button>

      </div>

    </section>
  )
}


export default OpportunityScanner