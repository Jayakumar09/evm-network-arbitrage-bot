// ======================================================
// Execution Page
// Ethereum Sepolia
// ======================================================

import {
  useEffect,
  useState,
} from 'react'

import {
  AbiCoder,
  isAddress,
  parseUnits,
} from 'ethers'

import { useNavigate } from 'react-router-dom'

import { useArbitrage } from '../context/ArbitrageContext'

import {
  executeFlashLoanArbitrage,
  simulateFlashLoanArbitrage,
  getConnectedWalletAddress,
  getExecutorOwner,
  getExecutorPaused,
} from '../services/blockchain'

import {
  USDC_ADDRESS,
  WETH_ADDRESS,
} from '../config/contracts'

import TransactionStatus from '../components/TransactionStatus'


// ======================================================
// Transaction State
// ======================================================

type ExecutionState =
  | 'IDLE'
  | 'WAITING_FOR_WALLET'
  | 'TRANSACTION_PENDING'
  | 'CONFIRMED'
  | 'FAILED'


// ======================================================
// Token Decimals
// ======================================================

function getTokenDecimals(
  tokenAddress: string,
): number {

  if (
    tokenAddress.toLowerCase() ===
    USDC_ADDRESS.toLowerCase()
  ) {
    return 6
  }


  if (
    tokenAddress.toLowerCase() ===
    WETH_ADDRESS.toLowerCase()
  ) {
    return 18
  }


  throw new Error(
    'Unsupported token. Only configured Sepolia USDC and WETH are currently supported.',
  )
}


// ======================================================
// Convert Decimal Token Amount
// ======================================================

function toTokenUnits(
  value: string | number,
  decimals: number,
): bigint {

  const normalized =
    String(value).trim()


  if (!normalized) {
    throw new Error(
      'Token amount is missing.',
    )
  }


  if (
    !/^\d+(\.\d+)?$/.test(
      normalized,
    )
  ) {
    throw new Error(
      `Invalid token amount: ${normalized}`,
    )
  }


  return parseUnits(
    normalized,
    decimals,
  )
}

// ======================================================
// Resolve Token Address
// Ethereum Sepolia
// ======================================================

function resolveTokenAddress(
  token: string,
): string {

  const normalizedToken =
    token.trim().toUpperCase()

  // ----------------------------------------------------
  // Already an Ethereum address
  // ----------------------------------------------------

  if (isAddress(token)) {
    return token
  }

  // ----------------------------------------------------
  // Configured Sepolia tokens
  // ----------------------------------------------------

  if (normalizedToken === 'USDC') {
    return USDC_ADDRESS
  }

  if (normalizedToken === 'WETH') {
    return WETH_ADDRESS
  }

  // ----------------------------------------------------
  // Unsupported token
  // ----------------------------------------------------

  throw new Error(
    `Unsupported token: ${token}. Only configured Sepolia USDC and WETH are currently supported.`,
  )
}


// ======================================================
// Build DEX Arbitrage Params
// ======================================================

