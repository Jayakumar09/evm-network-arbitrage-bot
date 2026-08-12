// ======================================================
// Contract Page
// Executor Contract Status
// Ethereum Sepolia
// ======================================================

import { useEffect, useState } from 'react'

import {
  EXECUTOR_CONTRACT_ADDRESS,
  NETWORK_NAME,
} from '../config/contracts'

import {
  getConnectedWalletAddress,
  getExecutorETHBalance,
  getExecutorOwner,
  getExecutorPaused,
  getExecutorUSDCBalance,
  getExecutorWETHBalance,
  getWalletETHBalance,
  getWalletUSDCBalance,
  getWalletWETHBalance,
} from '../services/blockchain'

// ======================================================
// Contract Page
// ======================================================

function ContractPage() {
  // ======================================================
  // Wallet State
  // ======================================================

  const [connectedWallet, setConnectedWallet] =
    useState<string | null>(null)

  const [contractOwner, setContractOwner] =
    useState<string>('')

  const [isOwner, setIsOwner] =
    useState(false)

  const [isPaused, setIsPaused] =
    useState(false)

  const [isConnected, setIsConnected] =
    useState(false)

  const [loading, setLoading] =
    useState(true)


  // ======================================================
  // Contract Balances
  // ======================================================

  const [ethBalance, setEthBalance] =
    useState('0.000000')

  const [usdcBalance, setUsdcBalance] =
    useState('0.00')

  const [wethBalance, setWethBalance] =
    useState('0.000000')


  // ======================================================
  // Wallet Balances
  // ======================================================


  const [walletEthBalance, setWalletEthBalance] =
    useState<string>('0.000000')

  const [walletUsdcBalance, setWalletUsdcBalance] =
    useState<string>('0.00')

  const [walletWethBalance, setWalletWethBalance] =
    useState<string>('0.000000')

  // ======================================================
  // Format Address
  // ======================================================

  function formatAddress(
    address: string | null,
  ): string {
    if (!address) {
      return 'Not connected'
    }

    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // ======================================================
  // Load Contract Data
  // ======================================================

  useEffect(() => {
  let mounted = true

  async function loadContractData() {
    try {
      setLoading(true)

      // --------------------------------------------------
      // Wallet
      // --------------------------------------------------

      const wallet =
        await getConnectedWalletAddress()

      if (!mounted) return

      setConnectedWallet(wallet)
      setIsConnected(wallet !== null)

      // --------------------------------------------------
      // Contract owner
      // --------------------------------------------------

      const owner =
        await getExecutorOwner()

      if (!mounted) return

      setContractOwner(owner)

      // --------------------------------------------------
      // Owner verification
      // --------------------------------------------------

      if (wallet) {
        setIsOwner(
          wallet.toLowerCase() ===
          owner.toLowerCase(),
        )
      } else {
        setIsOwner(false)
      }

      // --------------------------------------------------
      // Paused status
      // --------------------------------------------------

      const paused =
        await getExecutorPaused()

      if (!mounted) return

      setIsPaused(paused)

      // --------------------------------------------------
      // Contract + Wallet balances
      // --------------------------------------------------

      if (!wallet) {
        setEthBalance('0.000000')
        setUsdcBalance('0.00')
        setWethBalance('0.000000')

        setWalletEthBalance('0.000000')
        setWalletUsdcBalance('0.00')
        setWalletWethBalance('0.000000')

        return
      }

      const [
        eth,
        usdc,
        weth,
        walletEth,
        walletUsdc,
        walletWeth,
      ] = await Promise.all([
        // Executor contract
        getExecutorETHBalance(),
        getExecutorUSDCBalance(),
        getExecutorWETHBalance(),

        // Connected wallet
        getWalletETHBalance(),
        getWalletUSDCBalance(),
        getWalletWETHBalance(),
      ])

      if (!mounted) return

      // --------------------------------------------------
      // Executor Contract Balances
      // --------------------------------------------------

      setEthBalance(
        Number(eth).toFixed(6),
      )

      setUsdcBalance(
        Number(usdc).toFixed(2),
      )

      setWethBalance(
        Number(weth).toFixed(6),
      )

      // --------------------------------------------------
      // Connected Wallet Balances
      // --------------------------------------------------

      setWalletEthBalance(
        Number(walletEth).toFixed(6),
      )

      setWalletUsdcBalance(
        Number(walletUsdc).toFixed(2),
      )

      setWalletWethBalance(
        Number(walletWeth).toFixed(6),
      )

    } catch (error) {
      console.error(
        'Failed to load contract data:',
        error,
      )

      if (!mounted) return

      setConnectedWallet(null)
      setIsConnected(false)
      setIsOwner(false)

      setWalletEthBalance('0.000000')
      setWalletUsdcBalance('0.00')
      setWalletWethBalance('0.000000')

    } finally {
      if (mounted) {
        setLoading(false)
      }
    }
  }

  // --------------------------------------------------
  // Initial Load
  // --------------------------------------------------

  loadContractData()

  // --------------------------------------------------
  // MetaMask Event Handlers
  // --------------------------------------------------

  const ethereum = window.ethereum

  if (!ethereum) {
    return () => {
      mounted = false
    }
  }

  const handleAccountsChanged = () => {
    console.log(
      'MetaMask account changed. Reloading contract data...',
    )

    loadContractData()
  }

  const handleChainChanged = () => {
    console.log(
      'MetaMask network changed. Reloading contract data...',
    )

    loadContractData()
  }

  ethereum.on(
    'accountsChanged',
    handleAccountsChanged,
  )

  ethereum.on(
    'chainChanged',
    handleChainChanged,
  )

  // --------------------------------------------------
  // Cleanup
  // --------------------------------------------------

  return () => {
    mounted = false

    ethereum.removeListener(
      'accountsChanged',
      handleAccountsChanged,
    )

    ethereum.removeListener(
      'chainChanged',
      handleChainChanged,
    )
  }

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
              {EXECUTOR_CONTRACT_ADDRESS}
            </p>

          </div>


          {/* Network */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              Network
            </p>

            <p className="mt-2 text-sm font-semibold text-white">
              {NETWORK_NAME}
            </p>

          </div>


          {/* Contract Status */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              Contract Status
            </p>

            <p
              className={`mt-2 text-sm font-semibold ${
                isPaused
                  ? 'text-red-400'
                  : 'text-emerald-400'
              }`}
            >
              {loading
                ? 'Checking...'
                : isPaused
                  ? 'Paused'
                  : 'Active'}
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
          Wallet & Ownership
          ================================================== */}

      <section className="mb-6 rounded-xl border border-slate-800 bg-slate-950/60 p-6">

        <h2 className="mb-5 text-lg font-semibold text-white">
          Wallet & Ownership
        </h2>

        <div className="space-y-4">

          {/* Connected Wallet */}

          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-4">

            <span className="text-sm text-white">
              Connected Wallet
            </span>

            <span className="break-all font-mono text-sm font-semibold text-slate-300">
              {loading
                ? 'Checking...'
                : formatAddress(connectedWallet)}
            </span>

          </div>


          {/* Contract Owner */}

          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-4">

            <span className="text-sm text-white">
              Contract Owner
            </span>

            <span className="break-all font-mono text-sm font-semibold text-slate-300">
              {loading
                ? 'Checking...'
                : formatAddress(contractOwner)}
            </span>

          </div>


          {/* Authorization */}

          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-4">

            <span className="text-sm text-white">
              Owner Authorization
            </span>

            <span
              className={`text-sm font-semibold ${
                isOwner
                  ? 'text-emerald-400'
                  : 'text-red-400'
              }`}
            >
              {loading
                ? 'CHECKING...'
                : isOwner
                  ? 'OWNER'
                  : 'NOT OWNER'}
            </span>

          </div>

        </div>

      </section>


      {/* ==================================================
          Wallet Balances
          ================================================== */}

      <section className="mb-6 rounded-xl border border-emerald-500/20 bg-slate-950/60 p-6">

        <h2 className="mb-5 text-lg font-semibold text-white">
          Wallet Balances
        </h2>

        <div className="grid gap-4 md:grid-cols-3">

          {/* ETH */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              Wallet ETH
            </p>

            <p className="mt-2 text-2xl font-semibold text-white">
              {loading
                ? 'Loading...'
                : `${walletEthBalance} ETH`}
            </p>

          </div>


          {/* USDC */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              Wallet USDC
            </p>

            <p className="mt-2 text-2xl font-semibold text-white">
              {loading
                ? 'Loading...'
                : `${walletUsdcBalance} USDC`}
            </p>

          </div>


          {/* WETH */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              Wallet WETH
            </p>

            <p className="mt-2 text-2xl font-semibold text-white">
              {loading
                ? 'Loading...'
                : `${walletWethBalance} WETH`}
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

        <div className="grid gap-4 md:grid-cols-3">

          {/* ETH */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              ETH Balance
            </p>

            <p className="mt-2 text-2xl font-semibold text-white">
              {loading
                ? 'Loading...'
                : `${ethBalance} ETH`}
            </p>

          </div>


          {/* USDC */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              USDC Balance
            </p>

            <p className="mt-2 text-2xl font-semibold text-white">
              {loading
                ? 'Loading...'
                : `${usdcBalance} USDC`}
            </p>

          </div>


          {/* WETH */}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">

            <p className="text-xs uppercase tracking-wide text-slate-400">
              WETH Balance
            </p>

            <p className="mt-2 text-2xl font-semibold text-white">
              {loading
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

            <span
              className={`text-sm font-semibold ${
                isPaused
                  ? 'text-red-400'
                  : 'text-emerald-400'
              }`}
            >
              {loading
                ? 'CHECKING...'
                : isPaused
                  ? 'YES'
                  : 'NO'}
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
                isConnected
                  ? 'text-emerald-400'
                  : 'text-red-400'
              }`}
            >
              {loading
                ? 'CHECKING...'
                : isConnected
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