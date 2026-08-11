import { useState } from 'react'
import type {
  ArbitrageOpportunity,
  DexType,
} from '../types/arbitrage'

interface OpportunityScannerProps {
  onOpportunityFound: (
    opportunity: ArbitrageOpportunity,
  ) => void
}

function OpportunityScanner({
  onOpportunityFound,
}: OpportunityScannerProps) {
  const [tokenIn, setTokenIn] = useState('USDC')
  const [tokenOut, setTokenOut] = useState('WETH')
  const [loanAmount, setLoanAmount] = useState('100')

  const [firstDex, setFirstDex] =
    useState<DexType>('UNISWAP_V3')

  const [secondDex, setSecondDex] =
    useState<DexType>('V2_COMPATIBLE')

  const [uniFee, setUniFee] = useState('3000')

  const [isScanning, setIsScanning] = useState(false)

  const handleScan = () => {
    if (!tokenIn || !tokenOut || !loanAmount) {
      return
    }

    setIsScanning(true)

    /*
     * MOCK MODE
     *
     * This is intentionally simulated data.
     * It is NOT a live blockchain quote.
     */

    setTimeout(() => {
      const opportunity: ArbitrageOpportunity = {
        tokenIn,
        tokenOut,
        loanAmount,

        firstDex,
        secondDex,

        uniFee: Number(uniFee),

        amountOut1: '100.42',
        amountOut2: '101.18',

        grossProfit: '1.18',
        flashLoanFee: '0.05',
        dexFees: '0.30',
        estimatedGas: '0.20',
        slippageCost: '0.10',
        safetyBuffer: '0.15',

        estimatedNetProfit: '0.38',
        profitPercent: '0.38',

        minOut1: '100.00',
        minOut2: '100.60',
        minProfit: '0.30',

        isProfitable: true,
        isStale: false,

        status: 'OPPORTUNITY_FOUND',
      }

      onOpportunityFound(opportunity)

      setIsScanning(false)
    }, 800)
  }

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

        {/* Mock Mode */}
        <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          MOCK QUOTE MODE
        </div>
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
              setTokenIn(event.target.value.toUpperCase())
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
              setTokenOut(event.target.value.toUpperCase())
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
              setLoanAmount(event.target.value)
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
              setFirstDex(event.target.value as DexType)
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
              setSecondDex(event.target.value as DexType)
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
              setUniFee(event.target.value)
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/60"
          >
            <option value="500">0.05%</option>
            <option value="3000">0.30%</option>
            <option value="10000">1.00%</option>
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