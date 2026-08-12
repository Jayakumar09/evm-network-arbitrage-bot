import { useEffect, useState } from 'react'
import { formatEther } from 'ethers'

import {
  EXECUTOR_CONTRACT_ADDRESS,
} from '../config/contracts'

// ======================================================
// Transaction Type
// ======================================================

type TransactionItem = {
  hash: string
  status: 'SUCCESS' | 'FAILED'
  type: 'ARBITRAGE' | 'ETH_DEPOSIT'
  pair: string
  amount: string
  grossProfit: string
  netProfit: string
  gas: string
  time: string
  from?: string
  to?: string
}

// ======================================================
// Blockscout Transaction Type
// ======================================================

type BlockscoutTransaction = {
  hash: string
  timestamp: string
  block_number: number
  status: string
  value: string
  from?: {
    hash: string
  }
  to?: {
    hash: string
  } | null
}

// ======================================================
// Blockscout Response
// ======================================================

type BlockscoutResponse = {
  items?: BlockscoutTransaction[]
}

// ======================================================
// Static Arbitrage Transactions
// ======================================================

const STATIC_ARBITRAGE_TRANSACTIONS:
  TransactionItem[] = [
    {
      hash: '0x8f3a...c921',
      status: 'SUCCESS',
      type: 'ARBITRAGE',
      pair: 'USDC → WETH → USDC',
      amount: '100 USDC',
      grossProfit: '$1.18',
      netProfit: '$0.38',
      gas: '$0.20',
      time: 'Today, 08:42 PM',
    },
    {
      hash: '0x71bc...a442',
      status: 'SUCCESS',
      type: 'ARBITRAGE',
      pair: 'USDC → WETH → USDC',
      amount: '250 USDC',
      grossProfit: '$2.95',
      netProfit: '$1.72',
      gas: '$0.24',
      time: 'Today, 07:18 PM',
    },
  ]

// ======================================================
// Storage
// ======================================================

const ETH_DEPOSIT_STORAGE_KEY =
  'executor_eth_deposit_transactions'

// ======================================================
// Blockscout Sepolia API
// ======================================================

const BLOCKSCOUT_API_URL =
  'https://eth-sepolia.blockscout.com/api/v2/addresses'

// ======================================================
// Automatic Refresh Interval
// ======================================================

const TRANSACTION_REFRESH_INTERVAL =
  10000

// ======================================================
// Format Address
// ======================================================

