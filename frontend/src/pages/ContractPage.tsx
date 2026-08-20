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
  emergencyPauseExecutor,
  emergencyUnpauseExecutor,
  getConnectedWalletAddress,
  getExecutorETHBalance,
  getExecutorOwner,
  getExecutorPaused,
  getExecutorUSDCBalance,
  getExecutorWETHBalance,
  getWalletETHBalance,
  getWalletUSDCBalance,
  getWalletWETHBalance,
  transferExecutorOwnership,
  withdrawExecutorETH,
} from '../services/blockchain'

import {
  saveTransaction,
} from '../services/transactionHistory'

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
  // Owner Controls
  // ======================================================

  const [ownerActionLoading, setOwnerActionLoading] =
    useState(false)

  const [ownerActionMessage, setOwnerActionMessage] =
    useState('')

  const [ownerActionError, setOwnerActionError] =
    useState('')

  const [newOwnerAddress, setNewOwnerAddress] =
    useState('')


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

    // ======================================================
  // Load Contract Data
  // ======================================================

  useEffect(() => {

    let mounted = true
    let refreshInProgress = false

    // ====================================================
    // Load Contract Data
    // ====================================================

    async function loadContractData(
        source: string = 'UNKNOWN',
        showLoading: boolean = false,
      ) {

      // --------------------------------------------------
      // Prevent overlapping refresh requests
      // --------------------------------------------------

      if (refreshInProgress) {

        console.log(
          '[CONTRACT DEBUG] Refresh skipped - previous refresh still running.',
        )

        return
      }

      refreshInProgress = true

      console.log(
        '====================================================',
      )

      console.log(
        `[CONTRACT DEBUG] Refresh START - source: ${source}`,
      )

      console.log(
        `[CONTRACT DEBUG] Time: ${new Date().toLocaleTimeString()}`,
      )

      console.log(
        '====================================================',
      )

      try {

        if (!mounted) {
          return
        }

       if (showLoading) {
          setLoading(true)
        }


        // --------------------------------------------------
        // Wallet
        // --------------------------------------------------

        console.log(
          '[CONTRACT DEBUG] Reading connected wallet...',
        )

        const wallet =
          await getConnectedWalletAddress()

        console.log(
          '[CONTRACT DEBUG] Connected wallet:',
          wallet,
        )

        if (!mounted) {
          return
        }

        setConnectedWallet(wallet)

        setIsConnected(
          wallet !== null,
        )


        // --------------------------------------------------
        // Contract Owner
        // --------------------------------------------------

        console.log(
          '[CONTRACT DEBUG] Reading contract owner...',
        )

        const owner =
          await getExecutorOwner()

        console.log(
          '[CONTRACT DEBUG] Contract owner:',
          owner,
        )

        if (!mounted) {
          return
        }

        setContractOwner(owner)


        // --------------------------------------------------
        // Owner Verification
        // --------------------------------------------------

        const ownerStatus =
          wallet !== null &&
          wallet.toLowerCase() ===
          owner.toLowerCase()

        console.log(
          '[CONTRACT DEBUG] Owner authorization:',
          ownerStatus,
        )

        setIsOwner(
          ownerStatus,
        )


        // --------------------------------------------------
        // Paused Status
        // --------------------------------------------------

        console.log(
          '[CONTRACT DEBUG] Reading contract paused status...',
        )

        const paused =
          await getExecutorPaused()

        console.log(
          '[CONTRACT DEBUG] Contract paused:',
          paused,
        )

        if (!mounted) {
          return
        }

        setIsPaused(paused)


        // --------------------------------------------------
        // No Wallet
        // --------------------------------------------------

        if (!wallet) {

          console.log(
            '[CONTRACT DEBUG] No wallet connected. Resetting balances.',
          )

          setEthBalance('0.000000')
          setUsdcBalance('0.00')
          setWethBalance('0.000000')

          setWalletEthBalance('0.000000')
          setWalletUsdcBalance('0.00')
          setWalletWethBalance('0.000000')

          return
        }


        // --------------------------------------------------
        // Read All Balances
        // --------------------------------------------------

        console.log(
          '[CONTRACT DEBUG] Reading blockchain balances...',
        )

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


        if (!mounted) {
          return
        }


        // --------------------------------------------------
        // Debug Raw Values
        // --------------------------------------------------

        console.log(
          '[CONTRACT DEBUG] Executor ETH:',
          eth,
        )

        console.log(
          '[CONTRACT DEBUG] Executor USDC:',
          usdc,
        )

        console.log(
          '[CONTRACT DEBUG] Executor WETH:',
          weth,
        )

        console.log(
          '[CONTRACT DEBUG] Wallet ETH:',
          walletEth,
        )

        console.log(
          '[CONTRACT DEBUG] Wallet USDC:',
          walletUsdc,
        )

        console.log(
          '[CONTRACT DEBUG] Wallet WETH:',
          walletWeth,
        )


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


        console.log(
          '[CONTRACT DEBUG] UI balances updated successfully.',
        )

      } catch (error) {

        console.error(
          '[CONTRACT DEBUG] Failed to load contract data:',
          error,
        )

        if (!mounted) {
          return
        }

        setConnectedWallet(null)
        setIsConnected(false)
        setIsOwner(false)

        setWalletEthBalance('0.000000')
        setWalletUsdcBalance('0.00')
        setWalletWethBalance('0.000000')

      }finally {

        refreshInProgress = false

        if (
          mounted &&
          showLoading
        ) {
          setLoading(false)
        }

        console.log(
          `[CONTRACT DEBUG] Refresh END - source: ${source}`,
        )
      }
    }


    // ====================================================
    // Initial Load
    // ====================================================

    console.log(
      '[CONTRACT DEBUG] ContractPage mounted.',
    )

    loadContractData(
        'INITIAL_LOAD',
        true,
      )


    // ====================================================
    // Automatic Refresh
    //
    // Refresh every 5 seconds.
    // This allows blockchain balance changes to appear
    // without pressing CTRL+R.
    // ====================================================

    const refreshInterval =
      window.setInterval(
        () => {

          console.log(
            '[CONTRACT DEBUG] Automatic 5-second refresh.',
          )

          loadContractData(
            'AUTO_REFRESH',
          )

        },
        5000,
      )


    // ====================================================
    // MetaMask Event Handlers
    // ====================================================

    const ethereum =
      window.ethereum


    if (!ethereum) {

      console.warn(
        '[CONTRACT DEBUG] MetaMask / window.ethereum not available.',
      )

      return () => {

        mounted = false

        window.clearInterval(
          refreshInterval,
        )

      }
    }


    // ----------------------------------------------------
    // Account Changed
    // ----------------------------------------------------

    const handleAccountsChanged =
      () => {

        console.log(
          '[CONTRACT DEBUG] MetaMask account changed.',
        )

        loadContractData(
          'METAMASK_ACCOUNT_CHANGED',
        )
      }


    // ----------------------------------------------------
    // Chain Changed
    // ----------------------------------------------------

    const handleChainChanged =
      () => {

        console.log(
          '[CONTRACT DEBUG] MetaMask network changed.',
        )

        loadContractData(
          'METAMASK_CHAIN_CHANGED',
        )
      }


    // ----------------------------------------------------
    // Window Focus
    // ----------------------------------------------------

    const handleWindowFocus =
      () => {

        console.log(
          '[CONTRACT DEBUG] Browser window focused - refreshing.',
        )

        loadContractData(
          'WINDOW_FOCUS',
        )
      }


    // ----------------------------------------------------
    // Page Visibility
    // ----------------------------------------------------

    const handleVisibilityChange =
      () => {

        if (
          document.visibilityState ===
          'visible'
        ) {

          console.log(
            '[CONTRACT DEBUG] Page became visible - refreshing.',
          )

          loadContractData(
            'PAGE_VISIBLE',
          )
        }
      }


    // ====================================================
    // Register Events
    // ====================================================

    ethereum.on(
      'accountsChanged',
      handleAccountsChanged,
    )

    ethereum.on(
      'chainChanged',
      handleChainChanged,
    )

    window.addEventListener(
      'focus',
      handleWindowFocus,
    )

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )


    // ====================================================
    // Cleanup
    // ====================================================

    return () => {

      console.log(
        '[CONTRACT DEBUG] ContractPage unmounted. Cleaning up.',
      )

      mounted = false

      window.clearInterval(
        refreshInterval,
      )

      ethereum.removeListener(
        'accountsChanged',
        handleAccountsChanged,
      )

      ethereum.removeListener(
        'chainChanged',
        handleChainChanged,
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


  // ======================================================
// Pause Executor
// ======================================================

async function handlePauseExecutor() {
  if (!isOwner) {
    return
  }

  try {
    setOwnerActionLoading(true)
    setOwnerActionMessage('')
    setOwnerActionError('')

    const transactionHash =
      await emergencyPauseExecutor()

    // --------------------------------------------------
    // Update frontend state immediately
    // Transaction has already been confirmed
    // --------------------------------------------------

    setIsPaused(true)

    setOwnerActionMessage(
      `Contract paused successfully. Transaction: ${transactionHash}`,
    )
  } catch (error) {
    console.error(
      'Failed to pause executor:',
      error,
    )

    setOwnerActionError(
      error instanceof Error
        ? error.message
        : 'Failed to pause contract.',
    )
  } finally {
    setOwnerActionLoading(false)
  }
}


// ======================================================
// Unpause Executor
// ======================================================

async function handleUnpauseExecutor() {
  if (!isOwner) {
    return
  }

  try {
    setOwnerActionLoading(true)
    setOwnerActionMessage('')
    setOwnerActionError('')

    const transactionHash =
      await emergencyUnpauseExecutor()

    // --------------------------------------------------
    // Update frontend state immediately
    // Transaction has already been confirmed
    // --------------------------------------------------

    setIsPaused(false)

    setOwnerActionMessage(
      `Contract unpaused successfully. Transaction: ${transactionHash}`,
    )
  } catch (error) {
    console.error(
      'Failed to unpause executor:',
      error,
    )

    setOwnerActionError(
      error instanceof Error
        ? error.message
        : 'Failed to unpause contract.',
    )
  } finally {
    setOwnerActionLoading(false)
  }
}


  // ======================================================
  // Withdraw Executor ETH
  // ======================================================

  async function handleWithdrawExecutorETH() {
    if (!isOwner || !connectedWallet) {
      return
    }

    try {
      setOwnerActionLoading(true)
      setOwnerActionMessage('')
      setOwnerActionError('')

      // --------------------------------------------------
      // Read Executor ETH balance BEFORE withdrawal
      // --------------------------------------------------

      const withdrawalAmount =
        await getExecutorETHBalance()

      console.log(
        '[CONTRACT DEBUG] ETH withdrawal amount:',
        withdrawalAmount,
      )

      // --------------------------------------------------
      // Execute withdrawal
      // --------------------------------------------------

      const transactionHash =
        await withdrawExecutorETH(
          connectedWallet,
        )

      // --------------------------------------------------
      // Save successful transaction
      // --------------------------------------------------

      saveTransaction({
        hash: transactionHash,
        status: 'SUCCESS',
        type: 'ETH_WITHDRAWAL',
        pair: 'Executor → Owner',
        amount: `${Number(withdrawalAmount).toFixed(6)} ETH`,
        grossProfit: '—',
        netProfit: '—',
        gas: '—',
        time: new Date().toLocaleString(),
      })

      // --------------------------------------------------
      // Refresh balances after transaction confirmation
      // --------------------------------------------------

      const [
        executorEth,
        walletEth,
      ] = await Promise.all([
        getExecutorETHBalance(),
        getWalletETHBalance(),
      ])

      setEthBalance(
        Number(executorEth).toFixed(6),
      )

      setWalletEthBalance(
        Number(walletEth).toFixed(6),
      )

      setOwnerActionMessage(
        `Executor ETH withdrawn successfully. Transaction: ${transactionHash}`,
      )
    } catch (error) {
      console.error(
        'Failed to withdraw executor ETH:',
        error,
      )

      setOwnerActionError(
        error instanceof Error
          ? error.message
          : 'Failed to withdraw Executor ETH.',
      )
    } finally {
      setOwnerActionLoading(false)
    }
  }

  // ======================================================
  // Transfer Ownership
  // ======================================================

  async function handleTransferOwnership() {
    if (!isOwner) {
      return
    }

    if (!newOwnerAddress.trim()) {
      setOwnerActionError(
        'Enter a new owner address.',
      )
      return
    }

    if (
      !/^0x[a-fA-F0-9]{40}$/.test(
        newOwnerAddress.trim(),
      )
    ) {
      setOwnerActionError(
        'Enter a valid Ethereum address.',
      )
      return
    }

    try {
      setOwnerActionLoading(true)
      setOwnerActionMessage('')
      setOwnerActionError('')

      const transactionHash =
        await transferExecutorOwnership(
          newOwnerAddress.trim(),
        )

      setOwnerActionMessage(
        `Ownership transferred successfully. Transaction: ${transactionHash}`,
      )

      const owner =
        await getExecutorOwner()

      setContractOwner(owner)

      const wallet =
        await getConnectedWalletAddress()

      setConnectedWallet(wallet)
      setIsConnected(wallet !== null)

      if (wallet) {
        setIsOwner(
          wallet.toLowerCase() ===
          owner.toLowerCase(),
        )
      } else {
        setIsOwner(false)
      }

      setNewOwnerAddress('')
    } catch (error) {
      console.error(
        'Failed to transfer ownership:',
        error,
      )

      setOwnerActionError(
        error instanceof Error
          ? error.message
          : 'Failed to transfer ownership.',
      )
    } finally {
      setOwnerActionLoading(false)
    }
  }


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

          <span
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              isPaused
                ? 'border border-red-500/20 bg-red-500/10 text-red-400'
                : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
            }`}
          >

            <span
              className={`h-2 w-2 rounded-full ${
                isPaused
                  ? 'bg-red-400'
                  : 'bg-emerald-400'
              }`}
            />

            {loading
              ? 'CHECKING...'
              : isPaused
                ? 'PAUSED'
                : 'ACTIVE'}

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
          Owner Controls
          ================================================== */}

      <section className="mb-6 rounded-xl border border-amber-500/20 bg-slate-950/60 p-6">

        <div className="mb-5 flex items-center justify-between gap-4">

          <div>
            <h2 className="text-lg font-semibold text-white">
              Owner Controls
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Emergency controls for the Executor contract.
            </p>
          </div>

          <span
            className={`rounded-lg px-3 py-1 text-xs font-semibold ${
              isOwner
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}
          >
            {loading
              ? 'CHECKING...'
              : isOwner
                ? 'OWNER'
                : 'READ ONLY'}
          </span>

        </div>


        {!isConnected && (
          <div className="mb-5 rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
            Connect the Executor owner wallet to use owner controls.
          </div>
        )}


        {isConnected && !isOwner && (
          <div className="mb-5 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            Connected wallet is not the Executor owner.
            Owner controls are read-only.
          </div>
        )}


        <div className="grid gap-4 md:grid-cols-2">

          {/* Pause */}

          <button
            type="button"
            onClick={handlePauseExecutor}
            disabled={
              !isOwner ||
              ownerActionLoading ||
              isPaused
            }
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ownerActionLoading
              ? 'Processing...'
              : isPaused
                ? 'Contract Already Paused'
                : 'Pause Contract'}
          </button>


          {/* Unpause */}

          <button
            type="button"
            onClick={handleUnpauseExecutor}
            disabled={
              !isOwner ||
              ownerActionLoading ||
              !isPaused
            }
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ownerActionLoading
              ? 'Processing...'
              : !isPaused
                ? 'Contract Already Active'
                : 'Unpause Contract'}
          </button>

        </div>


        {/* Withdraw ETH */}

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-5">

          <p className="text-xs uppercase tracking-wide text-slate-400">
            Withdraw Executor ETH
          </p>

          <p className="mt-2 text-sm text-slate-400">
            Withdraw the entire native ETH balance of the Executor to the connected owner wallet.
          </p>

          <button
            type="button"
            onClick={handleWithdrawExecutorETH}
            disabled={
              !isOwner ||
              ownerActionLoading ||
              isPaused ||
              !connectedWallet
            }
            className="mt-4 w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ownerActionLoading
              ? 'Processing...'
              : isPaused
                ? 'Contract Paused'
                : 'Withdraw All ETH to Owner Wallet'}
          </button>

        </div>


        {/* Transfer Ownership */}

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-5">

          <p className="text-xs uppercase tracking-wide text-slate-400">
            Transfer Ownership
          </p>

          <div className="mt-3 flex flex-col gap-3 md:flex-row">

            <input
              type="text"
              value={newOwnerAddress}
              onChange={(event) =>
                setNewOwnerAddress(
                  event.target.value,
                )
              }
              disabled={
                !isOwner ||
                ownerActionLoading
              }
              placeholder="0x..."
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-40"
            />

            <button
              type="button"
              onClick={handleTransferOwnership}
              disabled={
                !isOwner ||
                ownerActionLoading ||
                !newOwnerAddress.trim()
              }
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ownerActionLoading
                ? 'Processing...'
                : 'Transfer Ownership'}
            </button>

          </div>

        </div>


        {/* Success Message */}

        {ownerActionMessage && (
          <div className="mt-4 break-all rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
            {ownerActionMessage}
          </div>
        )}


        {/* Error Message */}

        {ownerActionError && (
          <div className="mt-4 break-all rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {ownerActionError}
          </div>
        )}

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