function buildDexArbitrageParams(
  firstDex: number,
  tokenIn: string,
  tokenOut: string,
  uniFee: number,
  minOut1: string,
  minOut2: string,
  minProfit: string,
): string {

  // --------------------------------------------------
  // Validate Addresses
  // --------------------------------------------------

  if (!isAddress(tokenIn)) {
    throw new Error(
      'Invalid tokenIn address.',
    )
  }


  if (!isAddress(tokenOut)) {
    throw new Error(
      'Invalid tokenOut address.',
    )
  }


  // --------------------------------------------------
  // Validate DEX Direction
  // --------------------------------------------------

  if (
    firstDex !== 0 &&
    firstDex !== 1
  ) {
    throw new Error(
      'Invalid DEX route.',
    )
  }


  // --------------------------------------------------
  // Validate Uniswap Fee
  // --------------------------------------------------

  if (
    ![
      500,
      3000,
      10000,
    ].includes(uniFee)
  ) {
    throw new Error(
      'Invalid Uniswap V3 fee tier.',
    )
  }


  // --------------------------------------------------
  // Token Decimals
  //
  // minOut1  = tokenOut
  // minOut2  = tokenIn
  // minProfit = tokenIn
  // --------------------------------------------------

  const tokenInDecimals =
    getTokenDecimals(
      tokenIn,
    )


  const tokenOutDecimals =
    getTokenDecimals(
      tokenOut,
    )


  const minOut1Units =
    toTokenUnits(
      minOut1,
      tokenOutDecimals,
    )


  const minOut2Units =
    toTokenUnits(
      minOut2,
      tokenInDecimals,
    )


  const minProfitUnits =
    toTokenUnits(
      minProfit,
      tokenInDecimals,
    )


  // --------------------------------------------------
  // Encode operationData
  //
  // Solidity:
  //
  // (
  //   uint8 firstDex,
  //   address tokenIn,
  //   address tokenOut,
  //   uint24 uniFee,
  //   uint256 minOut1,
  //   uint256 minOut2,
  //   uint256 minProfit
  // )
  // --------------------------------------------------

  const abiCoder =
    AbiCoder.defaultAbiCoder()


  const operationData =
    abiCoder.encode(
      [
        'uint8',
        'address',
        'address',
        'uint24',
        'uint256',
        'uint256',
        'uint256',
      ],
      [
        firstDex,
        tokenIn,
        tokenOut,
        uniFee,
        minOut1Units,
        minOut2Units,
        minProfitUnits,
      ],
    )


  // --------------------------------------------------
  // Encode params
  //
  // Solidity:
  //
  // (
  //   uint8 operationType,
  //   bytes operationData
  // )
  //
  // DEX arbitrage:
  // operationType = 1
  // --------------------------------------------------

  return abiCoder.encode(
    [
      'uint8',
      'bytes',
    ],
    [
      1,
      operationData,
    ],
  )
}


// ======================================================
// Execution Page
// ======================================================