function formatAddress(
  address?: string,
): string {
  if (!address) {
    return '—'
  }

  if (address.length <= 14) {
    return address
  }

  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

// ======================================================
// Format Time
// ======================================================

function formatTransactionTime(
  timestamp: string,
): string {
  return new Date(
    timestamp,
  ).toLocaleString()
}

// ======================================================
// Read Stored ETH Deposits
// ======================================================

function getStoredEthDeposits():
  TransactionItem[] {
  try {
    const stored =
      localStorage.getItem(
        ETH_DEPOSIT_STORAGE_KEY,
      )

    if (!stored) {
      return []
    }

    const parsed =
      JSON.parse(stored)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
  } catch {
    return []
  }
}

// ======================================================
// Save ETH Deposits
// ======================================================

function saveEthDeposits(
  transactions: TransactionItem[],
): void {
  try {
    localStorage.setItem(
      ETH_DEPOSIT_STORAGE_KEY,
      JSON.stringify(
        transactions,
      ),
    )
  } catch {
    // Storage failure should not stop the page.
  }
}

// ======================================================
// Read Executor ETH Transactions
// ======================================================

async function getExecutorTransactions():
  Promise<TransactionItem[]> {

  const url =
    `${BLOCKSCOUT_API_URL}/${EXECUTOR_CONTRACT_ADDRESS}/transactions`

  const response =
    await fetch(url)

  if (!response.ok) {
    throw new Error(
      `Transaction history request failed: ${response.status}`,
    )
  }

  const data:
    BlockscoutResponse =
    await response.json()

  const items =
    Array.isArray(data.items)
      ? data.items
      : []

  const deposits:
    TransactionItem[] = []

  const executorAddress =
    EXECUTOR_CONTRACT_ADDRESS.toLowerCase()

  // ----------------------------------------------------
  // Find native ETH deposits to Executor
  // ----------------------------------------------------

  for (
    const transaction of items
  ) {

    if (
      transaction.status !==
      'ok'
    ) {
      continue
    }

    if (
      !transaction.value ||
      transaction.value === '0'
    ) {
      continue
    }

    const toAddress =
      transaction.to?.hash?.toLowerCase()

    if (
      toAddress !==
      executorAddress
    ) {
      continue
    }

    const ethAmount =
      formatEther(
        BigInt(
          transaction.value,
        ),
      )

    deposits.push({
      hash:
        transaction.hash,
      status:
        'SUCCESS',
      type:
        'ETH_DEPOSIT',
      pair:
        'ETH Deposit → Executor',
      amount:
        `${Number(ethAmount).toFixed(6)} ETH`,
      grossProfit:
        '—',
      netProfit:
        '—',
      gas:
        '—',
      time:
        formatTransactionTime(
          transaction.timestamp,
        ),
      from:
        transaction.from?.hash,
      to:
        EXECUTOR_CONTRACT_ADDRESS,
    })
  }

  return deposits
}

// ======================================================
// Merge And Deduplicate Transactions
// ======================================================

function mergeEthDeposits(
  blockchainDeposits:
    TransactionItem[],
): TransactionItem[] {

  const storedDeposits =
    getStoredEthDeposits()

  const allDeposits =
    [
      ...blockchainDeposits,
      ...storedDeposits,
    ]

  const uniqueTransactions =
    new Map<
      string,
      TransactionItem
    >()

  for (
    const transaction of allDeposits
  ) {

    const key =
      transaction.hash.toLowerCase()

    if (
      !uniqueTransactions.has(
        key,
      )
    ) {
      uniqueTransactions.set(
        key,
        transaction,
      )
    }
  }

  const merged =
    Array.from(
      uniqueTransactions.values(),
    )

  // ----------------------------------------------------
  // Newest first
  // ----------------------------------------------------

  merged.sort(
    (
      transactionA,
      transactionB,
    ) =>
      new Date(
        transactionB.time,
      ).getTime() -
      new Date(
        transactionA.time,
      ).getTime(),
  )

  saveEthDeposits(
    merged,
  )

  return merged
}

// ======================================================
// Transactions Page
// ======================================================

function TransactionsPage() {

  const [
    ethDeposits,
    setEthDeposits,
  ] = useState<TransactionItem[]>(
    () =>
      getStoredEthDeposits(),
  )

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState('')

  // ====================================================
  // Automatic Transaction Refresh
  // ====================================================

  useEffect(() => {

    let mounted = true
    let refreshRunning = false

    async function refreshTransactions() {

      // ------------------------------------------------
      // Prevent overlapping requests
      // ------------------------------------------------

      if (
        refreshRunning
      ) {
        return
      }

      refreshRunning = true

      try {

        const blockchainDeposits =
          await getExecutorTransactions()

        if (!mounted) {
          return
        }

        const mergedDeposits =
          mergeEthDeposits(
            blockchainDeposits,
          )

        setEthDeposits(
          mergedDeposits,
        )

        setError('')

      } catch (refreshError) {

        if (!mounted) {
          return
        }

        setError(
          refreshError instanceof Error
            ? refreshError.message
            : 'Unable to load Executor transactions.',
        )

        // ----------------------------------------------
        // Keep previously loaded transactions
        // ----------------------------------------------

        setEthDeposits(
          getStoredEthDeposits(),
        )

      } finally {

        refreshRunning =
          false

        if (mounted) {
          setLoading(false)
        }
      }
    }

    // --------------------------------------------------
    // Initial Refresh
    // --------------------------------------------------

    refreshTransactions()

    // --------------------------------------------------
    // Automatic Refresh Every 10 Seconds
    // --------------------------------------------------

    const refreshTimer =
      window.setInterval(
        refreshTransactions,
        TRANSACTION_REFRESH_INTERVAL,
      )

    // --------------------------------------------------
    // Refresh When Browser Gets Focus
    // --------------------------------------------------

    const handleWindowFocus =
      () => {
        refreshTransactions()
      }

    window.addEventListener(
      'focus',
      handleWindowFocus,
    )

    // --------------------------------------------------
    // Refresh When Page Becomes Visible
    // --------------------------------------------------

    const handleVisibilityChange =
      () => {

        if (
          document.visibilityState ===
          'visible'
        ) {
          refreshTransactions()
        }
      }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    // --------------------------------------------------
    // Cleanup
    // --------------------------------------------------

    return () => {

      mounted = false

      window.clearInterval(
        refreshTimer,
      )

      window.removeEventListener(
        'focus',
        handleWindowFocus,
      )

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
    }

  }, [])

  // ====================================================
  // Combine Transactions
  // ====================================================

  const transactions:
    TransactionItem[] = [
      ...ethDeposits,
      ...STATIC_ARBITRAGE_TRANSACTIONS,
    ]

  // ====================================================
  // Summary
  // ====================================================

  const totalTransactions =
    transactions.length

  const successfulTransactions =
    transactions.filter(
      (
        transaction,
      ) =>
        transaction.status ===
        'SUCCESS',
    ).length

  // ----------------------------------------------------
  // Only arbitrage transactions count toward profit
  // ----------------------------------------------------

  const totalNetProfit =
    transactions.reduce(
      (
        total,
        transaction,
      ) => {

        if (
          transaction.type !==
          'ARBITRAGE'
        ) {
          return total
        }

        const value =
          Number(
            transaction.netProfit
              .replace(
                '$',
                '',
              ),
          )

        if (
          Number.isNaN(
            value,
          )
        ) {
          return total
        }

        return total + value

      },
      0,
    )

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">

      {/* Page Header */}

      <div className="mb-8">

        <p className="mb-2 text-sm font-medium text-emerald-400">
          FLASH LOAN ARBITRAGE
        </p>

        <h1 className="text-4xl font-bold text-white">
          Transactions
        </h1>

        <p className="mt-3 text-slate-400">
          View previous arbitrage transactions and Executor management activity.
        </p>

      </div>

      {/* Error */}

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-400">
          Transaction history refresh failed:
          {' '}
          {error}
        </div>
      )}

      {/* Summary */}

      <div className="mb-6 grid gap-4 md:grid-cols-4">

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">

          <p className="text-xs uppercase tracking-wide text-slate-400">
            Total Transactions
          </p>

          <p className="mt-2 text-2xl font-semibold text-white">
            {loading
              ? '...'
              : totalTransactions}
          </p>

        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">

          <p className="text-xs uppercase tracking-wide text-slate-400">
            Successful
          </p>

          <p className="mt-2 text-2xl font-semibold text-emerald-400">
            {loading
              ? '...'
              : successfulTransactions}
          </p>

        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">

          <p className="text-xs uppercase tracking-wide text-slate-400">
            Total Net Profit
          </p>

          <p className="mt-2 text-2xl font-semibold text-emerald-400">
            ${totalNetProfit.toFixed(2)}
          </p>

        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">

          <p className="text-xs uppercase tracking-wide text-slate-400">
            Network
          </p>

          <p className="mt-2 text-lg font-semibold text-white">
            Ethereum Sepolia
          </p>

        </div>

      </div>

      {/* Transaction History */}

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">

        <div className="border-b border-slate-800 px-6 py-5">

          <h2 className="text-lg font-semibold text-white">
            Transaction History
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Arbitrage execution results and Executor management transactions.
          </p>

        </div>

        {/* Desktop Table */}

        <div className="hidden overflow-x-auto md:block">

          <table className="w-full text-left">

            <thead className="border-b border-slate-800 bg-slate-900/40">

              <tr>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Transaction
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Pair / Type
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Amount
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Gross Profit
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Net Profit
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Gas
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Status
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Time
                </th>

              </tr>

            </thead>

            <tbody>

              {transactions.map(
                (
                  transaction,
                ) => (

                  <tr
                    key={
                      transaction.hash
                    }
                    className="border-b border-slate-800/70 last:border-0 hover:bg-slate-900/30"
                  >

                    <td className="px-6 py-5">

                      <div>

                        <button
                          type="button"
                          className="font-mono text-sm text-emerald-400 hover:text-emerald-300"
                          title={
                            transaction.hash
                          }
                        >
                          {formatAddress(
                            transaction.hash,
                          )}
                        </button>

                        {transaction.type ===
                          'ETH_DEPOSIT' && (

                          <div className="mt-2 space-y-1 text-xs text-slate-500">

                            <div>
                              From:{' '}
                              <span className="font-mono text-slate-400">
                                {formatAddress(
                                  transaction.from,
                                )}
                              </span>
                            </div>

                            <div>
                              To:{' '}
                              <span className="font-mono text-slate-400">
                                {formatAddress(
                                  transaction.to,
                                )}
                              </span>
                            </div>

                          </div>
                        )}

                      </div>

                    </td>

                    <td className="px-6 py-5 text-sm text-white">
                      {transaction.pair}
                    </td>

                    <td className="px-6 py-5 text-sm text-white">
                      {transaction.amount}
                    </td>

                    <td className="px-6 py-5 text-sm font-semibold text-white">
                      {transaction.grossProfit}
                    </td>

                    <td className="px-6 py-5 text-sm font-semibold text-emerald-400">
                      {transaction.netProfit}
                    </td>

                    <td className="px-6 py-5 text-sm text-white">
                      {transaction.gas}
                    </td>

                    <td className="px-6 py-5">

                      <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                        {transaction.status}
                      </span>

                    </td>

                    <td className="whitespace-nowrap px-6 py-5 text-sm text-slate-300">
                      {transaction.time}
                    </td>

                  </tr>
                ),
              )}

            </tbody>

          </table>

        </div>

        {/* Mobile Cards */}

        <div className="space-y-4 p-4 md:hidden">

          {transactions.map(
            (
              transaction,
            ) => (

              <div
                key={
                  transaction.hash
                }
                className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"
              >

                <div className="flex items-center justify-between">

                  <button
                    type="button"
                    className="font-mono text-sm text-emerald-400"
                    title={
                      transaction.hash
                    }
                  >
                    {formatAddress(
                      transaction.hash,
                    )}
                  </button>

                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
                    {transaction.status}
                  </span>

                </div>

                {transaction.type ===
                  'ETH_DEPOSIT' && (

                  <div className="mt-3 space-y-1 text-xs text-slate-500">

                    <div>
                      From:{' '}
                      <span className="font-mono text-slate-400">
                        {formatAddress(
                          transaction.from,
                        )}
                      </span>
                    </div>

                    <div>
                      To:{' '}
                      <span className="font-mono text-slate-400">
                        {formatAddress(
                          transaction.to,
                        )}
                      </span>
                    </div>

                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">

                  <div>
                    <p className="text-xs text-slate-400">
                      Pair / Type
                    </p>

                    <p className="mt-1 text-white">
                      {transaction.pair}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Amount
                    </p>

                    <p className="mt-1 text-white">
                      {transaction.amount}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Gross Profit
                    </p>

                    <p className="mt-1 text-white">
                      {transaction.grossProfit}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Net Profit
                    </p>

                    <p className="mt-1 font-semibold text-emerald-400">
                      {transaction.netProfit}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Gas
                    </p>

                    <p className="mt-1 text-white">
                      {transaction.gas}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Time
                    </p>

                    <p className="mt-1 text-slate-300">
                      {transaction.time}
                    </p>
                  </div>

                </div>

              </div>
            ),
          )}

        </div>

      </section>

    </main>
  )
}

export default TransactionsPage