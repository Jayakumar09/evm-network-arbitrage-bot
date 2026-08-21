import {
  useEffect,
  useState,
} from 'react'

import {
  formatEther,
} from 'ethers'

import {
  getStoredTransactions,
  subscribeToTransactionUpdates,
} from '../services/transactionHistory'

import type {
  TransactionHistoryItem,
} from '../services/transactionHistory'

import {
  EXECUTOR_CONTRACT_ADDRESS,
} from '../config/contracts'


// ======================================================
// Transaction Type
// ======================================================

type TransactionItem =
  TransactionHistoryItem


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
// Storage
// ======================================================

const ETH_WITHDRAWAL_STORAGE_KEY =
  'executor_eth_withdrawal_transactions'


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
// Read Stored ETH Withdrawals
// ======================================================

function getStoredEthWithdrawals():
  TransactionItem[] {

  try {

    const stored =
      localStorage.getItem(
        ETH_WITHDRAWAL_STORAGE_KEY,
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
// Save ETH Withdrawals
// ======================================================

function saveEthWithdrawals(
  transactions: TransactionItem[],
): void {

  try {

    localStorage.setItem(
      ETH_WITHDRAWAL_STORAGE_KEY,
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
//
// Detect native ETH transactions SENT FROM the Executor.
// These represent ETH withdrawals / management activity.
//
// Normal contract calls with value = 0 are ignored.
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

  const withdrawals:
    TransactionItem[] = []

  const executorAddress =
    EXECUTOR_CONTRACT_ADDRESS.toLowerCase()


  // ----------------------------------------------------
  // Find native ETH withdrawals FROM Executor
  // ----------------------------------------------------

  for (
    const transaction of items
  ) {

    // ----------------------------------------------
    // Only successful transactions
    // ----------------------------------------------

    if (
      transaction.status !==
      'ok'
    ) {
      continue
    }


    // ----------------------------------------------
    // Ignore zero-value transactions
    // ----------------------------------------------

    if (
      !transaction.value ||
      transaction.value === '0'
    ) {
      continue
    }


    const fromAddress =
      transaction.from?.hash?.toLowerCase()


    // ----------------------------------------------
    // Must originate from Executor
    // ----------------------------------------------

    if (
      fromAddress !==
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


    withdrawals.push({

      hash:
        transaction.hash,

      status:
        'SUCCESS',

      type:
        'ETH_WITHDRAWAL',

      pair:
        'Executor → ETH Withdrawal',

      amount:
        `${ethAmount} ETH`,

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

    })
  }


  return withdrawals
}


// ======================================================
// Merge And Deduplicate ETH Withdrawals
// ======================================================

function mergeEthWithdrawals(
  blockchainWithdrawals:
    TransactionItem[],
): TransactionItem[] {

  const storedWithdrawals =
    getStoredEthWithdrawals()


  const allWithdrawals =
    [
      ...blockchainWithdrawals,
      ...storedWithdrawals,
    ]


  const uniqueTransactions =
    new Map<
      string,
      TransactionItem
    >()


  for (
    const transaction of allWithdrawals
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


  saveEthWithdrawals(
    merged,
  )


  return merged
}


// ======================================================
// Transactions Page
// ======================================================

function TransactionsPage() {

  // ====================================================
  // Stored Arbitrage Transactions
  // ====================================================

  const [
    arbitrageTransactions,
    setArbitrageTransactions,
  ] = useState<TransactionItem[]>(
    () =>
      getStoredTransactions(),
  )


  // ====================================================
  // Executor ETH Withdrawals
  // ====================================================

  const [
    ethWithdrawals,
    setEthWithdrawals,
  ] = useState<TransactionItem[]>(
    () =>
      getStoredEthWithdrawals(),
  )


  // ====================================================
  // Loading State
  // ====================================================

  const [
    loading,
    setLoading,
  ] = useState(true)


  // ====================================================
  // Error State
  // ====================================================

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


    // ==================================================
    // Refresh Stored Arbitrage History
    // ==================================================

    const refreshStoredTransactions =
      () => {

        if (!mounted) {
          return
        }

        const storedTransactions =
          getStoredTransactions()

        console.log(
          '[TRANSACTION PAGE] Stored arbitrage transactions:',
          storedTransactions,
        )

        setArbitrageTransactions(
          storedTransactions,
        )
      }


    // ==================================================
    // Refresh All Transactions
    // ==================================================

    async function refreshTransactions() {

      // ------------------------------------------------
      // Prevent overlapping refresh calls
      // ------------------------------------------------

      if (
        refreshRunning
      ) {
        return
      }

      refreshRunning =
        true


      try {

        // ----------------------------------------------
        // Refresh arbitrage history
        // ----------------------------------------------

        refreshStoredTransactions()


        // ----------------------------------------------
        // Refresh Executor ETH withdrawals
        // ----------------------------------------------

        const blockchainWithdrawals =
          await getExecutorTransactions()


        if (!mounted) {
          return
        }


        const mergedWithdrawals =
          mergeEthWithdrawals(
            blockchainWithdrawals,
          )


        setEthWithdrawals(
          mergedWithdrawals,
        )


        setError('')


      } catch (
        refreshError
      ) {

        if (!mounted) {
          return
        }


        console.error(
          '[TRANSACTION PAGE] Refresh failed:',
          refreshError,
        )


        setError(
          refreshError instanceof Error
            ? refreshError.message
            : 'Unable to load Executor transactions.',
        )


        // ----------------------------------------------
        // Keep stored data available
        // ----------------------------------------------

        setArbitrageTransactions(
          getStoredTransactions(),
        )


        setEthWithdrawals(
          getStoredEthWithdrawals(),
        )


      } finally {

        refreshRunning =
          false


        if (mounted) {

          setLoading(
            false,
          )
        }
      }
    }


    // ==================================================
    // Initial Refresh
    // ==================================================

    refreshTransactions()


    // ==================================================
    // New Arbitrage Transaction Listener
    //
    // ExecutionPage:
    //
    // saveTransaction()
    //        ↓
    // localStorage
    //        ↓
    // executorTransactionUpdated
    //        ↓
    // this callback
    //        ↓
    // UI refresh
    // ==================================================

    const unsubscribe =
      subscribeToTransactionUpdates(
        () => {

          console.log(
            '[TRANSACTION PAGE] New transaction update received.',
          )

          refreshStoredTransactions()

        },
      )


    // ==================================================
    // Automatic Refresh Every 10 Seconds
    // ==================================================

    const refreshTimer =
      window.setInterval(
        refreshTransactions,
        TRANSACTION_REFRESH_INTERVAL,
      )


    // ==================================================
    // Browser Focus
    // ==================================================

    const handleWindowFocus =
      () => {

        refreshTransactions()
      }


    window.addEventListener(
      'focus',
      handleWindowFocus,
    )


    // ==================================================
    // Page Visibility
    // ==================================================

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


    // ==================================================
    // Cleanup
    // ==================================================

    return () => {

      mounted =
        false


      window.clearInterval(
        refreshTimer,
      )


      unsubscribe()


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

  const transactions =
    [
      ...arbitrageTransactions,
      ...ethWithdrawals,
    ]


  // ====================================================
  // Deduplicate By Transaction Hash
  // ====================================================

  const uniqueTransactions =
    new Map<
      string,
      TransactionItem
    >()


  for (
    const transaction of transactions
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


  // ====================================================
  // Final Transaction List
  // ====================================================

  const mergedTransactions =
    Array.from(
      uniqueTransactions.values(),
    )


  // ====================================================
  // Newest First
  // ====================================================

  mergedTransactions.sort(
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


  // ====================================================
  // Summary
  // ====================================================

  const totalTransactions =
    mergedTransactions.length


  const successfulTransactions =
    mergedTransactions.filter(
      (
        transaction,
      ) =>
        transaction.status ===
        'SUCCESS',
    ).length


  // ====================================================
  // Total Net Profit
  //
  // Only ARBITRAGE transactions count.
  // ETH withdrawals do not affect arbitrage profit.
  // ====================================================

  const totalNetProfit =
    mergedTransactions.reduce(
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


  // ====================================================
  // Render
  // ====================================================

  return (

    <main className="mx-auto max-w-7xl px-6 py-10">

      {/* ==================================================
          Page Header
          ================================================== */}

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


      {/* ==================================================
          Error
          ================================================== */}

      {error && (

        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-400">

          Transaction history refresh failed:
          {' '}
          {error}

        </div>
      )}


      {/* ==================================================
          Summary
          ================================================== */}

      <div className="mb-6 grid gap-4 md:grid-cols-4">

        {/* Total Transactions */}

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


        {/* Successful */}

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


        {/* Net Profit */}

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">

          <p className="text-xs uppercase tracking-wide text-slate-400">
            Total Net Profit
          </p>


          <p className="mt-2 text-2xl font-semibold text-emerald-400">
            ${totalNetProfit.toFixed(2)}
          </p>

        </div>


        {/* Network */}

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">

          <p className="text-xs uppercase tracking-wide text-slate-400">
            Network
          </p>


          <p className="mt-2 text-lg font-semibold text-white">
            Ethereum Sepolia
          </p>

        </div>

      </div>


      {/* ==================================================
          Transaction History
          ================================================== */}

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">

        {/* Header */}

        <div className="border-b border-slate-800 px-6 py-5">

          <h2 className="text-lg font-semibold text-white">
            Transaction History
          </h2>


          <p className="mt-1 text-sm text-slate-400">
            Arbitrage execution results and Executor management transactions.
          </p>

        </div>


        {/* ==================================================
            Desktop Table
            ================================================== */}

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

              {mergedTransactions.map(
                (
                  transaction,
                ) => (

                  <tr
                    key={
                      transaction.hash
                    }
                    className="border-b border-slate-800/70 last:border-0 hover:bg-slate-900/30"
                  >

                    {/* Transaction */}

                    <td className="px-6 py-5">

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

                    </td>


                    {/* Pair / Type */}

                    <td className="px-6 py-5 text-sm text-white">
                      {transaction.pair}
                    </td>


                    {/* Amount */}

                    <td className="px-6 py-5 text-sm text-white">
                      {transaction.amount}
                    </td>


                    {/* Gross Profit */}

                    <td className="px-6 py-5 text-sm font-semibold text-white">
                      {transaction.grossProfit}
                    </td>


                    {/* Net Profit */}

                    <td className="px-6 py-5 text-sm font-semibold text-emerald-400">
                      {transaction.netProfit}
                    </td>


                    {/* Gas */}

                    <td className="px-6 py-5 text-sm text-white">
                      {transaction.gas}
                    </td>


                    {/* Status */}

                    <td className="px-6 py-5">

                      <span
                        className={
                          transaction.status ===
                          'SUCCESS'
                            ? 'inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400'
                            : 'inline-flex rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400'
                        }
                      >
                        {transaction.status}
                      </span>

                    </td>


                    {/* Time */}

                    <td className="whitespace-nowrap px-6 py-5 text-sm text-slate-300">
                      {transaction.time}
                    </td>

                  </tr>
                ),
              )}


              {/* Empty State */}

              {!loading &&
                mergedTransactions.length === 0 && (

                <tr>

                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center"
                  >

                    <p className="text-sm font-medium text-slate-300">
                      No transactions found.
                    </p>


                    <p className="mt-2 text-xs text-slate-500">
                      Completed arbitrage executions will appear here automatically.
                    </p>

                  </td>

                </tr>
              )}

            </tbody>

          </table>

        </div>


        {/* ==================================================
            Mobile Cards
            ================================================== */}

        <div className="space-y-4 p-4 md:hidden">

          {mergedTransactions.map(
            (
              transaction,
            ) => (

              <div
                key={
                  transaction.hash
                }
                className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"
              >

                {/* Header */}

                <div className="flex items-center justify-between gap-3">

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


                  <span
                    className={
                      transaction.status ===
                      'SUCCESS'
                        ? 'rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400'
                        : 'rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-400'
                    }
                  >
                    {transaction.status}
                  </span>

                </div>


                {/* Details */}

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


          {/* Mobile Empty State */}

          {!loading &&
            mergedTransactions.length === 0 && (

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center">

              <p className="text-sm font-medium text-slate-300">
                No transactions found.
              </p>


              <p className="mt-2 text-xs text-slate-500">
                Completed arbitrage executions will appear here automatically.
              </p>

            </div>
          )}

        </div>

      </section>

    </main>
  )
}


// ======================================================
// Export
// ======================================================

export default TransactionsPage