function ExecutionPage() {

  const navigate =
    useNavigate()


  const {
    opportunity,
  } = useArbitrage()


  // ====================================================
  // UI State
  // ====================================================

  const [
    showConfirmation,
    setShowConfirmation,
  ] = useState(false)


  const [
    executionState,
    setExecutionState,
  ] = useState<ExecutionState>('IDLE')


  const [
    transactionHash,
    setTransactionHash,
  ] = useState<string | null>(null)


  const [
    executionError,
    setExecutionError,
  ] = useState<string | null>(null)


  const [
    walletAddress,
    setWalletAddress,
  ] = useState<string | null>(null)


  const [
    isOwner,
    setIsOwner,
  ] = useState(false)


  const [
    isPaused,
    setIsPaused,
  ] = useState(false)


  const [
    checkingContract,
    setCheckingContract,
  ] = useState(true)


  // ====================================================
  // Load Executor Access
  // ====================================================

  useEffect(() => {

    let mounted = true


    async function loadExecutorAccess() {

      try {

        setCheckingContract(true)


        const [
          wallet,
          owner,
          paused,
        ] = await Promise.all([
          getConnectedWalletAddress(),
          getExecutorOwner(),
          getExecutorPaused(),
        ])


        if (!mounted) {
          return
        }


        setWalletAddress(wallet)

        setIsOwner(
          wallet !== null &&
          wallet.toLowerCase() ===
            owner.toLowerCase(),
        )


        setIsPaused(paused)

      } catch (error) {

        console.error(
          'Failed to load executor access:',
          error,
        )


        if (!mounted) {
          return
        }


        setWalletAddress(null)
        setIsOwner(false)
        setIsPaused(false)

      } finally {

        if (mounted) {
          setCheckingContract(false)
        }
      }
    }


    loadExecutorAccess()


    // --------------------------------------------------
    // MetaMask Account / Network Changes
    // --------------------------------------------------

    const ethereum =
      window.ethereum


    if (!ethereum) {

      return () => {
        mounted = false
      }
    }


    const handleAccountsChanged =
      () => {
        loadExecutorAccess()
      }


    const handleChainChanged =
      () => {
        loadExecutorAccess()
      }


    ethereum.on(
      'accountsChanged',
      handleAccountsChanged,
    )


    ethereum.on(
      'chainChanged',
      handleChainChanged,
    )


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


  // ====================================================
  // No Opportunity
  // ====================================================

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


  // ====================================================
  // DEX Names
  // ====================================================

  const firstDexName =
    opportunity.firstDex === 'UNISWAP_V3'
      ? 'Uniswap V3'
      : 'V2-Compatible DEX'


  const secondDexName =
    opportunity.secondDex === 'UNISWAP_V3'
      ? 'Uniswap V3'
      : 'V2-Compatible DEX'


  // ====================================================
  // Solidity firstDex
  //
  // 0 = Uniswap → V2
  // 1 = V2 → Uniswap
  // ====================================================

  const firstDex =
    opportunity.firstDex === 'UNISWAP_V3'
      ? 0
      : 1


  // ====================================================
  // Execute Arbitrage
  // ====================================================

        async function handleExecuteArbitrage() {

      // --------------------------------------------------
      // Opportunity Check
      // --------------------------------------------------

      if (!opportunity) {
        setExecutionError(
          'No arbitrage opportunity available.',
        )

        return
      }

      setExecutionError(null)

      // --------------------------------------------------
      // Wallet / Executor Access Check
      //
      // Refresh these values immediately before execution.
      // This prevents an account or network change after
      // the page was loaded from using stale access state.
      // --------------------------------------------------

      try {

        const [
          currentWallet,
          currentOwner,
          currentPaused,
        ] = await Promise.all([
          getConnectedWalletAddress(),
          getExecutorOwner(),
          getExecutorPaused(),
        ])

        setWalletAddress(currentWallet)
        setIsOwner(
          currentWallet !== null &&
          currentWallet.toLowerCase() ===
            currentOwner.toLowerCase(),
        )
        setIsPaused(currentPaused)

        if (!currentWallet) {
          setExecutionError(
            'Connect the Executor owner wallet before execution.',
          )

          return
        }

        if (
          currentWallet.toLowerCase() !==
          currentOwner.toLowerCase()
        ) {
          setExecutionError(
            'Connected wallet is not the Executor owner.',
          )

          return
        }

        if (currentPaused) {
          setExecutionError(
            'Executor contract is currently paused.',
          )

          return
        }

      } catch (accessError) {

        console.error(
          '[EXECUTION DEBUG] Failed to refresh executor access:',
          accessError,
        )

        setExecutionError(
          accessError instanceof Error
            ? `Executor access check failed: ${accessError.message}`
            : 'Executor access check failed.',
        )

        return
      }

      // --------------------------------------------------
      // Opportunity Checks
      // --------------------------------------------------

      if (!opportunity.isProfitable) {
        setExecutionError(
          'Opportunity is not profitable.',
        )

        return
      }

      if (opportunity.isStale) {
        setExecutionError(
          'Opportunity quote is stale. Scan again before execution.',
        )

        return
      }

      try {

        // ------------------------------------------------
        // Waiting for Wallet
        // ------------------------------------------------

        setExecutionState(
          'WAITING_FOR_WALLET',
        )

        setExecutionError(null)
        setTransactionHash(null)

        // ------------------------------------------------
        // Resolve Token Addresses
        //
        // opportunity.tokenIn / tokenOut may contain:
        //
        // USDC
        // WETH
        //
        // or actual Ethereum addresses.
        // ------------------------------------------------

        const tokenInAddress =
          resolveTokenAddress(
            opportunity.tokenIn,
          )

        const tokenOutAddress =
          resolveTokenAddress(
            opportunity.tokenOut,
          )

        // ------------------------------------------------
        // Token Validation
        // ------------------------------------------------

        if (
          !isAddress(
            tokenInAddress,
          )
        ) {
          throw new Error(
            'Token In is not a valid Ethereum address.',
          )
        }

        if (
          !isAddress(
            tokenOutAddress,
          )
        ) {
          throw new Error(
            'Token Out is not a valid Ethereum address.',
          )
        }

        if (
          tokenInAddress.toLowerCase() ===
          tokenOutAddress.toLowerCase()
        ) {
          throw new Error(
            'Token In and Token Out must be different.',
          )
        }

        // ------------------------------------------------
        // Token Decimals
        // ------------------------------------------------

        const tokenInDecimals =
          getTokenDecimals(
            tokenInAddress,
          )

        // ------------------------------------------------
        // Flash Loan Amount
        // ------------------------------------------------

        const amount =
          toTokenUnits(
            opportunity.loanAmount,
            tokenInDecimals,
          )

        if (amount <= 0n) {
          throw new Error(
            'Flash loan amount must be greater than zero.',
          )
        }

        // ------------------------------------------------
        // Build Flash Loan Parameters
        // ------------------------------------------------

        const params =
          buildDexArbitrageParams(
            firstDex,
            tokenInAddress,
            tokenOutAddress,
            opportunity.uniFee,
            opportunity.minOut1,
            opportunity.minOut2,
            opportunity.minProfit,
          )

        // ------------------------------------------------
        // Encoded Parameter Diagnostics
        // ------------------------------------------------

        console.log(
          '[EXECUTION DEBUG] Encoded params length:',
          params.length,
        )

        console.log(
          '[EXECUTION DEBUG] Encoded params:',
          params,
        )

        // ------------------------------------------------
        // Pre-flight simulation
        // ------------------------------------------------

        console.log(
          '==================================================',
        )

        console.log(
          '[EXECUTION DEBUG] Flash Loan Simulation START',
        )

        console.log(
          '[EXECUTION DEBUG] Token In:',
          opportunity.tokenIn,
        )

        console.log(
          '[EXECUTION DEBUG] Token Out:',
          opportunity.tokenOut,
        )

        console.log(
          '[EXECUTION DEBUG] Token In Decimals:',
          tokenInDecimals,
        )

        console.log(
          '[EXECUTION DEBUG] Loan Amount Raw:',
          amount.toString(),
        )

        console.log(
          '[EXECUTION DEBUG] Loan Amount Formatted:',
          opportunity.loanAmount,
        )

        console.log(
          '[EXECUTION DEBUG] First DEX:',
          firstDex,
        )

        console.log(
          '[EXECUTION DEBUG] Uni Fee:',
          opportunity.uniFee,
        )

        console.log(
          '[EXECUTION DEBUG] Minimum Output #1:',
          opportunity.minOut1,
        )

        console.log(
          '[EXECUTION DEBUG] Minimum Output #1 Raw:',
          toTokenUnits(
            opportunity.minOut1,
            getTokenDecimals(tokenOutAddress),
          ).toString(),
        )

        console.log(
          '[EXECUTION DEBUG] Minimum Output #2:',
          opportunity.minOut2,
        )

        console.log(
          '[EXECUTION DEBUG] Minimum Output #2 Raw:',
          toTokenUnits(
            opportunity.minOut2,
            tokenInDecimals,
          ).toString(),
        )

        console.log(
          '[EXECUTION DEBUG] Minimum Profit:',
          opportunity.minProfit,
        )

        console.log(
          '[EXECUTION DEBUG] Minimum Profit Raw:',
          toTokenUnits(
            opportunity.minProfit,
            tokenInDecimals,
          ).toString(),
        )

        console.log(
          '[EXECUTION DEBUG] Params:',
          params,
        )

               try {

          // ------------------------------------------------
          // Run pre-flight simulation
          //
          // simulateFlashLoanArbitrage() returns:
          //
          // true  = contract simulation succeeded
          // false = contract simulation reverted
          //
          // IMPORTANT:
          // Never continue to a real transaction when
          // simulation returns false.
          // ------------------------------------------------

          const simulationResult =
            await simulateFlashLoanArbitrage(
              tokenInAddress,
              amount,
              params,
            )

          console.log(
            '[EXECUTION DEBUG] Simulation result:',
            simulationResult,
          )

          // ------------------------------------------------
          // HARD SAFETY GATE
          // ------------------------------------------------

          if (!simulationResult) {

            console.error(
              '[EXECUTION DEBUG] Flash Loan Simulation FAILED',
            )

            console.error(
              '[EXECUTION DEBUG] Real transaction BLOCKED.',
            )

            setExecutionState(
              'FAILED',
            )

            setExecutionError(
              'Flash loan simulation failed. The transaction was blocked before MetaMask execution.',
            )

            return
          }

          // ------------------------------------------------
          // Simulation passed
          // ------------------------------------------------

          console.log(
            '[EXECUTION DEBUG] Flash Loan Simulation SUCCESS',
          )

          console.log(
            '[EXECUTION DEBUG] Simulation passed. Transaction may proceed.',
          )

        } catch (simulationError) {

          console.error(
            '[EXECUTION DEBUG] Flash Loan Simulation FAILED',
            simulationError,
          )

          // ------------------------------------------------
          // Extract detailed ethers error information
          // ------------------------------------------------

          if (
            simulationError &&
            typeof simulationError === 'object'
          ) {

            const error =
              simulationError as Record<string, unknown>

            console.error(
              '[EXECUTION DEBUG] Error code:',
              error.code,
            )

            console.error(
              '[EXECUTION DEBUG] Error reason:',
              error.reason,
            )

            console.error(
              '[EXECUTION DEBUG] Error shortMessage:',
              error.shortMessage,
            )

            console.error(
              '[EXECUTION DEBUG] Error data:',
              error.data,
            )

            console.error(
              '[EXECUTION DEBUG] Error transaction:',
              error.transaction,
            )

            console.error(
              '[EXECUTION DEBUG] Error info:',
              error.info,
            )
          }

          setExecutionState(
            'FAILED',
          )

          setExecutionError(
            simulationError instanceof Error
              ? `Simulation failed: ${simulationError.message}`
              : 'Flash loan simulation failed.',
          )

          return
        }

        console.log(
          '[EXECUTION DEBUG] Flash Loan Simulation END',
        )

        console.log(
          '==================================================',
        )

        // ------------------------------------------------
        // Transaction Pending
        //
        // The actual blockchain confirmation is handled
        // by TransactionStatus.tsx.
        // ------------------------------------------------

        setExecutionState(
          'TRANSACTION_PENDING',
        )

        // ------------------------------------------------
        // Execute Flash Loan Arbitrage
        // ------------------------------------------------

        const hash =
          await executeFlashLoanArbitrage(
            tokenInAddress,
            amount,
            params,
          )

        // ------------------------------------------------
        // Validate Transaction Hash
        // ------------------------------------------------

        if (!hash) {
          throw new Error(
            'Transaction was submitted but no transaction hash was returned.',
          )
        }

        // ------------------------------------------------
        // Save Transaction Hash
        //
        // TransactionStatus will now wait for the
        // blockchain confirmation.
        // ------------------------------------------------

        setTransactionHash(
          hash,
        )

        console.log(
          '[EXECUTION DEBUG] Transaction submitted:',
          hash,
        )

        // ------------------------------------------------
        // Close Confirmation Dialog
        // ------------------------------------------------

        setShowConfirmation(
          false,
        )

      } catch (error) {

        console.error(
          'Flash loan arbitrage execution failed:',
          error,
        )

        setExecutionState(
          'FAILED',
        )

        setExecutionError(
          error instanceof Error
            ? error.message
            : 'Flash loan arbitrage execution failed.',
        )
      }
    }


      // ====================================================
      // Transaction Confirmed
      // ====================================================

      async function handleTransactionConfirmed() {

        setExecutionState(
          'CONFIRMED',
        )


        // --------------------------------------------------
        // Refresh Executor Status
        // --------------------------------------------------

        try {

          const [
            wallet,
            owner,
            paused,
          ] = await Promise.all([
            getConnectedWalletAddress(),
            getExecutorOwner(),
            getExecutorPaused(),
          ])


          setWalletAddress(wallet)


          setIsOwner(
            wallet !== null &&
            wallet.toLowerCase() ===
              owner.toLowerCase(),
          )


          setIsPaused(paused)

        } catch (error) {

          console.error(
            'Failed to refresh executor status:',
            error,
          )
        }
      }


  // ====================================================
  // Execution Button Disabled
  // ====================================================

  const executionDisabled =
    checkingContract ||
    executionState ===
      'WAITING_FOR_WALLET' ||
    executionState ===
      'TRANSACTION_PENDING' ||
    executionState ===
      'CONFIRMED' ||
    !walletAddress ||
    !isOwner ||
    isPaused ||
    !opportunity.isProfitable ||
    opportunity.isStale


  // ====================================================
  // Render
  // ====================================================

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">

      {/* ==================================================
          Header
          ================================================== */}

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


      {/* ==================================================
          Live Execution Notice
          ================================================== */}

      <section className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">

        <div className="flex items-start gap-3">

          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />


          <div>

            <p className="font-semibold text-emerald-400">
              LIVE EXECUTION MODE
            </p>


            <p className="mt-1 text-sm text-slate-400">
              Confirming execution will submit the existing
              Executor flash-loan arbitrage transaction to
              Ethereum Sepolia through MetaMask.
            </p>

          </div>

        </div>

      </section>


      {/* ==================================================
          Access Status
          ================================================== */}

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">

        <h2 className="text-lg font-semibold text-white">
          Execution Access
        </h2>


        <div className="mt-5 grid gap-3 sm:grid-cols-3">

          <CheckItem
            label="Wallet Connected"
            passed={walletAddress !== null}
          />


          <CheckItem
            label="Executor Owner"
            passed={isOwner}
          />


          <CheckItem
            label="Contract Active"
            passed={!isPaused}
          />

        </div>


        {!walletAddress && (
          <p className="mt-4 text-sm text-amber-400">
            Connect the Executor owner wallet before execution.
          </p>
        )}


        {walletAddress && !isOwner && (
          <p className="mt-4 text-sm text-red-400">
            Connected wallet is not the Executor owner.
          </p>
        )}


        {isPaused && (
          <p className="mt-4 text-sm text-red-400">
            Executor contract is currently paused.
          </p>
        )}

      </section>


      {/* ==================================================
          Execution Review
          ================================================== */}

      <section className="mt-6 grid gap-6 lg:grid-cols-2">

        {/* ==================================================
            Route Information
            ================================================== */}

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


       {/* ==================================================
          Safety Parameters
          ================================================== */}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">

        <h2 className="text-lg font-semibold text-white">
          Safety Parameters
        </h2>

        <div className="mt-5 space-y-4">

          <ExecutionRow
            label="DEX #1 Expected Output"
            value={`${opportunity.amountOut1} ${opportunity.tokenOut}`}
          />

          <ExecutionRow
            label="DEX #1 Minimum Output"
            value={`${opportunity.minOut1} ${opportunity.tokenOut}`}
          />

          <ExecutionRow
            label="DEX #2 Expected Output"
            value={`${opportunity.amountOut2} ${opportunity.tokenIn}`}
          />

          <ExecutionRow
            label="DEX #2 Minimum Output"
            value={`${opportunity.minOut2} ${opportunity.tokenIn}`}
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


      {/* ==================================================
          Profit Summary
          ================================================== */}

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


      {/* ==================================================
          Execution Checks
          ================================================== */}

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
            label="Executor owner connected"
            passed={isOwner}
          />


          <CheckItem
            label="Executor contract active"
            passed={!isPaused}
          />

        </div>

      </section>


      {/* ==================================================
          Execution Error
          ================================================== */}

      {executionError && (

        <section className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-5">

          <p className="text-sm font-semibold text-red-400">
            Execution Error
          </p>


          <p className="mt-2 break-words text-sm text-slate-300">
            {executionError}
          </p>

        </section>
      )}


      {/* ==================================================
          Transaction Status
          ================================================== */}

      {transactionHash && (

        <section className="mt-6">

          <TransactionStatus
            transactionHash={transactionHash}
            onConfirmed={
              handleTransactionConfirmed
            }
          />

        </section>
      )}


      {/* ==================================================
          Action Buttons
          ================================================== */}

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
          disabled={executionDisabled}
          onClick={() =>
            setShowConfirmation(true)
          }
          className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {executionState ===
            'WAITING_FOR_WALLET'
            ? 'Waiting for MetaMask...'
            : executionState ===
                'TRANSACTION_PENDING'
              ? 'Transaction Pending...'
              : executionState ===
                  'CONFIRMED'
                ? 'Flash Loan Completed ✓'
                : executionState ===
                    'FAILED'
                  ? 'Retry Execution'
                  : 'Confirm & Execute'}
        </button>

      </div>


      {/* ==================================================
          Confirmation
          ================================================== */}

      {showConfirmation && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">

          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">

            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Live Transaction Confirmation
            </p>


            <h2 className="mt-2 text-2xl font-bold text-white">
              Confirm Arbitrage
            </h2>


            <p className="mt-3 text-sm text-slate-400">
              This transaction executes an atomic flash-loan
              arbitrage. If the minimum-profit condition is
              not satisfied on-chain, the transaction will
              revert.
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
                label="Estimated Net Profit"
                value={`$${opportunity.estimatedNetProfit}`}
                valueClassName="text-emerald-400"
              />

            </div>


            <p className="mt-5 text-xs leading-5 text-amber-400">
              Review all values carefully before confirming.
              This is an on-chain transaction and may revert
              if the execution conditions are no longer valid.
            </p>


            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

              <button
                type="button"
                onClick={() =>
                  setShowConfirmation(false)
                }
                className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>


              <button
                type="button"
                onClick={
                  handleExecuteArbitrage
                }
                disabled={
                  executionDisabled
                }
                className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirm Execution
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  )
}


// ======================================================
// Execution Row
// ======================================================

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
        className={`break-all text-right text-sm font-semibold ${valueClassName}`}
      >
        {value}
      </span>

    </div>
  )
}


// ======================================================
// Check Item
// ======================================================

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