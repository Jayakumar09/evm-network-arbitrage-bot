// ======================================================
// Execution Page
// Ethereum Sepolia
// Production cleanup: execution debug console output removed.
// ======================================================

import {
  useEffect,
  useState,
} from 'react'

import {
  AbiCoder,
  isAddress,
  parseUnits,
  formatUnits,
} from 'ethers'

import { useNavigate } from 'react-router-dom'

import { useArbitrage } from '../context/ArbitrageContext'

import {
  executeFlashLoanArbitrage,
  simulateFlashLoanArbitrage,
  getConnectedWalletAddress,
  getExecutorOwner,
  getExecutorPaused,
  getFlashLoanTransactionResult,
} from '../services/blockchain'


import {
  USDC_ADDRESS,
  WETH_ADDRESS,
} from '../config/contracts'

import TransactionStatus from '../components/TransactionStatus'

import {
  saveTransaction,
} from '../services/transactionHistory'

// ==================================================
// Scanner Configuration
// ==================================================

const QUOTE_MAX_AGE_MS = 30_000

function isOpportunityQuoteStale(
  quoteTimestamp: number,
): boolean {
  return (
    Date.now() -
      quoteTimestamp >
    QUOTE_MAX_AGE_MS
  )
}


// ======================================================
// MetaMask User Rejection Detection
// ======================================================
//
// MetaMask uses RPC error code 4001 when the user cancels
// or rejects the transaction signature.
//
// ethers v6 can expose this as:
// - code: ACTION_REJECTED
// - reason: rejected
// - info.error.code: 4001
// - shortMessage: "user rejected action"
//
// A deliberate user cancellation is NOT a blockchain
// execution failure and must not be shown as an error.
// ======================================================

function isUserRejectedTransaction(
  error: unknown,
): boolean {

  if (
    !error ||
    typeof error !== 'object'
  ) {
    return false
  }


  const errorObject =
    error as Record<string, unknown>


  const code =
    errorObject.code


  const reason =
    errorObject.reason


  const shortMessage =
    errorObject.shortMessage


  const message =
    errorObject.message


  const info =
    errorObject.info


  const nestedInfo =
    info &&
    typeof info === 'object'
      ? info as Record<string, unknown>
      : null


  const nestedError =
    nestedInfo?.error &&
    typeof nestedInfo.error === 'object'
      ? nestedInfo.error as Record<string, unknown>
      : null


  const nestedCode =
    nestedError?.code


  return (
    code === 'ACTION_REJECTED' ||
    nestedCode === 4001 ||
    reason === 'rejected' ||
    (
      typeof shortMessage === 'string' &&
      shortMessage.toLowerCase().includes(
        'user rejected',
      )
    ) ||
    (
      typeof message === 'string' &&
      message.toLowerCase().includes(
        'user rejected',
      )
    )
  )
}



 

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
// Fetch ETH / USD Price
// ======================================================
//
// Purpose:
// - Fetch a live ETH/USD price for gas-cost accounting.
// - Never allow price-provider failure to break a
//   successfully confirmed blockchain transaction.
// - Return 0 when the external price service is unavailable.
// ======================================================

async function getEthUsdPrice(): Promise<number> {

  const PRICE_URL =
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'

  try {

    
    const response =
      await fetch(
        PRICE_URL,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          cache: 'no-store',
        },
      )

    if (!response.ok) {

      
      return 0
    }

    const data =
      await response.json()

    const ethUsdPrice =
      Number(
        data?.ethereum?.usd,
      )

    if (
      !Number.isFinite(
        ethUsdPrice,
      ) ||
      ethUsdPrice <= 0
    ) {

      
      return 0
    }

    
    return ethUsdPrice

  } catch (error) {

    // --------------------------------------------------
    // IMPORTANT:
    //
    // A price API failure must NEVER turn a successful
    // blockchain transaction into a failed execution.
    // --------------------------------------------------

    
    return 0
  }
}


// ======================================================
// Execution Page
// ======================================================

