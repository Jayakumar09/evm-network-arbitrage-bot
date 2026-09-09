import { useEffect, useState } from 'react'

import {
  PaperExecutionService,
} from '../services/mev/paperExecution'

import {
  paperExecutionStore,
} from '../services/mev/paperExecutionStore'

import type {
  PaperExecutionPlan,
} from '../types/mev'

// ======================================================
// PAPER EXECUTION HISTORY
// ======================================================
//
// Phase 2 MEV development only.
//
// This component displays successful paper execution
// plans stored during the current browser session.
//
// IMPORTANT:
//
// This UI is PAPER ONLY.
//
// It NEVER:
// - connects a wallet
// - requests a signature
// - sends a transaction
// - calls a write contract method
// - modifies blockchain state
//
// It reads from PaperExecutionService, which reads from
// the in-memory PaperExecutionStore.
// ======================================================

function PaperExecutionHistory() {
  const [
    executions,
    setExecutions,
  ] = useState<PaperExecutionPlan[]>([])

  const [
    service,
  ] = useState(
    () => new PaperExecutionService(),
  )

  // ====================================================
  // Load Paper Execution History
  // ====================================================

    useEffect(() => {
    const loadHistory = () => {
      setExecutions(
        service.getAll(),
      )
    }

    loadHistory()

    const unsubscribe =
      paperExecutionStore.subscribe(
        loadHistory,
      )

    return () => {
      unsubscribe()
    }
  }, [service])

  // ====================================================
  // Empty State
  // ====================================================

  if (
    executions.length === 0
  ) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-emerald-400">
              MEV Paper Mode
            </p>

            <h2 className="mt-2 text-xl font-semibold text-white">
              Paper Execution History
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              No successful paper executions have been recorded
              during this browser session.
            </p>
          </div>

          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
            PAPER ONLY
          </span>
        </div>
      </section>
    )
  }

  // ====================================================
  // Render History
  // ====================================================

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
      {/* ==================================================
          Header
          ================================================== */}

      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 px-6 py-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs uppercase tracking-wider text-emerald-400">
            MEV Paper Mode
          </p>

          <h2 className="mt-2 text-xl font-semibold text-white">
            Paper Execution History
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Successful hypothetical backrun executions from
            the current browser session.
          </p>
        </div>

        <span className="w-fit rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
          PAPER ONLY
        </span>
      </div>

      {/* ==================================================
          Summary
          ================================================== */}

      <div className="grid gap-4 border-b border-slate-800 p-6 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Executions
          </p>

          <p className="mt-2 text-2xl font-semibold text-white">
            {executions.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Latest Net Profit
          </p>

          <p className="mt-2 text-2xl font-semibold text-emerald-400">
            {formatProfit(
              executions[0]?.netProfit,
            )}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            State
          </p>

          <p className="...">
            {executions.length > 0
              ? executions[executions.length - 1].state
              : '—'}
          </p>
        </div>
      </div>

      {/* ==================================================
          Desktop Table
          ================================================== */}

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left">
          <thead className="border-b border-slate-800 bg-slate-900/40">
            <tr>
              <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                Paper Execution
              </th>

              <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                Route
              </th>

              <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                Amount In
              </th>

              <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                Expected Out
              </th>

              <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                Gross Profit
              </th>

              <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                Gas
              </th>

              <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                Net Profit
              </th>

              <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {executions.map(
              (
                execution,
              ) => (
                <tr
                  key={
                    execution.paperExecutionId
                  }
                  className="border-b border-slate-800/70 last:border-0 hover:bg-slate-900/30"
                >
                  <td className="px-6 py-5">
                    <p className="font-mono text-xs text-white">
                      {shortenHash(
                        execution.paperExecutionId,
                      )}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Block {execution.blockNumber}
                    </p>
                  </td>

                  <td className="px-6 py-5">
                    <p className="text-sm text-white">
                      {shortenAddress(
                        execution.tokenIn,
                      )}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      →
                    </p>

                    <p className="mt-1 text-sm text-white">
                      {shortenAddress(
                        execution.tokenOut,
                      )}
                    </p>
                  </td>

                  <td className="px-6 py-5 font-mono text-sm text-slate-300">
                    {execution.amountIn.toString()}
                  </td>

                  <td className="px-6 py-5 font-mono text-sm text-slate-300">
                    {execution.expectedAmountOut.toString()}
                  </td>

                  <td className="px-6 py-5 font-mono text-sm text-slate-300">
                    {formatProfit(
                      execution.expectedProfit,
                    )}
                  </td>

                  <td className="px-6 py-5 font-mono text-sm text-slate-300">
                    {formatProfit(
                      execution.gasCost,
                    )}
                  </td>

                  <td className="px-6 py-5 font-mono text-sm font-semibold text-emerald-400">
                    {formatProfit(
                      execution.netProfit,
                    )}
                  </td>

                  <td className="px-6 py-5">
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                      {execution.state}
                    </span>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {/* ==================================================
          Mobile Cards
          ================================================== */}

      <div className="space-y-4 p-4 md:hidden">
        {executions.map(
          (
            execution,
          ) => (
            <div
              key={
                execution.paperExecutionId
              }
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-white">
                    {shortenHash(
                      execution.paperExecutionId,
                    )}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Block {execution.blockNumber}
                  </p>
                </div>

                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                 {execution.state}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">
                    Token In
                  </p>

                  <p className="mt-1 font-mono text-xs text-slate-300">
                    {shortenAddress(
                      execution.tokenIn,
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Token Out
                  </p>

                  <p className="mt-1 font-mono text-xs text-slate-300">
                    {shortenAddress(
                      execution.tokenOut,
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Amount In
                  </p>

                  <p className="mt-1 font-mono text-xs text-slate-300">
                    {execution.amountIn.toString()}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Expected Out
                  </p>

                  <p className="mt-1 font-mono text-xs text-slate-300">
                    {execution.expectedAmountOut.toString()}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Gross Profit
                  </p>

                  <p className="mt-1 font-mono text-xs text-slate-300">
                    {formatProfit(
                      execution.expectedProfit,
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Gas
                  </p>

                  <p className="mt-1 font-mono text-xs text-slate-300">
                    {formatProfit(
                      execution.gasCost,
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-800 pt-4">
                <p className="text-xs text-slate-500">
                  Net Profit
                </p>

                <p className="mt-1 text-xl font-semibold text-emerald-400">
                  {formatProfit(
                    execution.netProfit,
                  )}
                </p>
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  )
}

// ======================================================
// Formatting Helpers
// ======================================================

function shortenHash(
  value: string,
): string {
  if (
    value.length <= 18
  ) {
    return value
  }

  return (
    `${value.slice(0, 10)}...` +
    `${value.slice(-8)}`
  )
}

function shortenAddress(
  value: string,
): string {
  if (
    value.length <= 12
  ) {
    return value
  }

  return (
    `${value.slice(0, 6)}...` +
    `${value.slice(-4)}`
  )
}

function formatProfit(
  value: bigint | undefined,
): string {
  if (
    value === undefined
  ) {
    return '—'
  }

  return value.toString()
}

export default PaperExecutionHistory