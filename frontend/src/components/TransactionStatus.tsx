// ======================================================
// Transaction Status
// Ethereum Sepolia
// ======================================================

import {
  useEffect,
  useState,
} from 'react'

import {
  getProvider,
} from '../services/blockchain'


// ======================================================
// Transaction State
// ======================================================

type TransactionState =
  | 'IDLE'
  | 'PENDING'
  | 'CONFIRMED'
  | 'FAILED'


// ======================================================
// Props
// ======================================================

interface TransactionStatusProps {
  transactionHash?: string | null

  onConfirmed?: () => void | Promise<void>

  pollingInterval?: number

  className?: string
}


// ======================================================
// Transaction Status
// ======================================================

function TransactionStatus({
  transactionHash,
  onConfirmed,
  pollingInterval = 3000,
  className = '',
}: TransactionStatusProps) {

  // ======================================================
  // State
  // ======================================================

  const [status, setStatus] =
    useState<TransactionState>('IDLE')

  const [error, setError] =
    useState<string | null>(null)


  // ======================================================
  // Monitor Transaction
  // ======================================================

  useEffect(() => {

    let mounted = true

    let timer:
      ReturnType<typeof setTimeout> | null = null


    // --------------------------------------------------
    // No Transaction
    // --------------------------------------------------

    if (!transactionHash) {
      setStatus('IDLE')
      setError(null)

      return () => {
        mounted = false
      }
    }


    // --------------------------------------------------
    // Start Pending State
    // --------------------------------------------------

    setStatus('PENDING')
    setError(null)


    // ==================================================
    // Check Transaction
    // ==================================================

    async function checkTransaction() {

      if (!transactionHash) {
        return
      }

      try {

        const provider =
          await getProvider()


        const hash = transactionHash

            if (!hash) {
            return
            }

            const receipt =
            await provider.getTransactionReceipt(
                hash,
            )


        // ------------------------------------------------
        // Transaction Still Pending
        // ------------------------------------------------

        if (!receipt) {

          if (!mounted) {
            return
          }


          setStatus('PENDING')


          timer = setTimeout(
            checkTransaction,
            pollingInterval,
          )

          return
        }


        // ------------------------------------------------
        // Transaction Confirmed
        // ------------------------------------------------

        if (receipt.status === 1) {

          if (!mounted) {
            return
          }


          setStatus('CONFIRMED')


          // ----------------------------------------------
          // Refresh Parent Data
          // ----------------------------------------------

          if (onConfirmed) {
            await onConfirmed()
          }


          return
        }


        // ------------------------------------------------
        // Transaction Failed
        // ------------------------------------------------

        if (!mounted) {
          return
        }


        setStatus('FAILED')

        setError(
          'Transaction reverted on the blockchain.',
        )

      } catch (transactionError) {

        console.error(
          'Failed to check transaction:',
          transactionError,
        )


        if (!mounted) {
          return
        }


        setError(
          transactionError instanceof Error
            ? transactionError.message
            : 'Failed to check transaction status.',
        )


        // ------------------------------------------------
        // Keep Checking
        // ------------------------------------------------

        timer = setTimeout(
          checkTransaction,
          pollingInterval,
        )
      }
    }


    checkTransaction()


    // ==================================================
    // Cleanup
    // ==================================================

    return () => {

      mounted = false

      if (timer) {
        clearTimeout(timer)
      }
    }

  }, [
    transactionHash,
    pollingInterval,
    onConfirmed,
  ])


  // ======================================================
  // IDLE
  // ======================================================

  if (
    !transactionHash ||
    status === 'IDLE'
  ) {
    return null
  }


  // ======================================================
  // Render Status
  // ======================================================

  return (
    <div
      className={[
        'rounded-lg border px-4 py-3',
        className,
      ].join(' ')}
    >

      {/* ==================================================
          Pending
          ================================================== */}

      {status === 'PENDING' && (
        <div className="flex items-center gap-3">

          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />

          <div>

            <p className="text-sm font-semibold text-amber-400">
              Transaction Pending
            </p>

            <p className="mt-1 break-all font-mono text-xs text-slate-500">
              {transactionHash}
            </p>

          </div>

        </div>
      )}


      {/* ==================================================
          Confirmed
          ================================================== */}

      {status === 'CONFIRMED' && (
        <div className="flex items-center gap-3">

          <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-400" />

          <div>

            <p className="text-sm font-semibold text-emerald-400">
              Transaction Confirmed
            </p>

            <p className="mt-1 break-all font-mono text-xs text-slate-500">
              {transactionHash}
            </p>

          </div>

        </div>
      )}


      {/* ==================================================
          Failed
          ================================================== */}

      {status === 'FAILED' && (
        <div className="flex items-start gap-3">

          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-red-400" />

          <div>

            <p className="text-sm font-semibold text-red-400">
              Transaction Failed
            </p>

            <p className="mt-1 break-all font-mono text-xs text-slate-500">
              {transactionHash}
            </p>

            {error && (
              <p className="mt-2 text-xs text-red-400">
                {error}
              </p>
            )}

          </div>

        </div>
      )}


      {/* ==================================================
          Error While Checking
          ================================================== */}

      {status === 'PENDING' && error && (
        <p className="mt-2 text-xs text-slate-500">
          Status check temporarily failed. Retrying automatically...
        </p>
      )}

    </div>
  )
}


export default TransactionStatus