// ======================================================
// Contract Page
// Executor Contract Status
// Ethereum Sepolia
// ======================================================

import { useEffect, useState } from 'react'

import {
  getExecutorUSDCBalance,
  getExecutorWETHBalance,
  getProvider,
} from '../services/blockchain'

// ======================================================
// Contract Page
// ======================================================

function ContractPage() {
  // ======================================================
  // State
  // ======================================================

  const [usdcBalance, setUsdcBalance] = useState('0.00')
  const [wethBalance, setWethBalance] = useState('0.000000')

  const [isConnected, setIsConnected] = useState(false)
  const [isSepolia, setIsSepolia] = useState(false)
  const [loadingBalances, setLoadingBalances] = useState(true)

  // ======================================================
  // Load Contract Data
  // ======================================================

  useEffect(() => {
    async function loadContractData() {
      try {
        setLoadingBalances(true)

        // --------------------------------------------------
        // Get browser provider
        // --------------------------------------------------

        const provider = await getProvider()

        // --------------------------------------------------
        // Check blockchain network
        // --------------------------------------------------

        const network = await provider.getNetwork()

        const sepoliaConnected =
          network.chainId === 11155111n

        setIsSepolia(sepoliaConnected)
        setIsConnected(true)

        // --------------------------------------------------
        // Get Executor Contract Balances
        // --------------------------------------------------

        if (sepoliaConnected) {
          const [usdc, weth] = await Promise.all([
            getExecutorUSDCBalance(),
            getExecutorWETHBalance(),
          ])

          // ------------------------------------------------
          // Format balances for display
          // ------------------------------------------------

          setUsdcBalance(
            Number(usdc).toFixed(2),
          )

          setWethBalance(
            Number(weth).toFixed(6),
          )
        }
      } catch (error) {
        console.error(
          'Failed to load contract data:',
          error,
        )

        setIsConnected(false)
        setIsSepolia(false)

        setUsdcBalance('0.00')
        setWethBalance('0.000000')
      } finally {
        setLoadingBalances(false)
      }
    }

    loadContractData()
  }, [])

  // ======================================================
  // Render
  // ======================================================

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">

      {/* ==================================================
          Page Header
          ================================================== */}

      <div className="mb-8">

        <p className="mb-2 text-sm font-medium text-emerald-400">
          FLASH LOAN ARBITRAGE
        </p>

        <div className="flex items-center justify-between gap-4">

          <div>

            <h1 className="text-4xl font-bold text-white">
              Executor Contract
            </h1>

            <p className="mt-3 text-slate-400">
              View executor contract status, network,
              balances, and operational information.
            </p>

          </div>

          <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400">

            <span className="h-2 w-2 rounded-full bg-emerald-400" />

            ACTIVE

          </span>

        </div>

      </div>


      {/* ==================================================
          Contract Information
          ================================================== */}

      <section className="mb-6 rounded-xl border border-slate-800 bg-slate-950/60 p-6">

        <h2 className="mb-5 text-lg font-semibold text-white">
          Contract Information
        </h2>

        <div className="grid gap-4 md:grid-cols-2">

          {/* Contract Address */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              Contract Address
            </p>

            <p className="mt-2 break-all font-mono text-sm text-white">
              0x4C03fBb92593331910249D628751B6F3aafdf25e
            </p>

          </div>


          {/* Network */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              Network
            </p>

            <p className="mt-2 text-sm font-semibold text-white">
              Ethereum Sepolia
            </p>

          </div>


          {/* Contract Status */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              Contract Status
            </p>

            <p className="mt-2 text-sm font-semibold text-emerald-400">
              Active
            </p>

          </div>


          {/* Execution Mode */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              Execution Mode
            </p>

            <p className="mt-2 text-sm font-semibold text-amber-400">
              Mock Execution
            </p>

          </div>

        </div>

      </section>


      {/* ==================================================
          Contract Balances
          ================================================== */}

      <section className="mb-6 rounded-xl border border-slate-800 bg-slate-950/60 p-6">

        <h2 className="mb-5 text-lg font-semibold text-white">
          Contract Balances
        </h2>

        <div className="grid gap-4 md:grid-cols-2">

          {/* USDC Balance */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              USDC Balance
            </p>

            <p className="mt-2 text-2xl font-semibold text-white">

              {loadingBalances
                ? 'Loading...'
                : `${usdcBalance} USDC`}

            </p>

          </div>


          {/* WETH Balance */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              WETH Balance
            </p>

            <p className="mt-2 text-2xl font-semibold text-white">

              {loadingBalances
                ? 'Loading...'
                : `${wethBalance} WETH`}

            </p>

          </div>

        </div>

      </section>


      {/* ==================================================
          Operational Status
          ================================================== */}

      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-6">

        <h2 className="mb-5 text-lg font-semibold text-white">
          Operational Status
        </h2>

        <div className="space-y-4">

          {/* Contract Paused */}

          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-4">

            <span className="text-sm text-white">
              Contract Paused
            </span>

            <span className="text-sm font-semibold text-emerald-400">
              NO
            </span>

          </div>


          {/* Flash Loan Execution */}

          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-4">

            <span className="text-sm text-white">
              Flash Loan Execution
            </span>

            <span className="text-sm font-semibold text-amber-400">
              MOCK
            </span>

          </div>


          {/* Blockchain Connection */}

          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-4">

            <span className="text-sm text-white">
              Blockchain Connection
            </span>

            <span
              className={`text-sm font-semibold ${
                isConnected && isSepolia
                  ? 'text-emerald-400'
                  : 'text-red-400'
              }`}
            >
              {loadingBalances
                ? 'CHECKING...'
                : isConnected && isSepolia
                  ? 'CONNECTED'
                  : 'NOT CONNECTED'}
            </span>

          </div>

        </div>

      </section>

    </main>
  )
}

// ======================================================
// Export
// ======================================================

export default ContractPage