function ExecutionPage() {

  const navigate =
    useNavigate()


  const {
    opportunity,
    clearOpportunity,
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


  // ====================================================
  // Quote Age Refresh
  //
  // Force a re-render every second so the quote status
  // changes automatically from CURRENT to STALE after
  // QUOTE_MAX_AGE_MS without a browser refresh.
  // ====================================================

  const [, setQuoteAgeTick] =
    useState(0)


  // ====================================================
  // Flash Loan Execution Result
  // ====================================================

  const [
    flashLoanResult,
    setFlashLoanResult,
  ] = useState<
    Awaited<
      ReturnType<
        typeof getFlashLoanTransactionResult
      >
    > | null
  >(null)

  // ====================================================
// Confirmed Transaction Profit
// ====================================================
//
// Stores the REAL profit calculated from the
// confirmed blockchain transaction.
//
// Scanner estimated profit is intentionally NOT used
// here.
//

  const [
    confirmedProfit,
    setConfirmedProfit,
  ] = useState<{
    grossProfitUsdc: number
    aavePremiumUsdc: number
    netBeforeGasUsdc: number
    gasCostEth: number
    gasCostUsd: number
    netProfitUsdc: number | null
    ethUsdPrice: number
  } | null>(null)


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
  // Quote Age Refresh
  //
  // The opportunity quote is valid only for
  // QUOTE_MAX_AGE_MS (30 seconds).
  //
  // This timer only forces a React re-render.
  // It does NOT modify the opportunity or quote data.
  // ====================================================

  useEffect(() => {

    if (
      !opportunity?.quoteTimestamp
    ) {
      return
    }


    const timer =
      window.setInterval(() => {

        setQuoteAgeTick(
          (value) => value + 1,
        )

      }, 1000)


    return () => {

      window.clearInterval(
        timer,
      )
    }

  }, [
    opportunity?.quoteTimestamp,
  ])


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
            onClick={() => {
              clearOpportunity()
              navigate('/scanner')
            }}
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

  const quoteAgeMs =
  Date.now() -
  opportunity.quoteTimestamp

  const quoteIsStale =
    quoteAgeMs >
    QUOTE_MAX_AGE_MS




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
    // Mark execution as in-flight IMMEDIATELY.
    //
    // This disables both execute buttons for the whole
    // handler, so a rapid second click can never start a
    // second simulation or open MetaMask twice.
    // --------------------------------------------------

    setExecutionState(
      'WAITING_FOR_WALLET',
    )

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
        setExecutionState(
          'IDLE',
        )

        setExecutionError(
          'Connect the Executor owner wallet before execution.',
        )

        return
      }

      if (
        currentWallet.toLowerCase() !==
        currentOwner.toLowerCase()
      ) {
        setExecutionState(
          'IDLE',
        )

        setExecutionError(
          'Connected wallet is not the Executor owner.',
        )

        return
      }

      if (currentPaused) {
        setExecutionState(
          'IDLE',
        )

        setExecutionError(
          'Executor contract is currently paused.',
        )

        return
      }

    } catch (accessError) {

      console.error(
        'Failed to refresh executor access:',
        accessError,
      )


      setExecutionState(
        'IDLE',
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

      setExecutionState(
        'IDLE',
      )

      setExecutionError(
        'Opportunity is not profitable.',
      )

      return
    }

    // --------------------------------------------------
    // FRESH QUOTE CHECK
    //
    // IMPORTANT:
    // Do NOT rely only on the quoteIsStale value from
    // the React render.
    //
    // Recalculate the quote age at the exact moment
    // the user starts execution.
    // --------------------------------------------------

    // --------------------------------------------------
    // Re-check quote freshness immediately before execution
    // --------------------------------------------------

    const currentQuoteIsStale =
      isOpportunityQuoteStale(
        opportunity.quoteTimestamp,
      )



    // --------------------------------------------------
    // HARD SAFETY GATE
    // --------------------------------------------------

    if (currentQuoteIsStale) {

      setExecutionState(
        'FAILED',
      )

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
      // Pre-flight Simulation
      // ------------------------------------------------

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

        // ------------------------------------------------
        // HARD SAFETY GATE
        // ------------------------------------------------

        if (!simulationResult) {

          console.error(
            'Flash loan simulation failed:',
          )

          console.error(
            'Real transaction blocked by simulation.',
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
        // Simulation Passed
        // ------------------------------------------------

      } catch (simulationError) {

        console.error(
          'Flash loan simulation failed:',
          simulationError,
        )

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

      // ------------------------------------------------
      // FINAL QUOTE SAFETY CHECK
      //
      // The simulation itself takes time.
      //
      // Therefore the quote may become stale AFTER
      // simulation succeeds.
      //
      // Never submit the real transaction unless the
      // quote is still within the 30-second window.
      // ------------------------------------------------

      const finalQuoteIsStale =
        isOpportunityQuoteStale(
          opportunity.quoteTimestamp,
        )

      if (finalQuoteIsStale) {

        setExecutionState(
          'FAILED',
        )

        setExecutionError(
          'Opportunity quote became stale during simulation. Transaction was blocked. Scan again before execution.',
        )

        return
      }

      // ------------------------------------------------
      // Transaction Pending
      //
      // Only reach this point when:
      //
      // 1. Wallet is valid
      // 2. Executor owner is valid
      // 3. Contract is active
      // 4. Opportunity is profitable
      // 5. Initial quote is fresh
      // 6. Simulation succeeded
      // 7. Final quote is still fresh
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

      // ------------------------------------------------
      // Close Confirmation Dialog
      // ------------------------------------------------

      setShowConfirmation(
        false,
      )

    } catch (error) {

      // ----------------------------------------------------
      // MetaMask user cancellation
      //
      // IMPORTANT:
      // A user pressing Cancel / Reject in MetaMask is not
      // a failed blockchain transaction. No transaction hash
      // exists and no gas has been spent.
      //
      // Close the confirmation modal and return the page to
      // its normal IDLE state without showing an error.
      // ----------------------------------------------------

      if (
        isUserRejectedTransaction(
          error,
        )
      ) {

        setShowConfirmation(
          false,
        )

        setExecutionState(
          'IDLE',
        )

        setExecutionError(
          null,
        )

        return
      }


      // ----------------------------------------------------
      // Real execution error
      //
      // Keep the existing error handling for:
      // - simulation failures
      // - contract reverts
      // - RPC failures
      // - gas estimation failures
      // - transaction submission failures
      // ----------------------------------------------------

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
          // Opportunity must exist
          // --------------------------------------------------

          if (!opportunity) {

            console.error(
              'Cannot process confirmed transaction: opportunity is missing.',
            )

            return
          }


          // --------------------------------------------------
          // Keep stable opportunity reference
          // --------------------------------------------------

          const confirmedOpportunity =
            opportunity


          // --------------------------------------------------
          // Transaction hash must exist
          // --------------------------------------------------

          if (!transactionHash) {

            console.error(
              'Cannot process confirmed transaction: hash is missing.',
            )

            return
          }


          // --------------------------------------------------
          // Decode completed flash-loan transaction
          // --------------------------------------------------

          try {

            

            const result =
              await getFlashLoanTransactionResult(
                transactionHash,
              )


            // --------------------------------------------------
            // Store result for Execution page
            // --------------------------------------------------

            setFlashLoanResult(
              result,
            )


            // --------------------------------------------------
            // Debug result
            // --------------------------------------------------

            
            

            // ==================================================
            // SUCCESS TRANSACTION
            // ==================================================

            if (
              result.status === true
            ) {

              // ------------------------------------------------
              // Calculate Gross Profit
              //
              // arbitrageProfit is denominated in USDC.
              // ------------------------------------------------

              const grossProfitUsdc =
                Number(
                  formatUnits(
                    result.arbitrageProfit ?? 0n,
                    6,
                  ),
                )


              // ------------------------------------------------
              // Calculate Gas Cost
              //
              // gasCostWei is denominated in ETH.
              // ------------------------------------------------

              const gasCostEth =
                result.gasCostWei !== undefined
                  ? Number(
                      formatUnits(
                        result.gasCostWei,
                        18,
                      ),
                    )
                  : 0


              // --------------------------------------------------
              // Fetch current ETH/USD price
              // --------------------------------------------------

              const ethUsdPrice =
                await getEthUsdPrice()

              // ------------------------------------------------
              // Calculate Gas Cost in USD
              // ------------------------------------------------

              const gasCostUsd =
                ethUsdPrice > 0
                  ? gasCostEth * ethUsdPrice
                  : 0


              // ------------------------------------------------
              // Calculate Aave Premium
              //
              // arbitrageProfit returned by the Executor represents
              // the swap profit:
              //
              //   swap2AmountOut - flashLoanAmount
              //
              // The Aave premium is a separate repayment cost and
              // must therefore be deducted before calculating the
              // true net profit.
              // ------------------------------------------------

              const aavePremiumUsdc =
                Number(
                  formatUnits(
                    result.flashLoanPremium ?? 0n,
                    6,
                  ),
                )


              // ------------------------------------------------
              // Calculate Net Profit Before Gas
              //
              // Gross arbitrage profit
              // - Aave flash-loan premium
              // ------------------------------------------------

              const netBeforeGasUsdc =
                grossProfitUsdc -
                aavePremiumUsdc


              // ------------------------------------------------
              // Calculate True Net Profit
              //
              // Net before gas
              // - blockchain gas cost
              // ------------------------------------------------

              const netProfitUsdc =
                ethUsdPrice > 0
                  ? netBeforeGasUsdc - gasCostUsd
                  : null

                  // ------------------------------------------------
                  // Store REAL confirmed transaction profit
                  // ------------------------------------------------

                  setConfirmedProfit({
                    grossProfitUsdc,
                    aavePremiumUsdc,
                    netBeforeGasUsdc,
                    gasCostEth,
                    gasCostUsd,
                    netProfitUsdc,
                    ethUsdPrice,
                  })

              

              // ------------------------------------------------
              // Build SUCCESS transaction record
              // ------------------------------------------------

              const transactionRecord = {

                hash:
                  transactionHash,

                status:
                  'SUCCESS' as const,

                type:
                  'ARBITRAGE' as const,

                pair:
                  `${confirmedOpportunity.tokenIn} → ${confirmedOpportunity.tokenOut} → ${confirmedOpportunity.tokenIn}`,

                amount:
                  `${confirmedOpportunity.loanAmount} ${confirmedOpportunity.tokenIn}`,

                grossProfit:
                  `$${grossProfitUsdc.toFixed(6)}`,

                netProfit:
                  netProfitUsdc !== null
                    ? `$${netProfitUsdc.toFixed(6)}`
                    : '—',

                gas:
                  result.gasCostWei !== undefined
                    ? `${gasCostEth} ETH`
                    : '—',

                time:
                  new Date().toLocaleString(),
              }


              // ------------------------------------------------
              // Debug SUCCESS transaction record
              // ------------------------------------------------

              // ------------------------------------------------
              // Save SUCCESS transaction
              // ------------------------------------------------

              saveTransaction(
                transactionRecord,
              )


              // ------------------------------------------------
              // Verify localStorage
              // ------------------------------------------------

            } else {

              // ==================================================
              // FAILED TRANSACTION
              // ==================================================

              // ------------------------------------------------
              // Build FAILED transaction record
              //
              // No arbitrage profit is credited for a failed
              // operation.
              // ------------------------------------------------

              const failedTransactionRecord = {

                hash:
                  transactionHash,

                status:
                  'FAILED' as const,

                type:
                  'ARBITRAGE' as const,

                pair:
                  `${confirmedOpportunity.tokenIn} → ${confirmedOpportunity.tokenOut} → ${confirmedOpportunity.tokenIn}`,

                amount:
                  `${confirmedOpportunity.loanAmount} ${confirmedOpportunity.tokenIn}`,

                grossProfit:
                  '$0.000000',

                netProfit:
                  '$0.000000',

                gas:
                  result.gasCostWei !== undefined
                    ? `${formatUnits(
                        result.gasCostWei,
                        18,
                      )} ETH`
                    : '—',

                time:
                  new Date().toLocaleString(),
              }


              // ------------------------------------------------
              // Debug FAILED transaction record
              // ------------------------------------------------

              // ------------------------------------------------
              // Save FAILED transaction
              // ------------------------------------------------

              saveTransaction(
                failedTransactionRecord,
              )


              // ------------------------------------------------
              // Verify localStorage
              // ------------------------------------------------

              
                          }

          } catch (error) {

            // ==================================================
            // RESULT DECODING / PROCESSING ERROR
            // ==================================================

            console.error(
              'Failed to load confirmed transaction result:',
              error,
            )


            // --------------------------------------------------
            // Detailed error diagnostics
            // --------------------------------------------------

            if (
              error &&
              typeof error === 'object'
            ) {

              const errorObject =
                error as Record<string, unknown>


              console.error(
                '[EXECUTION RESULT] Error code:',
                errorObject.code,
              )

              console.error(
                '[EXECUTION RESULT] Error reason:',
                errorObject.reason,
              )

              console.error(
                '[EXECUTION RESULT] Error shortMessage:',
                errorObject.shortMessage,
              )

              console.error(
                '[EXECUTION RESULT] Error data:',
                errorObject.data,
              )

              console.error(
                '[EXECUTION RESULT] Error transaction:',
                errorObject.transaction,
              )

              console.error(
                '[EXECUTION RESULT] Error info:',
                errorObject.info,
              )
            }


            // --------------------------------------------------
            // Keep result unavailable
            // --------------------------------------------------

            setFlashLoanResult(
              null,
            )


            // --------------------------------------------------
            // Save FAILED transaction even when result decoding
            // fails.
            //
            // We know the blockchain transaction was confirmed,
            // but we could not decode the Executor result.
            // Therefore do NOT claim any profit.
            // --------------------------------------------------

            const failedTransactionRecord = {

              hash:
                transactionHash,

              status:
                'FAILED' as const,

              type:
                'ARBITRAGE' as const,

              pair:
                `${confirmedOpportunity.tokenIn} → ${confirmedOpportunity.tokenOut} → ${confirmedOpportunity.tokenIn}`,

              amount:
                `${confirmedOpportunity.loanAmount} ${confirmedOpportunity.tokenIn}`,

              grossProfit:
                '$0.000000',

              netProfit:
                '$0.000000',

              gas:
                '—',

              time:
                new Date().toLocaleString(),
            }

            

            // --------------------------------------------------
            // Save failed transaction
            // --------------------------------------------------

            saveTransaction(
              failedTransactionRecord,
            )


                      }


          // ====================================================
          // Refresh Executor Status
          // ====================================================

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


            setWalletAddress(
              wallet,
            )


            setIsOwner(
              wallet !== null &&
              wallet.toLowerCase() ===
                owner.toLowerCase(),
            )


            setIsPaused(
              paused,
            )

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
    quoteIsStale


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
              executionState === 'CONFIRMED'
                ? 'EXECUTED'
                : quoteIsStale
                  ? 'STALE'
                  : 'CURRENT'
            }
            valueClassName={
              executionState === 'CONFIRMED'
                ? 'text-emerald-400'
                : quoteIsStale
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
              {executionState === 'CONFIRMED'
                ? 'Confirmed Gross Profit'
                : 'Estimated Gross Profit'}
            </p>

            <p className="mt-2 text-xl font-semibold text-white">
              $
              {executionState === 'CONFIRMED' &&
              confirmedProfit
                ? confirmedProfit.grossProfitUsdc.toFixed(6)
                : opportunity.grossProfit}
            </p>

          </div>


          <div>

            <p className="text-xs uppercase tracking-wider text-slate-500">
              {executionState === 'CONFIRMED'
                ? 'True Net Profit'
                : 'Estimated Net Profit'}
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-400">
              $
              {executionState === 'CONFIRMED' &&
              confirmedProfit &&
              confirmedProfit.netProfitUsdc !== null
                ? confirmedProfit.netProfitUsdc.toFixed(6)
                : opportunity.estimatedNetProfit}
            </p>

          </div>


          <div>

            <p className="text-xs uppercase tracking-wider text-slate-500">
              {executionState === 'CONFIRMED'
                ? 'Confirmed Profit'
                : 'Estimated Profit'}
            </p>

            <p className="mt-2 text-xl font-semibold text-white">
              {executionState === 'CONFIRMED' &&
              confirmedProfit &&
              confirmedProfit.netProfitUsdc !== null &&
              Number(opportunity.loanAmount) > 0
                ? (
                    (
                      confirmedProfit.netProfitUsdc /
                      Number(opportunity.loanAmount)
                    ) * 100
                  ).toFixed(4)
                : opportunity.profitPercent}
              %
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
            passed={!quoteIsStale}
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
          Quote Stale Warning / Execution Error
          ================================================== */}

      {quoteIsStale &&
        executionState !== 'CONFIRMED' && (
          <section className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
            <p className="text-sm font-semibold text-red-400">
              Opportunity Quote Is Stale
            </p>

            <p className="mt-2 text-sm text-slate-300">
              Opportunity quote is stale. Scan again before execution.
            </p>
          </section>
        )}

      {executionError &&
        !quoteIsStale &&
        executionState !== 'CONFIRMED' && (
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
    Flash Loan Execution Result
    ================================================== */}

{executionState ===
  'CONFIRMED' &&
  flashLoanResult && (

  <section className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">

    {/* ==================================================
        Result Header
        ================================================== */}

    <div className="flex items-center justify-between gap-4">

      <div>

        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
          Execution Result
        </p>

        <h2 className="mt-1 text-2xl font-bold text-white">
          Flash Loan Completed ✓
        </h2>

      </div>

      <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
        SUCCESS
      </div>

    </div>


    {/* ==================================================
        Flash Loan Details
        ================================================== */}

    <div className="mt-6">

      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Flash Loan
      </p>

      <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">

        <div className="flex items-center justify-between gap-4">

          <span className="text-sm text-slate-400">
            Borrowed
          </span>

          <span className="text-sm font-semibold text-white">
            {formatUnits(
              flashLoanResult.flashLoanAmount ?? 0n,
              6,
            )}{' '}
            USDC
          </span>

        </div>


        <div className="flex items-center justify-between gap-4">

          <span className="text-sm text-slate-400">
            Aave Premium
          </span>

          <span className="text-sm font-semibold text-white">
            {formatUnits(
              flashLoanResult.flashLoanPremium ?? 0n,
              6,
            )}{' '}
            USDC
          </span>

        </div>


        <div className="flex items-center justify-between gap-4">

          <span className="text-sm text-slate-400">
            Required Repayment
          </span>

          <span className="text-sm font-semibold text-white">
            {formatUnits(
              (flashLoanResult.flashLoanAmount ?? 0n) +
                (flashLoanResult.flashLoanPremium ?? 0n),
              6,
            )}{' '}
            USDC
          </span>

        </div>

      </div>

    </div>


        {/* ==================================================
          Swap Results
          ================================================== */}

      <div className="mt-6">

        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Arbitrage Swaps
        </p>

        <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">

          <div className="flex items-center justify-between gap-4">

            <span className="text-sm text-slate-400">
              Swap #1
            </span>

            <span className="text-right text-sm font-semibold text-white">

              {formatUnits(
                flashLoanResult.swap1AmountIn ?? 0n,
                6,
              )}{' '}
              USDC

              <span className="mx-2 text-slate-600">
                →
              </span>

              {formatUnits(
                flashLoanResult.swap1AmountOut ?? 0n,
                18,
              )}{' '}
              WETH

            </span>

          </div>


          <div className="flex items-center justify-between gap-4">

            <span className="text-sm text-slate-400">
              Swap #2
            </span>

            <span className="text-right text-sm font-semibold text-white">

              {formatUnits(
                flashLoanResult.swap2AmountIn ?? 0n,
                18,
              )}{' '}
              WETH

              <span className="mx-2 text-slate-600">
                →
              </span>

              {formatUnits(
                flashLoanResult.swap2AmountOut ?? 0n,
                6,
              )}{' '}
              USDC

            </span>

          </div>

        </div>

      </div>


            {/* ==================================================
          Profit Result
          ================================================== */}

          <div className="mt-6">

            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Arbitrage Result
            </p>


            <div className="mt-3 space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">

              {/* ------------------------------------------------
                  Gross Arbitrage Profit
                  ------------------------------------------------ */}

              <div className="flex items-center justify-between gap-4">

                <span className="text-sm text-slate-400">
                  Gross Arbitrage Profit
                </span>

                <span className="text-sm font-bold text-emerald-400">
                  {formatUnits(
                    flashLoanResult.arbitrageProfit ?? 0n,
                    6,
                  )}{' '}
                  USDC
                </span>

              </div>


              {/* ------------------------------------------------
                  Aave Premium
                  ------------------------------------------------ */}

              <div className="flex items-center justify-between gap-4">

                <span className="text-sm text-slate-400">
                  Aave Premium
                </span>

                <span className="text-sm font-semibold text-amber-400">
                  {formatUnits(
                    flashLoanResult.flashLoanPremium ?? 0n,
                    6,
                  )}{' '}
                  USDC
                </span>

              </div>


              {/* ------------------------------------------------
                  Net Before Gas
                  ------------------------------------------------ */}

              <div className="flex items-center justify-between gap-4">

                <span className="text-sm text-slate-400">
                  Net Before Gas
                </span>

                <span className="text-sm font-semibold text-white">
                  {confirmedProfit
                    ? confirmedProfit.netBeforeGasUsdc.toFixed(6)
                    : '—'}{' '}
                  USDC
                </span>

              </div>


              {/* ------------------------------------------------
                  Actual Gas Cost
                  ------------------------------------------------ */}

              <div className="flex items-center justify-between gap-4">

                <span className="text-sm text-slate-400">
                  Actual Gas Cost
                </span>

                <span className="text-sm font-semibold text-amber-400">
                  {confirmedProfit
                    ? `$${confirmedProfit.gasCostUsd.toFixed(6)}`
                    : '—'}
                </span>

              </div>


              {/* ------------------------------------------------
                  TRUE NET PROFIT
                  ------------------------------------------------ */}

              <div className="mt-3 flex items-center justify-between gap-4 border-t border-emerald-500/20 pt-4">

                <span className="text-sm font-semibold text-white">
                  TRUE NET PROFIT
                </span>

                <span className="text-xl font-bold text-emerald-400">
                  {confirmedProfit &&
                  confirmedProfit.netProfitUsdc !== null
                    ? `$${confirmedProfit.netProfitUsdc.toFixed(6)}`
                    : '—'}
                </span>

              </div>


              {/* ------------------------------------------------
                  ETH/USD Used
                  ------------------------------------------------ */}

              {confirmedProfit && (
                <div className="flex items-center justify-between gap-4">

                  <span className="text-xs text-slate-500">
                    ETH/USD Used
                  </span>

                  <span className="text-xs font-semibold text-slate-400">
                    ${confirmedProfit.ethUsdPrice.toFixed(2)}
                  </span>

                </div>
              )}


              {/* ------------------------------------------------
                  Executor Balances
                  ------------------------------------------------ */}

              <div className="mt-3 border-t border-slate-800 pt-3">

                <div className="flex items-center justify-between gap-4">

                  <span className="text-sm text-slate-400">
                    Executor USDC
                  </span>

                  <span className="text-sm font-semibold text-emerald-400">
                    {flashLoanResult.executorUSDCBalance ?? '0'}{' '}
                    USDC
                  </span>

                </div>


                <div className="mt-3 flex items-center justify-between gap-4">

                  <span className="text-sm text-slate-400">
                    Executor WETH
                  </span>

                  <span className="text-sm font-semibold text-emerald-400">
                    {flashLoanResult.executorWETHBalance ?? '0'}{' '}
                    WETH
                  </span>

                </div>

              </div>

            </div>

          </div>


    {/* ==================================================
        Transaction Details
        ================================================== */}

    <div className="mt-6">

      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Transaction Details
      </p>

      <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">

        <div className="flex items-center justify-between gap-4">

          <span className="text-sm text-slate-400">
            Gas Used
          </span>

          <span className="text-sm font-semibold text-white">
            {flashLoanResult.gasUsed.toString()}
          </span>

        </div>


        <div className="flex items-center justify-between gap-4">

          <span className="text-sm text-slate-400">
            Gas Cost
          </span>

          <span className="text-sm font-semibold text-amber-400">
            {formatUnits(
              flashLoanResult.gasCostWei,
              18,
            )}{' '}
            ETH
          </span>

        </div>


        <div className="flex items-center justify-between gap-4">

          <span className="text-sm text-slate-400">
            Operation ID
          </span>

          <span className="text-sm font-semibold text-white">
            {(
          flashLoanResult.operationId ?? 0n
        ).toString()}
          </span>

        </div>


        <div className="flex items-center justify-between gap-4">

          <span className="text-sm text-slate-400">
            Operation Success
          </span>

          <span className="text-sm font-semibold text-emerald-400">
            {flashLoanResult.operationSuccess
              ? 'YES'
              : 'NO'}
          </span>

        </div>

      </div>

    </div>

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
    disabled={
      quoteIsStale
        ? false
        : executionDisabled
    }
    onClick={() => {
      if (quoteIsStale) {
        navigate('/scanner')
        return
      }
      setShowConfirmation(true)
    }}
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
            : quoteIsStale
              ? 'Quote Stale — Scan Again'
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