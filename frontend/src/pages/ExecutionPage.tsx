import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useArbitrage } from '../context/ArbitrageContext'

function ExecutionPage() {
  const navigate = useNavigate()

  const { opportunity } = useArbitrage()

  const [showConfirmation, setShowConfirmation] =
    useState(false)

  // --------------------------------------------------
  // No opportunity available
  // --------------------------------------------------
  if (!opportunity) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">

        <p className="text-sm font-medium text-emerald-400">
          FLASH LOAN ARBITRAGE
        </p>

        <h1 className="mt-2 text-3xl font-bold text-white">
          Execution
        </h1>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8">

          <h2 className="text-xl font-semibold text-white">
            No Opportunity Ready
          </h2>

          <p className="mt-2 text-slate-400">
            Scan and review an arbitrage opportunity before
            preparing execution.
          </p>

          <button
            type="button"
            onClick={() => navigate('/scanner')}
            className="mt-6 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Go to Scanner
          </button>

        </div>

      </div>
    )
  }

  const firstDexName =
    opportunity.firstDex === 'UNISWAP_V3'
      ? 'Uniswap V3'
      : 'V2-Compatible DEX'

  const secondDexName =
    opportunity.secondDex === 'UNISWAP_V3'
      ? 'Uniswap V3'
      : 'V2-Compatible DEX'

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">

      {/* ------------------------------------------------
          Header
      ------------------------------------------------ */}
      <section>

        <p className="text-sm font-medium text-emerald-400">
          FLASH LOAN ARBITRAGE
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Execution
        </h1>

        <p className="mt-3 max-w-2xl text-slate-400">
          Review the arbitrage parameters before confirming
          execution.
        </p>

      </section>

      {/* ------------------------------------------------
          Mock Mode Notice
      ------------------------------------------------ */}
      <section className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">

        <div className="flex items-start gap-3">

          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" />

          <div>
            <p className="font-semibold text-amber-400">
              MOCK EXECUTION MODE
            </p>

            <p className="mt-1 text-sm text-slate-400">
              No blockchain transaction will be sent.
              Confirmation below is currently a UI test only.
            </p>
          </div>

        </div>

      </section>

      {/* ------------------------------------------------
          Execution Review
      ------------------------------------------------ */}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">

        {/* Route Information */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">

          <h2 className="text-lg font-semibold text-white">
            Execution Route
          </h2>

          <div className="mt-5 space-y-4">

            <ExecutionRow
            label="Token Pair"
            value={`${opportunity.tokenIn} → ${opportunity.tokenOut} → ${opportunity.tokenIn}`}
            />

            <ExecutionRow
            label="Flash Loan"
            value={`${opportunity.loanAmount} ${opportunity.tokenIn}`}
            />

            <ExecutionRow
            label="First DEX"
            value={firstDexName}
            />

            <ExecutionRow
            label="Second DEX"
            value={secondDexName}
            />

            <ExecutionRow
            label="Uniswap Fee"
            value={`${(opportunity.uniFee / 10000).toFixed(2)}%`}
             />

          </div>

        </div>

        {/* Safety Parameters */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">

          <h2 className="text-lg font-semibold text-white">
            Safety Parameters
          </h2>

          <div className="mt-5 space-y-4">

            <ExecutionRow
              label="Minimum Output #1"
              value={opportunity.minOut1}
            />

            <ExecutionRow
              label="Minimum Output #2"
              value={opportunity.minOut2}
            />

            <ExecutionRow
              label="Minimum Profit"
              value={`$${opportunity.minProfit}`}
            />

            <ExecutionRow
              label="Estimated Gas"
              value={`$${opportunity.estimatedGas}`}
            />

            <ExecutionRow
              label="Quote Status"
              value={
                opportunity.isStale
                  ? 'STALE'
                  : 'CURRENT'
              }
              valueClassName={
                opportunity.isStale
                  ? 'text-red-400'
                  : 'text-emerald-400'
              }
            />

          </div>

        </div>

      </section>

      {/* ------------------------------------------------
          Profit Summary
      ------------------------------------------------ */}
      <section className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">

        <div className="grid gap-6 sm:grid-cols-3">

          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Gross Profit
            </p>

            <p className="mt-2 text-xl font-semibold text-white">
              ${opportunity.grossProfit}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Estimated Net Profit
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-400">
              ${opportunity.estimatedNetProfit}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Profit
            </p>

            <p className="mt-2 text-xl font-semibold text-white">
              {opportunity.profitPercent}%
            </p>
          </div>

        </div>

      </section>

      {/* ------------------------------------------------
          Execution Status
      ------------------------------------------------ */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">

        <h2 className="text-lg font-semibold text-white">
          Execution Checks
        </h2>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">

          <CheckItem
            label="Opportunity is profitable"
            passed={opportunity.isProfitable}
          />

          <CheckItem
            label="Quote is current"
            passed={!opportunity.isStale}
          />

          <CheckItem
            label="Minimum profit requirement"
            passed={opportunity.isProfitable}
          />

          <CheckItem
            label="Mock execution mode"
            passed
          />

        </div>

      </section>

      {/* ------------------------------------------------
          Action Buttons
      ------------------------------------------------ */}
      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

        <button
          type="button"
          onClick={() => navigate('/opportunity')}
          className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-900 hover:text-white"
        >
          Back to Opportunity
        </button>

        <button
          type="button"
          disabled={
            !opportunity.isProfitable ||
            opportunity.isStale
          }
          onClick={() => setShowConfirmation(true)}
          className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirm & Execute
        </button>

      </div>

      {/* ------------------------------------------------
          Confirmation
      ------------------------------------------------ */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">

          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">

            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Mock Confirmation
            </p>

            <h2 className="mt-2 text-2xl font-bold text-white">
              Confirm Arbitrage
            </h2>

            <p className="mt-3 text-sm text-slate-400">
              This confirmation is currently a UI test.
              No wallet transaction will be submitted.
            </p>

            <div className="mt-6 space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">

              <ExecutionRow
                label="Flash Loan"
                value={`${opportunity.loanAmount} ${opportunity.tokenIn}`}
              />

              <ExecutionRow
                label="Route"
                value={`${firstDexName} → ${secondDexName}`}
              />

              <ExecutionRow
                label="Minimum Profit"
                value={`$${opportunity.minProfit}`}
              />

              <ExecutionRow
                label="Estimated Net Profit"
                value={`$${opportunity.estimatedNetProfit}`}
                valueClassName="text-emerald-400"
              />

            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                Confirm Mock Execution
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  )
}

/* ======================================================
   Execution Row
====================================================== */

interface ExecutionRowProps {
  label: string
  value: string
  valueClassName?: string
}

function ExecutionRow({
  label,
  value,
  valueClassName = 'text-white',
}: ExecutionRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800/70 pb-3 last:border-0 last:pb-0">

      <span className="text-sm text-white">
        {label}
      </span>

      <span
        className={`text-right text-sm font-semibold ${valueClassName}`}
      >
        {value}
      </span>

    </div>
  )
}

/* ======================================================
   Check Item
====================================================== */

interface CheckItemProps {
  label: string
  passed: boolean
}

function CheckItem({
  label,
  passed,
}: CheckItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">

      <span
        className={[
          'flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold',
          passed
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-red-500/15 text-red-400',
        ].join(' ')}
      >
        {passed ? '✓' : '×'}
      </span>

      <span className="text-sm text-slate-300">
        {label}
      </span>

    </div>
  )
}

export default ExecutionPage