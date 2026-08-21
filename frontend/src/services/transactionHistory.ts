// ======================================================
// Transaction History Service
// Frontend Transaction History
// ======================================================

const TRANSACTION_HISTORY_KEY =
  'flashloan_arbitrage_transaction_history'

const TRANSACTION_HISTORY_EVENT =
  'executorTransactionUpdated'

// ======================================================
// Transaction Type
// ======================================================

export type TransactionHistoryItem = {
  hash: string
  status: 'SUCCESS' | 'FAILED'
  type:
    | 'ARBITRAGE'
    | 'ETH_DEPOSIT'
    | 'ETH_WITHDRAWAL'
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
// Get Stored Transactions
// ======================================================

export function getStoredTransactions():
  TransactionHistoryItem[] {
  try {
    const stored =
      localStorage.getItem(
        TRANSACTION_HISTORY_KEY,
      )

    if (!stored) {
      return []
    }

    const transactions =
      JSON.parse(stored)

    if (!Array.isArray(transactions)) {
      return []
    }

    return transactions
  } catch (error) {
    console.error(
      '[TRANSACTION DEBUG] Failed to read transaction history:',
      error,
    )

    return []
  }
}

// ======================================================
// Save Transaction
// ======================================================

export function saveTransaction(
  transaction: TransactionHistoryItem,
): void {
  try {
    const existingTransactions =
      getStoredTransactions()

    // --------------------------------------------------
    // Prevent duplicate transaction hashes
    // --------------------------------------------------

    const alreadyExists =
      existingTransactions.some(
        (item) =>
          item.hash.toLowerCase() ===
          transaction.hash.toLowerCase(),
      )

    if (alreadyExists) {
      console.log(
        '[TRANSACTION DEBUG] Transaction already exists:',
        transaction.hash,
      )

      return
    }

    const updatedTransactions = [
      transaction,
      ...existingTransactions,
    ]

    localStorage.setItem(
      TRANSACTION_HISTORY_KEY,
      JSON.stringify(
        updatedTransactions,
      ),
    )

    // --------------------------------------------------
    // Notify TransactionsPage in the same browser tab
    // --------------------------------------------------

    window.dispatchEvent(
      new CustomEvent(
        TRANSACTION_HISTORY_EVENT,
      ),
    )

    console.log(
      '[TRANSACTION DEBUG] Transaction saved:',
      transaction,
    )
  } catch (error) {
    console.error(
      '[TRANSACTION DEBUG] Failed to save transaction:',
      error,
    )
  }
}

// ======================================================
// Subscribe To Transaction Updates
// ======================================================

export function subscribeToTransactionUpdates(
  callback: () => void,
): () => void {
  const handleTransactionUpdate =
    () => {
      callback()
    }

  const handleStorageChange =
    (event: StorageEvent) => {
      if (
        event.key ===
        TRANSACTION_HISTORY_KEY
      ) {
        callback()
      }
    }

  window.addEventListener(
    TRANSACTION_HISTORY_EVENT,
    handleTransactionUpdate,
  )

  window.addEventListener(
    'storage',
    handleStorageChange,
  )

  // --------------------------------------------------
  // Cleanup
  // --------------------------------------------------

  return () => {
    window.removeEventListener(
      TRANSACTION_HISTORY_EVENT,
      handleTransactionUpdate,
    )

    window.removeEventListener(
      'storage',
      handleStorageChange,
    )
  }
}