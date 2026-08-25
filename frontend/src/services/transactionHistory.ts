// ======================================================
// Transaction History Service
// Frontend Transaction History
// Ethereum Sepolia
//
// IMPORTANT:
// Transaction history is now scoped to:
//
//     Network + Executor + Wallet
//
// This prevents Account 1 and Test Account from sharing
// the same browser localStorage transaction history.
//
// Existing legacy history is migrated ONCE to the
// currently connected wallet.
//
// Historical ARBITRAGE records are additionally
// RECONCILED once against the blockchain: every retained
// arbitrage record must have a real successful on-chain
// ArbitrageProfit event, and its chain-derived fields are
// rewritten from that event.
// ======================================================


import {
  formatUnits,
  Interface,
} from 'ethers'

import {
  getFlashLoanTransactionResult,
  getProvider,
} from './blockchain'


// ======================================================
// Base Storage Configuration
// ======================================================

const TRANSACTION_HISTORY_BASE_KEY =
  'flashloan_arbitrage_transaction_history'


const TRANSACTION_HISTORY_EVENT =
  'executorTransactionUpdated'


// ======================================================
// Current Deployed Executor
// Ethereum Sepolia
// ======================================================

const EXECUTOR_ADDRESS =
  '0x33f10323b54A26a6b9e10B1279424508dB065d9d'


// ======================================================
// Legacy Storage Key
//
// This was the old global transaction-history key:
//
// flashloan_arbitrage_transaction_history
//
// We keep it temporarily so existing transactions are
// not lost during migration.
// ======================================================

const LEGACY_TRANSACTION_HISTORY_KEY =
  TRANSACTION_HISTORY_BASE_KEY


// ======================================================
// Wallet History Migration (v4)
//
// v3 copied the legacy global history wholesale into the
// wallet-scoped history.
//
// v4 keeps the one-time behaviour but ONLY imports
// records whose hashes are not already present in the
// wallet-scoped history. This prevents duplicates when a
// legacy key overlaps already reconciled data.
//
// The old global key is intentionally NOT deleted here.
// ======================================================

const WALLET_HISTORY_MIGRATION_KEY =
  'flashloan_arbitrage_transaction_history_wallet_v4_migrated'


// ======================================================
// Chain Reconciliation Migration
//
// One-time, versioned migration that validates every
// stored ARBITRAGE record against its on-chain receipt
// and rewrites the chain-derived fields from the
// authoritative Executor events.
//
// A deterministic backup of the pre-migration history is
// written once before anything is modified.
// ======================================================

// ------------------------------------------------------
// V3 RECONCILIATION
//
// History of this project spans TWO Executor deployments.
// The canonical wallet-history storage key is UNCHANGED
// (chainId + current executor + wallet). The known
// executor list below is RECONCILIATION SCOPE ONLY — it
// never participates in the storage key, so existing
// records can never be stranded by a key change.
//
// v1 flag: committed prematurely against an empty dataset
//          (inert).
// v2 flag: validated with a current-executor-only decoder,
//          misclassified 3 genuine OLD-executor trades as
//          "legacy-era" and could not see 4 missing trades
//          (inert).
//
// v3 performs:
//   Phase 1 — emitter-aware validation/rewrite of every
//             stored ARBITRAGE record against BOTH known
//             deployments.
//   Phase 2 — chain backfill of the four authoritative
//             arbitrage executions missing from storage.
//
// All-or-nothing: storage is written and the v3 flag is
// committed only when the final dataset is verified to
// contain exactly 23 valid records (6 old + 17 current),
// zero duplicates, zero unresolved chain lookups.
// ------------------------------------------------------

const TRANSACTION_RECONCILE_MIGRATION_KEY =
  'flashloan_arbitrage_transaction_history_reconcile_v3_migrated'


const RECONCILE_BACKUP_SUFFIX =
  '_backup_reconcile_v1'


const RECONCILE_V3_BACKUP_SUFFIX =
  '_backup_reconcile_v3'


// ======================================================
// Known Executor Deployments (reconciliation scope)
// ======================================================

const CURRENT_EXECUTOR_DEPLOYMENT =
  EXECUTOR_ADDRESS.toLowerCase()

const OLD_EXECUTOR_DEPLOYMENT =
  '0x3ae7c844cae182bbb7dfe31cee3c4c1b729160d2'

const KNOWN_EXECUTOR_DEPLOYMENTS = new Set<string>(
  [
    CURRENT_EXECUTOR_DEPLOYMENT,

    OLD_EXECUTOR_DEPLOYMENT,
  ],
)


// Expected authoritative composition after v3.

const EXPECTED_TOTAL_ARBITRAGE_RECORDS =
  23

const EXPECTED_OLD_EXECUTOR_RECORDS =
  6

const EXPECTED_CURRENT_EXECUTOR_RECORDS =
  17


// ======================================================
// Authoritative executions proven on-chain but ABSENT
// from stored history. Values are never fabricated here —
// each hash is fully re-derived from its receipt/events
// during Phase 2. These are only the lookup list.
// ======================================================

const MISSING_AUTHORITATIVE_HASHES = [

  // Old executor op 3
  '0x971371de9bd941d29be13342e74a910376c7005ac6f82593a2a2c4bbb7c5a0f7',

  // Old executor op 4
  '0xe1a13715f9cad5badc84a971c9b0c6579cc383337d6cf0c95759b441044afda4',

  // Old executor op 5
  '0x43ef5a82d83783ee43b36796a5a89291504b800717495ebfced1ace2407eb8b5',

  // Current executor op 3
  '0x5844e5b969dbc1dd79e9e4f4eb96b6ce87f503c344b57c30de12a2a7cb2f5cd3',

]


// ======================================================
// Executor Event Interface (shared by BOTH deployments)
//
// Both contract versions emit identical event signatures;
// ethers decodes positionally against these fragments, so
// one interface serves both. Emitter routing happens via
// transaction.to / log.address — never via a single
// hard-coded executor scope.
// ======================================================

const RECONCILE_EVENT_ABI = [

  'event FlashLoanExecuted(address indexed asset, uint256 amount, uint256 premium)',

  'event SwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',

  'event ArbitrageProfit(address indexed asset, uint256 amountBorrowed, uint256 profit)',

  'event OperationCompleted(uint256 indexed operationId, bool success)',

]

const RECONCILE_EVENT_INTERFACE =
  new Interface(RECONCILE_EVENT_ABI)


// ======================================================
// Historical Aave Premium Migration
// ======================================================

const TRANSACTION_HISTORY_MIGRATION_KEY =
  'flashloan_arbitrage_transaction_history_v2_migrated'


// ======================================================
// Transaction Type
// ======================================================

export type TransactionHistoryItem = {

  hash: string

  status:
    | 'SUCCESS'
    | 'FAILED'
    | 'PENDING'

  type:
    | 'ETH_WITHDRAWAL'
    | 'ETH_DEPOSIT'
    | 'ARBITRAGE'
    | 'TOKEN_WITHDRAWAL'

  pair: string

  amount: string

  grossProfit: string

  netProfit: string

  gas: string

  time: string

  from?: string

  to?: string

  // --------------------------------------------------
  // Set by the chain reconciliation migration.
  //
  // A reconciled record already contains exact on-chain
  // values (including the Aave premium), so later value
  // migrations must never touch it again.
  // --------------------------------------------------

  reconciled?: boolean

  // --------------------------------------------------
  // V3 reconciliation provenance.
  //
  // reconciliationSource 'CHAIN_BACKFILL' marks records
  // reconstructed entirely from on-chain receipt/events
  // (they were missing from storage).
  //
  // executorAddress records WHICH known Executor
  // deployment emitted the arbitrage events, since the
  // project spans two deployments.
  // --------------------------------------------------

  reconciliationSource?: string

  executorAddress?: string
}


// ======================================================
// Get Current MetaMask Wallet
// ======================================================
//
// We intentionally use selectedAddress first because it
// is synchronously available in MetaMask after connection.
//
// If it is unavailable, we fall back to eth_accounts.
//
// The fallback is synchronous only when MetaMask exposes
// selectedAddress. Otherwise the legacy key is used until
// the wallet becomes available and the page refreshes.
// ======================================================

function getCurrentWalletAddress():
  string | null {

  try {

    const ethereum =
      window.ethereum as
      | {
          selectedAddress?: string | null
        }
      | undefined


    if (
      ethereum?.selectedAddress
    ) {

      return (
        ethereum.selectedAddress
          .toLowerCase()
      )
    }

  } catch (error) {

    console.warn(
      '[TRANSACTION DEBUG] Unable to read MetaMask selected address:',
      error,
    )

  }


  return null
}


// ======================================================
// Get Current Chain ID
// ======================================================

function getCurrentChainId():
  string {

  try {

    const ethereum =
      window.ethereum as
      | {
          chainId?: string
        }
      | undefined


    if (
      ethereum?.chainId
    ) {

      return (
        ethereum.chainId
          .toLowerCase()
      )
    }

  } catch (error) {

    console.warn(
      '[TRANSACTION DEBUG] Unable to read MetaMask chain ID:',
      error,
    )

  }


  // Ethereum Sepolia
  return '0xaa36a7'
}


// ======================================================
// Build Wallet-Scoped Storage Key
// ======================================================
//
// Format:
//
// flashloan_arbitrage_transaction_history
// _chain_<chainId>
// _executor_<executor>
// _wallet_<wallet>
//
// Example:
//
// flashloan_arbitrage_transaction_history
// _chain_0xaa36a7
// _executor_0x33f10323...
// _wallet_0x02cb...
// ======================================================

function getWalletTransactionHistoryKey():
  string | null {

  const wallet =
    getCurrentWalletAddress()


  if (!wallet) {

    return null
  }


  const chainId =
    getCurrentChainId()


  return (
    `${TRANSACTION_HISTORY_BASE_KEY}` +
    `_chain_${chainId}` +
    `_executor_${EXECUTOR_ADDRESS.toLowerCase()}` +
    `_wallet_${wallet}`
  )
}


// ======================================================
// Get Wallet Migration Key
// ======================================================

function getWalletMigrationKey():
  string | null {

  const wallet =
    getCurrentWalletAddress()


  if (!wallet) {

    return null
  }


  return (
    `${WALLET_HISTORY_MIGRATION_KEY}` +
    `_${getCurrentChainId()}` +
    `_${EXECUTOR_ADDRESS.toLowerCase()}` +
    `_${wallet}`
  )
}


// ======================================================
// Get Chain Reconciliation Migration Key
//
// FLAG-ONLY key. Scoped to Network + BOTH known Executor
// deployments + Wallet.
//
// The canonical wallet-history STORAGE key is deliberately
// NOT derived from this scope — changing the storage key
// would strand existing records. The executor that produced
// each record lives on the record itself
// (executorAddress), never in the storage key.
// ======================================================

function getReconcileMigrationKey():
  string | null {

  const wallet =
    getCurrentWalletAddress()


  if (!wallet) {

    return null
  }


  return (
    `${TRANSACTION_RECONCILE_MIGRATION_KEY}` +
    `_${getCurrentChainId()}` +
    `_executors_${EXECUTOR_ADDRESS.toLowerCase()}_${OLD_EXECUTOR_DEPLOYMENT}` +
    `_wallet_${wallet}`
  )
}


// ======================================================
// Read Transactions From Storage Key
// ======================================================

function readTransactionsFromKey(
  storageKey: string,
):
  TransactionHistoryItem[] {

  try {

    const stored =
      localStorage.getItem(
        storageKey,
      )


    if (!stored) {

      return []
    }


    const transactions =
      JSON.parse(
        stored,
      )


    if (
      !Array.isArray(
        transactions,
      )
    ) {

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
// Write Transactions To Storage Key
// ======================================================

function writeTransactionsToKey(
  storageKey: string,
  transactions:
    TransactionHistoryItem[],
): void {

  localStorage.setItem(
    storageKey,
    JSON.stringify(
      transactions,
    ),
  )
}


// ======================================================
// Migrate Legacy Global History
// ======================================================
//
// IMPORTANT:
//
// The old application stored history under:
//
// flashloan_arbitrage_transaction_history
//
// This migration runs ONCE per wallet (versioned flag)
// and imports ONLY legacy records whose transaction
// hashes are not already present in the wallet-scoped
// history.
//
// It therefore can never duplicate records and never
// re-import data over an already reconciled history.
//
// The old global key is intentionally retained.
// ======================================================

function migrateLegacyHistoryToCurrentWallet():
  void {

  try {

    const walletKey =
      getWalletTransactionHistoryKey()


    const migrationKey =
      getWalletMigrationKey()


    if (
      !walletKey ||
      !migrationKey
    ) {

      return
    }


    const alreadyMigrated =
      localStorage.getItem(
        migrationKey,
      )


    if (
      alreadyMigrated ===
      'true'
    ) {

      return
    }


    // --------------------------------------------------
    // Read both histories.
    // --------------------------------------------------

    const walletTransactions =
      readTransactionsFromKey(
        walletKey,
      )


    const legacyTransactions =
      readTransactionsFromKey(
        LEGACY_TRANSACTION_HISTORY_KEY,
      )


    if (
      legacyTransactions.length ===
      0
    ) {

      localStorage.setItem(
        migrationKey,
        'true',
      )

      return
    }


    // --------------------------------------------------
    // Import only hashes missing from the wallet key.
    //
    // This prevents duplicates when the legacy list
    // overlaps the current wallet history, and prevents
    // re-importing records into a reconciled history.
    // --------------------------------------------------

    const existingHashes =
      new Set<string>()


    for (
      const transaction of walletTransactions
    ) {

      existingHashes.add(
        transaction.hash.toLowerCase(),
      )
    }


    const additions =
      legacyTransactions.filter(
        (
          transaction,
        ) =>
          !existingHashes.has(
            transaction.hash.toLowerCase(),
          ),
      )


    if (
      additions.length >
      0
    ) {

      writeTransactionsToKey(
        walletKey,
        [
          ...additions,
          ...walletTransactions,
        ],
      )

      console.log(
        '[TRANSACTION MIGRATION] Legacy records imported (deduplicated):',
        additions.length,
      )

    } else {

      console.log(
        '[TRANSACTION MIGRATION] No new legacy records to import.',
      )

    }


    // --------------------------------------------------
    // Mark this wallet migrated (one-time).
    // --------------------------------------------------

    localStorage.setItem(
      migrationKey,
      'true',
    )


  } catch (error) {

    console.error(
      '[TRANSACTION MIGRATION] Legacy wallet migration failed:',
      error,
    )

  }
}


// ======================================================
// Get Stored Transactions
// ======================================================

export function getStoredTransactions():
  TransactionHistoryItem[] {

  try {

    // --------------------------------------------------
    // Make sure existing legacy records are migrated
    // before reading the current wallet history.
    // --------------------------------------------------

    migrateLegacyHistoryToCurrentWallet()


    const walletKey =
      getWalletTransactionHistoryKey()


    // --------------------------------------------------
    // Wallet not available
    // --------------------------------------------------

    if (!walletKey) {

      console.warn(
        '[TRANSACTION DEBUG] No connected MetaMask wallet. Returning empty transaction history.',
      )

      return []
    }


    return readTransactionsFromKey(
      walletKey,
    )

  } catch (error) {

    console.error(
      '[TRANSACTION DEBUG] Failed to read wallet transaction history:',
      error,
    )


    return []
  }
}


// ======================================================
// Migrate Historical Transaction Profit
// ======================================================
//
// This function is retained for compatibility with the
// existing application.
//
// The current execution calculation already includes
// Aave flash-loan premium.
//
// Older records may require correction.
// ======================================================

export function migrateHistoricalTransactions():
  void {

  try {

    const transactions =
      getStoredTransactions()


    if (
      transactions.length ===
      0
    ) {

      return
    }


    // --------------------------------------------------
    // Historical corrections from the existing project.
    //
    // Keep only known historical records here.
    // --------------------------------------------------

    const historicalCorrections:
      Record<string, string> = {

      // ------------------------------------------------
      // Real, documented historical corrections only.
      //
      // The former synthetic test entry
      // 0x858381f9a0b1c2d3e4f5...24354657 was removed:
      // it is not a valid transaction hash pattern and
      // can never match a real on-chain transaction.
      // ------------------------------------------------

      '0xe69ef143205978dd280f740d9fd9c6e6ef842e4ec9ae9d063d5081d22fb3dae8':
        '362.382402',

      '0xb80b254e0bf4a9c9192c5c80167ef2817626d39d5e33e006d600e6b6b18421fe':
        '1.394616',

      '0x3b8321eea8f378a2179726a5a1b5050723727583e8d5359a8af74dfe78922099':
        '1.047571',

      '0x2bd046dcf8e4a5a581d8e14d6d2cc40ef7bf5c99dcb7054d88ac878201244558':
        '1.362494',

      '0x1fa8bff8e871c7c36666a7ab9f88c4e6b4383035525922f6201959840fb7bf68':
        '1.355839',
    }


    let changed =
      false


    const updatedTransactions =
      transactions.map(
        (
          transaction,
        ) => {

          const hash =
            transaction.hash.toLowerCase()


          const correctedNetProfit =
            historicalCorrections[
              hash
            ]


          if (
            correctedNetProfit ===
            undefined
          ) {

            return transaction
          }


          if (
            transaction.netProfit ===
            correctedNetProfit
          ) {

            return transaction
          }


          changed =
            true


          console.log(
            '[TRANSACTION MIGRATION] Correcting historical transaction:',
            hash,
          )


          return {
            ...transaction,

            netProfit:
              correctedNetProfit,
          }
        },
      )


    if (
      !changed
    ) {

      return
    }


    const walletKey =
      getWalletTransactionHistoryKey()


    if (!walletKey) {

      return
    }


    writeTransactionsToKey(
      walletKey,
      updatedTransactions,
    )


    window.dispatchEvent(
      new CustomEvent(
        TRANSACTION_HISTORY_EVENT,
      ),
    )


    console.log(
      '[TRANSACTION MIGRATION] Historical transaction correction completed.',
    )

  } catch (error) {

    console.error(
      '[TRANSACTION MIGRATION] Historical transaction migration failed:',
      error,
    )
  }
}


// ======================================================
// Migrate Historical Aave Premium
// ======================================================
//
// IMPORTANT:
//
// Existing application already corrected the historical
// Aave premium values.
//
// We keep this function because TransactionsPage imports
// and calls it.
//
// It is deliberately conservative:
//
// - only ARBITRAGE records
// - never modifies the latest known corrected record
// - only subtracts the historical Aave premium
// - runs once
// ======================================================

const LATEST_CORRECT_TRANSACTION =
  '0x18357f25589eb5bf1bffa7d11c0e0d8492fbf64095b8e713c554b001f7255694'


export function migrateHistoricalAavePremium():
  void {

  try {

    const alreadyMigrated =
      localStorage.getItem(
        TRANSACTION_HISTORY_MIGRATION_KEY,
      )


    if (
      alreadyMigrated ===
      'true'
    ) {

      return
    }


    const transactions =
      getStoredTransactions()


    if (
      transactions.length ===
      0
    ) {

      return
    }


    let changed =
      false


    const updatedTransactions =
      transactions.map(
        (
          transaction,
        ) => {

          // --------------------------------------------
          // Never modify the newest already-correct
          // transaction.
          // --------------------------------------------

          if (
            transaction.hash.toLowerCase() ===
            LATEST_CORRECT_TRANSACTION.toLowerCase()
          ) {

            return transaction
          }


          // --------------------------------------------
          // Never modify chain-reconciled records.
          //
          // A reconciled record already carries the exact
          // on-chain values, including the flash-loan
          // premium. Subtracting the premium again would
          // double-count it.
          // --------------------------------------------

          if (
            transaction.reconciled
          ) {

            return transaction
          }


          // --------------------------------------------
          // Only arbitrage transactions are affected.
          // --------------------------------------------

          if (
            transaction.type !==
            'ARBITRAGE'
          ) {

            return transaction
          }


          const amount =
            Number(
              transaction.amount,
            )


          if (
            !Number.isFinite(
              amount,
            )
          ) {

            return transaction
          }


          // --------------------------------------------
          // Existing project assumption:
          //
          // Aave premium = 0.05% of flash-loan amount
          //
          // 100 USDC -> 0.05 USDC
          //   1 USDC -> 0.0005 USDC
          // --------------------------------------------

          const premium =
            amount *
            0.0005


          if (
            premium <=
            0
          ) {

            return transaction
          }


          const oldNetProfit =
            Number(
              transaction.netProfit,
            )


          if (
            !Number.isFinite(
              oldNetProfit,
            )
          ) {

            return transaction
          }


          const newNetProfit =
            oldNetProfit -
            premium


          changed =
            true


          console.log(
            '========================================',
          )

          console.log(
            '[TRANSACTION MIGRATION] Correcting transaction:',
            transaction.hash,
          )

          console.log(
            '[TRANSACTION MIGRATION] Amount:',
            amount,
          )

          console.log(
            '[TRANSACTION MIGRATION] Aave premium:',
            premium,
          )

          console.log(
            '[TRANSACTION MIGRATION] Old net profit:',
            transaction.netProfit,
          )

          console.log(
            '[TRANSACTION MIGRATION] New net profit:',
            newNetProfit.toFixed(6),
          )

          console.log(
            '========================================',
          )


          return {
            ...transaction,

            netProfit:
              newNetProfit.toFixed(
                6,
              ),
          }
        },
      )


    if (
      changed
    ) {

      const walletKey =
        getWalletTransactionHistoryKey()


      if (
        walletKey
      ) {

        writeTransactionsToKey(
          walletKey,
          updatedTransactions,
        )


        window.dispatchEvent(
          new CustomEvent(
            TRANSACTION_HISTORY_EVENT,
          ),
        )


        console.log(
          '[TRANSACTION MIGRATION] Historical Aave premium correction completed.',
        )
      }
    }


    localStorage.setItem(
      TRANSACTION_HISTORY_MIGRATION_KEY,
      'true',
    )


    console.log(
      '[TRANSACTION MIGRATION] Aave premium migration completed.',
    )

  } catch (error) {

    console.error(
      '[TRANSACTION MIGRATION] Failed:',
      error,
    )
  }
}


// ======================================================
// Reconcile Stored Transactions With The Blockchain
// ======================================================
//
// ONE-TIME (versioned), idempotent, wallet/chain/executor
// scoped migration.
//
// For every stored ARBITRAGE record:
//
//   1. Read its on-chain receipt via
//      getFlashLoanTransactionResult().
//
//   2. A record is VALID only when the receipt shows a
//      successful execution with an ArbitrageProfit event.
//
//   3. Valid records are kept and their chain-derived
//      fields (grossProfit, gas) are REWRITTEN from the
//      authoritative events.
//
//      netProfit keeps the existing historical USD value
//      when it is finite and does not exceed the
//      authoritative netBeforeGas (it embeds the REAL
//      historical gas cost in USD). Today's ETH price is
//      deliberately NOT applied to old transactions.
//
//   4. Records without a valid successful arbitrage
//      receipt are removed as phantoms.
//
//   5. Records whose receipts cannot be READ (network or
//      provider errors) are KEPT untouched — absence of
//      data must never destroy history. They will be
//      retried if the flag has not been committed.
//
// Before any modification, the current history is backed
// up once under a deterministic backup key:
//
//     <wallet-history-key>_backup_reconcile_v1
//
// Running this function any number of times cannot
// duplicate records, re-apply changes, or create extra
// backups.
// ======================================================

function transactionTimeValue(
  transaction: TransactionHistoryItem,
): number {

  const parsed =
    Date.parse(
      transaction.time,
    )

  return Number.isNaN(parsed) ? 0 : parsed
}


// ======================================================
// V3 HELPERS
// ======================================================

// Display symbols only — accounting values always come
// from event data, never from this map.

const RECONCILE_TOKEN_SYMBOLS:
  Record<string, string> = {
    '0x94a9d9ac8a22534e3faca9fa46673d4d485c13f3':
      'USDC',

    '0x7b79995e5f793a07bc00c21412e50ecae098a7f3':
      'WETH',
  }


function reconcileTokenSymbol(
  token:
    | string
    | null,
): string {

  if (!token) {

    return 'TOKEN'
  }

  return (
    RECONCILE_TOKEN_SYMBOLS[
      token.toLowerCase()
    ] ?? 'TOKEN'
  )
}


type ReconcileDecodedArbitrage = {

  // Provider/network failure — defer, NEVER classify.
  unavailable: boolean

  receiptFound: boolean

  statusOk: boolean

  executorAddress:
    | string
    | null

  isKnownExecutor: boolean

  flashLoanAmount:
    | bigint
    | null

  flashLoanPremium:
    | bigint
    | null

  swapCount: number

  swap1TokenIn:
    | string
    | null

  swap1TokenOut:
    | string
    | null

  swap1AmountIn:
    | bigint
    | null

  swap1AmountOut:
    | bigint
    | null

  swap2TokenIn:
    | string
    | null

  swap2TokenOut:
    | string
    | null

  swap2AmountIn:
    | bigint
    | null

  swap2AmountOut:
    | bigint
    | null

  profitAsset:
    | string
    | null

  amountBorrowed:
    | bigint
    | null

  profit:
    | bigint
    | null

  operationId:
    | bigint
    | null

  operationSuccess:
    | boolean
    | null

  gasUsed:
    | bigint
    | null

  effectiveGasPrice:
    | bigint
    | null

  gasCostWei:
    | bigint
    | null

  blockTimestamp:
    | number
    | null
}


function emptyReconcileDecodedArbitrage():
  ReconcileDecodedArbitrage {

  return {

    unavailable: false,

    receiptFound: false,

    statusOk: false,

    executorAddress: null,

    isKnownExecutor: false,

    flashLoanAmount: null,

    flashLoanPremium: null,

    swapCount: 0,

    swap1TokenIn: null,

    swap1TokenOut: null,

    swap1AmountIn: null,

    swap1AmountOut: null,

    swap2TokenIn: null,

    swap2TokenOut: null,

    swap2AmountIn: null,

    swap2AmountOut: null,

    profitAsset: null,

    amountBorrowed: null,

    profit: null,

    operationId: null,

    operationSuccess: null,

    gasUsed: null,

    effectiveGasPrice: null,

    gasCostWei: null,

    blockTimestamp: null,
  }
}


// ------------------------------------------------------
// Emitter-aware decode used by BOTH reconciliation
// phases.
//
// Routing is by transaction.to / log.address against the
// KNOWN Executor deployment set — never by a single
// hard-coded contract address. Both deployments emit
// identical event signatures, so one interface serves
// both.
//
// Transient public-node null responses were observed
// during forensics; lookups are retried and a failed
// lookup ALWAYS yields unavailable=true (defer/retry),
// never a removal decision.
// ------------------------------------------------------

async function decodeArbitrageReceiptForReconcile(
  txHash: string,
): Promise<ReconcileDecodedArbitrage> {

  const decoded =
    emptyReconcileDecodedArbitrage()

  const provider =
    await getProvider()


  let transaction:
    | Awaited<
        ReturnType<
          typeof provider.getTransaction
        >
      >
    | null = null

  let receipt:
    | Awaited<
        ReturnType<
          typeof provider.getTransactionReceipt
        >
      >
    | null = null


  for (
    let attempt = 0;
    attempt < 3;
    attempt++
  ) {

    try {

      transaction =
        await provider.getTransaction(
          txHash,
        )

      receipt =
        await provider.getTransactionReceipt(
          txHash,
        )


      if (
        receipt ||
        transaction
      ) {

        break
      }

    } catch {

      if (
        attempt === 2
      ) {

        return {
          ...decoded,
          unavailable: true,
        }
      }
    }


    await new Promise(
      (
        resolve,
      ) =>
        setTimeout(
          resolve,
          800,
        ),
    )
  }


  if (
    !receipt
  ) {

    return {
      ...decoded,
      unavailable: true,
    }
  }


  const statusOk =
    receipt.status === 1


  const executorAddress =
    transaction?.to ??
    receipt.to ??
    null


  const executorLower =
    executorAddress?.toLowerCase() ??
    ''


  const isKnownExecutor =
    KNOWN_EXECUTOR_DEPLOYMENTS.has(
      executorLower,
    )


  const emitterLogs =
    executorLower
      ? receipt.logs.filter(
          (
            log,
          ) =>
            log.address.toLowerCase() ===
            executorLower,
        )
      : []


  let swapCount = 0


  for (
    const log of emitterLogs
  ) {

    try {

      const parsed =
        RECONCILE_EVENT_INTERFACE.parseLog(
          {
            topics: [
              ...log.topics,
            ],
            data: log.data,
          },
        )

      if (!parsed) {

        continue
      }


      if (
        parsed.name ===
        'FlashLoanExecuted'
      ) {

        decoded.flashLoanAmount =
          parsed.args.amount as bigint

        decoded.flashLoanPremium =
          parsed.args.premium as bigint

        continue
      }


      if (
        parsed.name ===
        'SwapExecuted'
      ) {

        swapCount++

        if (
          swapCount === 1
        ) {

          decoded.swap1TokenIn =
            parsed.args.tokenIn as string

          decoded.swap1TokenOut =
            parsed.args.tokenOut as string

          decoded.swap1AmountIn =
            parsed.args.amountIn as bigint

          decoded.swap1AmountOut =
            parsed.args.amountOut as bigint

        } else if (
          swapCount === 2
        ) {

          decoded.swap2TokenIn =
            parsed.args.tokenIn as string

          decoded.swap2TokenOut =
            parsed.args.tokenOut as string

          decoded.swap2AmountIn =
            parsed.args.amountIn as bigint

          decoded.swap2AmountOut =
            parsed.args.amountOut as bigint
        }

        continue
      }


      if (
        parsed.name ===
        'ArbitrageProfit'
      ) {

        decoded.profitAsset =
          parsed.args.asset as string

        decoded.amountBorrowed =
          parsed.args.amountBorrowed as bigint

        decoded.profit =
          parsed.args.profit as bigint

        continue
      }


      if (
        parsed.name ===
        'OperationCompleted'
      ) {

        decoded.operationId =
          parsed.args.operationId as bigint

        decoded.operationSuccess =
          parsed.args.success as boolean
      }

    } catch {

      // Not an Executor event — ignore.

    }
  }


  decoded.swapCount = swapCount


  try {

    const block =
      await provider.getBlock(
        receipt.blockNumber,
      )

    decoded.blockTimestamp =
      block?.timestamp ?? null

  } catch {

    decoded.blockTimestamp = null

  }


  return {

    ...decoded,

    receiptFound: true,

    statusOk,

    executorAddress,

    isKnownExecutor,

    swapCount,

    gasUsed:
      receipt.gasUsed,

    effectiveGasPrice:
      receipt.gasPrice,

    gasCostWei:
      receipt.gasUsed *
      receipt.gasPrice,
  }
}


// ------------------------------------------------------
// Validity bar (identical for both deployments):
// successful receipt ∧ known emitting executor ∧
// FlashLoanExecuted ∧ ArbitrageProfit ∧ at least one
// SwapExecuted ∧ no failed OperationCompleted.
// ------------------------------------------------------

function hasValidArbitrageEvidence(
  decoded: ReconcileDecodedArbitrage,
): boolean {

  return (

    decoded.receiptFound &&

    decoded.statusOk &&

    decoded.isKnownExecutor &&

    decoded.flashLoanPremium !== null &&

    decoded.profit !== null &&

    decoded.amountBorrowed !== null &&

    decoded.swapCount >= 1 &&

    decoded.operationSuccess !== false
  )
}


export async function reconcileStoredTransactionsWithChain():
  Promise<void> {

  try {

    // ------------------------------------------------
    // INVOCATION LOG — emitted unconditionally so a
    // skipped run is always diagnosable.
    // ------------------------------------------------

    console.log(
      '[TX RECONCILE V3] Invocation started',
    )


    // ------------------------------------------------
    // Ensure the legacy→wallet import has completed
    // BEFORE reading the wallet-scoped history.
    //
    // The v1 incident: reconciliation ran against an
    // empty wallet key (legacy records not yet
    // imported), processed zero records and committed
    // its flag. This idempotent call guarantees the
    // dataset exists first.
    // ------------------------------------------------

    migrateLegacyHistoryToCurrentWallet()


    let flagKey =
      getReconcileMigrationKey()


    // ------------------------------------------------
    // MetaMask may not have restored selectedAddress
    // yet on a cold /transactions load. Retry ONCE
    // after a short bounded delay instead of exiting
    // silently (the reason previous runs produced no
    // console output). No polling loops are used.
    // ------------------------------------------------

    if (
      !flagKey
    ) {

      await new Promise(
        (
          resolve,
        ) =>
          setTimeout(
            resolve,
            1500,
          ),
      )

      flagKey =
        getReconcileMigrationKey()

    }


    const walletKey =
      getWalletTransactionHistoryKey()


    // ------------------------------------------------
    // No connected wallet → nothing to reconcile.
    // ------------------------------------------------

    if (
      !walletKey ||
      !flagKey
    ) {

      console.warn(
        '[TX RECONCILE] No connected MetaMask wallet — skipped this load.',
      )

      return
    }


    console.log(
      '[TX RECONCILE V3] Migration key:',
      flagKey,
    )


    // ------------------------------------------------
    // Already reconciled for this scope → no-op.
    // ------------------------------------------------

    const alreadyMigrated =
      localStorage.getItem(flagKey) ===
      'true'

    console.log(
      '[TX RECONCILE V3] Already migrated:',
      alreadyMigrated,
    )

    if (
      alreadyMigrated
    ) {

      return
    }


    // ------------------------------------------------
    // Only reconcile while connected to Sepolia.
    //
    // On any other network receipts would not resolve
    // and valid records could be misclassified.
    // ------------------------------------------------

    if (
      getCurrentChainId() !==
      '0xaa36a7'
    ) {

      console.warn(
        '[TX RECONCILE V3] Wrong network (Sepolia required) — skipped.',
      )

      return
    }


    const currentTransactions =
      readTransactionsFromKey(
        walletKey,
      )


    console.log(
      '[TX RECONCILE V3] Records before:',
      currentTransactions.length,
    )


    // ------------------------------------------------
    // Soft verification of the expected pre-migration
    // dataset (19 records). Deviation is reported loudly
    // but never blocks: per-record chain validation plus
    // the final all-or-nothing gate remain the real
    // safety mechanism.
    // ------------------------------------------------

    const arbitrageBeforeCount =
      currentTransactions.filter(
        (
          transaction,
        ) =>
          transaction.type ===
          'ARBITRAGE',
      ).length


    if (
      currentTransactions.length !==
      19
    ) {

      console.warn(
        '[TX RECONCILE V3] Unexpected record count (expected 19):',
        currentTransactions.length,
      )

    }


    // ------------------------------------------------
    // Deterministic one-time V3 backup. The existing
    // _backup_reconcile_v1 backup is NEVER touched.
    // ------------------------------------------------

    const backupKey =
      `${walletKey}${RECONCILE_V3_BACKUP_SUFFIX}`


    if (
      currentTransactions.length >
        0 &&
      !localStorage.getItem(backupKey)
    ) {

      localStorage.setItem(
        backupKey,
        JSON.stringify(currentTransactions),
      )

    }


    console.log(
      '[TX RECONCILE V3] Backup:',
      localStorage.getItem(backupKey)
        ? `${backupKey} (exists, ${arbitrageBeforeCount} arbitrage records captured pre-modification)`
        : 'not created (empty history)',
    )


    // ------------------------------------------------
    // Non-arbitrage records (withdrawals etc.) are
    // preserved untouched.
    // ------------------------------------------------

    const preservedRecords =
      currentTransactions.filter(
        (
          transaction,
        ) =>
          transaction.type !==
          'ARBITRAGE',
      )


    // ------------------------------------------------
    // Deduplicate ARBITRAGE records by hash.
    // ------------------------------------------------

    const seenHashes =
      new Set<string>()


    const uniqueArbitrage:
      TransactionHistoryItem[] = []

    let deduplicatedCount =
      0


    for (
      const record of currentTransactions
    ) {

      const hash =
        record.hash.toLowerCase()


      if (
        record.type !==
        'ARBITRAGE'
      ) {

        continue
      }


      if (
        seenHashes.has(hash)
      ) {

        deduplicatedCount++

        continue
      }

      seenHashes.add(hash)

      uniqueArbitrage.push(record)
    }


    // ------------------------------------------------
    // Validate every remaining ARBITRAGE record
    // against the blockchain.
    // ------------------------------------------------

    // ------------------------------------------------
    // PHASE 1 — Emitter-aware validation.
    //
    // Every stored ARBITRAGE record is decoded against
    // the Executor deployment that ACTUALLY emitted its
    // events (transaction.to), not merely the currently
    // configured one. Records without conclusive
    // evidence are removed; provider failures defer
    // and never remove.
    // ------------------------------------------------

    const validRecords:
      TransactionHistoryItem[] = []

    let removedInvalidCount =
      0

    let unavailableCount =
      0


    for (
      const record of uniqueArbitrage
    ) {

      const decoded =
        await decodeArbitrageReceiptForReconcile(
          record.hash,
        )


      if (
        decoded.unavailable
      ) {

        unavailableCount++

        validRecords.push(record)

        console.warn(
          '[TX RECONCILE V3] Receipt lookup unavailable, record kept:',
          record.hash,
        )

        continue
      }


      if (
        !hasValidArbitrageEvidence(
          decoded,
        )
      ) {

        removedInvalidCount++

        console.warn(
          '[TX RECONCILE V3] Removed invalid record (no conclusive arbitrage evidence):',
          record.hash,
          `status=${decoded.statusOk}`,
          `knownExecutor=${decoded.isKnownExecutor}`,
          `profit=${decoded.profit !== null}`,
          `swaps=${decoded.swapCount}`,
        )

        continue
      }


      // --------------------------------------------
      // Chain-authoritative rewrite from the emitting
      // deployment's events/receipt.
      //
      // netProfit: the stored value already embeds the
      // REAL historical gas cost in USD, so it is
      // preserved whenever finite and ≤ netBeforeGas.
      // Otherwise '—' rather than inventing an ETH/USD
      // price. Historical prices are never substituted
      // with today's spot price.
      // --------------------------------------------

      const grossProfitUsdc =
        Number(
          formatUnits(
            decoded.profit as bigint,
            6,
          ),
        )


      const aavePremiumUsdc =
        decoded.flashLoanPremium !== null
          ? Number(
              formatUnits(
                decoded.flashLoanPremium,
                6,
              ),
            )
          : 0


      const netBeforeGasUsdc =
        grossProfitUsdc -
        aavePremiumUsdc


      const previousNetProfit =
        Number(
          String(record.netProfit).replace(
            '$',
            '',
          ),
        )


      const reconciledNetProfit =
        Number.isFinite(previousNetProfit) &&
        previousNetProfit <=
          netBeforeGasUsdc
          ? `$${previousNetProfit.toFixed(6)}`
          : '—'


      validRecords.push(
        {
          ...record,

          status:
            'SUCCESS' as const,

          grossProfit:
            `$${grossProfitUsdc.toFixed(6)}`,

          netProfit:
            reconciledNetProfit,

          gas:
            `${formatUnits(decoded.gasCostWei as bigint, 18)} ETH`,

          reconciled:
            true,

          executorAddress:
            decoded.executorAddress ??
            undefined,
        },
      )
    }


    // ------------------------------------------------
    // PHASE 2 — Chain backfill of authoritative
    // arbitrage executions missing from storage.
    //
    // Only hashes in MISSING_AUTHORITATIVE_HASHES are
    // considered; every value is derived from the
    // receipt/events/block. Nothing is fabricated.
    // Hash dedupe is case-insensitive and runs against
    // the FULL existing history, so re-runs can never
    // create duplicates.
    // ------------------------------------------------

    const backfilledRecords:
      TransactionHistoryItem[] = []

    let missingAuthoritativeCount =
      0


    const existingHashesLower =
      new Set<string>()

    for (
      const transaction of currentTransactions
    ) {

      existingHashesLower.add(
        transaction.hash.toLowerCase(),
      )
    }


    for (
      const hash of MISSING_AUTHORITATIVE_HASHES
    ) {

      if (
        existingHashesLower.has(
          hash.toLowerCase(),
        )
      ) {

        continue
      }


      const decoded =
        await decodeArbitrageReceiptForReconcile(
          hash,
        )


      if (
        decoded.unavailable
      ) {

        unavailableCount++

        missingAuthoritativeCount++

        console.warn(
          '[TX RECONCILE V3] Backfill lookup unavailable — deferred:',
          hash,
        )

        continue
      }


      if (
        !hasValidArbitrageEvidence(
          decoded,
        )
      ) {

        missingAuthoritativeCount++

        console.error(
          '[TX RECONCILE V3] Authoritative backfill hash FAILED evidence check — migration will not complete:',
          hash,
        )

        continue
      }


      const grossProfitUsdc =
        Number(
          formatUnits(
            decoded.profit as bigint,
            6,
          ),
        )


      const settleSymbol =
        reconcileTokenSymbol(
          decoded.profitAsset,
        )


      const midSymbol =
        reconcileTokenSymbol(
          decoded.swap1TokenOut ??
            decoded.profitAsset,
        )


      const gasEth =
        formatUnits(
          decoded.gasCostWei as bigint,
          18,
        )


      const backfilledRecord:
        TransactionHistoryItem = {

          hash,

          status: 'SUCCESS' as const,

          type: 'ARBITRAGE' as const,

          pair:
            `${settleSymbol} → ${midSymbol} → ${settleSymbol}`,

          amount:
            `${formatUnits(decoded.amountBorrowed as bigint, 6)} ${settleSymbol}`,

          grossProfit:
            `$${grossProfitUsdc.toFixed(6)}`,

          netProfit: '—',

          gas:
            `${gasEth} ETH`,

          time:
            decoded.blockTimestamp !== null
              ? new Date(
                  decoded.blockTimestamp * 1000,
                ).toLocaleString()
              : '—',

          reconciled: true,

          reconciliationSource: 'CHAIN_BACKFILL',

          executorAddress:
            decoded.executorAddress ??
            undefined,
        }


      backfilledRecords.push(
        backfilledRecord,
      )


      existingHashesLower.add(
        hash.toLowerCase(),
      )


      console.log(
        '[TX RECONCILE V3] Backfilled:',
        hash,
        `executor=${decoded.executorAddress}`,
      )
    }


    // ------------------------------------------------
    // Merge, final defensive cross-type dedupe, sort
    // newest first.
    // ------------------------------------------------

    const mergedHashes =
      new Set<string>()


    const mergedRecords:
      TransactionHistoryItem[] = []


    for (
      const record of [
        ...validRecords,
        ...backfilledRecords,
        ...preservedRecords,
      ]
    ) {

      const hash =
        record.hash.toLowerCase()


      if (
        mergedHashes.has(hash)
      ) {

        deduplicatedCount++

        continue
      }

      mergedHashes.add(hash)

      mergedRecords.push(record)
    }


    mergedRecords.sort(
      (
        transactionA,
        transactionB,
      ) =>
        transactionTimeValue(transactionB) -
        transactionTimeValue(transactionA),
    )


    // ------------------------------------------------
    // FINAL VERIFICATION (all-or-nothing).
    //
    // Storage is modified and the v3 flag committed ONLY
    // if EVERY condition holds. On any failure the
    // existing history and backups remain untouched.
    // ------------------------------------------------

    const finalArbitrageRecords =
      mergedRecords.filter(
        (
          transaction,
        ) =>
          transaction.type ===
          'ARBITRAGE',
      )


    const finalOldExecutorCount =
      finalArbitrageRecords.filter(
        (
          transaction,
        ) =>
          transaction.executorAddress?.toLowerCase() ===
          OLD_EXECUTOR_DEPLOYMENT,
      ).length


    const finalCurrentExecutorCount =
      finalArbitrageRecords.filter(
        (
          transaction,
        ) =>
          transaction.executorAddress?.toLowerCase() ===
          CURRENT_EXECUTOR_DEPLOYMENT,
      ).length


    const missingBackfillHashes =
      MISSING_AUTHORITATIVE_HASHES.filter(
        (
          hash,
        ) =>
          !mergedRecords.some(
            (
              transaction,
            ) =>
              transaction.hash.toLowerCase() ===
              hash.toLowerCase(),
          ),
      )


    console.log(
      '[TX RECONCILE V3] Existing valid:',
      validRecords.length,
    )

    console.log(
      '[TX RECONCILE V3] Old executor records:',
      finalOldExecutorCount,
    )

    console.log(
      '[TX RECONCILE V3] Current executor records:',
      finalCurrentExecutorCount,
    )

    console.log(
      '[TX RECONCILE V3] Removed invalid:',
      removedInvalidCount,
    )

    console.log(
      '[TX RECONCILE V3] Backfilled:',
      backfilledRecords.length,
    )

    console.log(
      '[TX RECONCILE V3] Records after:',
      mergedRecords.length,
    )

    console.log(
      '[TX RECONCILE V3] Missing authoritative:',
      missingAuthoritativeCount +
        missingBackfillHashes.length,
    )

    console.log(
      '[TX RECONCILE V3] Duplicate hashes:',
      deduplicatedCount,
    )


    const verificationFailures:
      string[] = []


    if (
      unavailableCount >
      0
    ) {

      verificationFailures.push(
        `unresolved chain lookups: ${unavailableCount}`,
      )
    }


    if (
      finalArbitrageRecords.length !==
      EXPECTED_TOTAL_ARBITRAGE_RECORDS
    ) {

      verificationFailures.push(
        `arbitrage count ${finalArbitrageRecords.length} != expected ${EXPECTED_TOTAL_ARBITRAGE_RECORDS}`,
      )
    }


    if (
      missingBackfillHashes.length >
      0
    ) {

      verificationFailures.push(
        `missing authoritative hashes: ${missingBackfillHashes.join(', ')}`,
      )
    }


    if (
      deduplicatedCount >
      0
    ) {

      verificationFailures.push(
        `duplicate hashes detected: ${deduplicatedCount}`,
      )
    }


    if (
      finalOldExecutorCount !==
      EXPECTED_OLD_EXECUTOR_RECORDS
    ) {

      verificationFailures.push(
        `old-executor count ${finalOldExecutorCount} != expected ${EXPECTED_OLD_EXECUTOR_RECORDS}`,
      )
    }


    if (
      finalCurrentExecutorCount !==
      EXPECTED_CURRENT_EXECUTOR_RECORDS
    ) {

      verificationFailures.push(
        `current-executor count ${finalCurrentExecutorCount} != expected ${EXPECTED_CURRENT_EXECUTOR_RECORDS}`,
      )
    }


    for (
      const record of finalArbitrageRecords
    ) {

      const hasEvidence =
        record.reconciled === true &&
        /^\$\d+\.\d+$/.test(record.grossProfit)


      if (!hasEvidence) {

        verificationFailures.push(
          `record lacking chain-derived evidence: ${record.hash}`,
        )
      }
    }


    if (
      verificationFailures.length >
      0
    ) {

      console.error(
        '[TX RECONCILE V3] Verification FAILED — storage NOT modified, flag NOT committed:',
      )

      for (
        const failure of verificationFailures
      ) {

        console.error(
          '  -',
          failure,
        )
      }

      return
    }


    // ------------------------------------------------
    // All conditions satisfied → write back (only when
    // something changed) and commit the v3 flag LAST.
    // ------------------------------------------------

    const beforeSnapshot =
      JSON.stringify(currentTransactions)


    const afterSnapshot =
      JSON.stringify(mergedRecords)


    if (
      beforeSnapshot !==
      afterSnapshot
    ) {

      writeTransactionsToKey(
        walletKey,
        mergedRecords,
      )

      window.dispatchEvent(
        new CustomEvent(
          TRANSACTION_HISTORY_EVENT,
        ),
      )
    }


    localStorage.setItem(
      flagKey,
      'true',
    )


    console.log(
      '[TX RECONCILE V3] Completed',
    )

  } catch (error) {

    console.error(
      '[TX RECONCILE V3] Failed (will retry on next load):',
      error,
    )

  }
}


// ======================================================
// TEMPORARY READ-ONLY RECONCILIATION AUDIT
//
// Diagnostic only. Performs NO localStorage writes and
// NO state changes. Remove after the reconciliation
// strategy is approved.
// ======================================================

export async function auditReconciliationState():
  Promise<void> {

  const walletKey =
    getWalletTransactionHistoryKey()

  const flagKey =
    getReconcileMigrationKey()

  const walletMigrationKey =
    getWalletMigrationKey()


  const transactions =
    walletKey
      ? readTransactionsFromKey(
          walletKey,
        )
      : []

  const arbitrageRecords =
    transactions.filter(
      (
        transaction,
      ) =>
        transaction.type ===
        'ARBITRAGE',
    )

  const successRecords =
    transactions.filter(
      (
        transaction,
      ) =>
        String(
          transaction.status,
        ).toUpperCase() ===
        'SUCCESS',
    )


  const backupKey =
    walletKey
      ? `${walletKey}${RECONCILE_BACKUP_SUFFIX}`
      : null

  const backupRaw =
    backupKey
      ? localStorage.getItem(
          backupKey,
        )
      : null

  const backupRecords =
    readTransactionsFromKey(
      backupKey ?? '',
    )


  const legacyRaw =
    LEGACY_TRANSACTION_HISTORY_KEY
      ? localStorage.getItem(
          LEGACY_TRANSACTION_HISTORY_KEY,
        )
      : null

  let legacyCount = 0

  if (legacyRaw) {

    try {

      const parsed =
        JSON.parse(legacyRaw)

      if (
        Array.isArray(parsed)
      ) {

        legacyCount =
          parsed.length

      }

    } catch {

      legacyCount = -1

    }

  }


  console.log(
    '[TX RECONCILE AUDIT]',
  )

  console.log(
    'Migration flag exists:',
    flagKey
      ? localStorage.getItem(flagKey) !==
        null
      : false,
  )

  console.log(
    'Migration flag value:',
    flagKey
      ? localStorage.getItem(flagKey)
      : '(wallet unavailable)',
  )

  console.log(
    'Current wallet-scoped history key:',
    walletKey ?? '(unavailable)',
  )

  console.log(
    'Current record count:',
    transactions.length,
  )

  console.log(
    'ARBITRAGE count:',
    arbitrageRecords.length,
  )

  console.log(
    'SUCCESS count:',
    successRecords.length,
  )

  console.log(
    'Backup exists:',
    backupRaw !== null,
  )

  console.log(
    'Backup record count:',
    backupRecords.length,
  )


  // --------------------------------------------------
  // Provenance extras (read-only).
  // --------------------------------------------------

  console.log(
    'Legacy global key exists:',
    legacyRaw !== null,
  )

  console.log(
    'Legacy global record count:',
    legacyCount,
  )

  console.log(
    'Legacy-import (v4) flag value:',
    walletMigrationKey
      ? localStorage.getItem(walletMigrationKey)
      : '(wallet unavailable)',
  )


  let index = 0

  for (
    const record of arbitrageRecords
  ) {

    let receiptExists:
      boolean | 'unknown' =
      'unknown'

    let decodable = false

    let validProfitEvent = false

    let note = ''

    try {

      const result =
        await getFlashLoanTransactionResult(
          record.hash,
        )

      receiptExists = true

      decodable =
        result.arbitrageProfit !==
        null

      validProfitEvent =
        decodable &&
        result.operationSuccess !==
          false

      note = `onChainStatus=${result.status}`

    } catch (error) {

      const message =
        error instanceof Error
          ? error.message
          : String(error)

      if (
        /receipt not found/i.test(
          message,
        )
      ) {

        receiptExists = false

        note = 'receipt missing on chain'

      } else {

        note = `provider error: ${message}`

      }

    }

    console.log(
      `#${index}`,
      record.hash,
      `status=${record.status}`,
      `type=${record.type}`,
      `timestamp=${record.time}`,
      `reconciled=${record.reconciled === true}`,
      `receiptExists=${receiptExists}`,
      `decodable=${decodable}`,
      `validProfitEvent=${validProfitEvent}`,
      note,
    )

    index++

  }

  console.log(
    '[TX RECONCILE AUDIT] Done',
  )

}


// ======================================================
// Save Transaction
// ======================================================

export function saveTransaction(
  transaction:
    TransactionHistoryItem,
): void {

  try {

    const walletKey =
      getWalletTransactionHistoryKey()


    // --------------------------------------------------
    // Never save a transaction without a wallet.
    // --------------------------------------------------

    if (!walletKey) {

      console.error(
        '[TRANSACTION DEBUG] Cannot save transaction: no connected MetaMask wallet.',
      )

      return
    }


    const existingTransactions =
      getStoredTransactions()


    // --------------------------------------------------
    // Prevent duplicate transaction hashes
    // --------------------------------------------------

    const transactionHash =
      transaction.hash.toLowerCase()


    const existingIndex =
      existingTransactions.findIndex(
        (
          item,
        ) =>
          item.hash.toLowerCase() ===
          transactionHash,
      )


    // --------------------------------------------------
    // If this hash already exists, do NOT blindly ignore
    // the new result.
    //
    // A transaction can first be stored as PENDING and
    // later arrive here as SUCCESS. The old behaviour
    // discarded that authoritative SUCCESS update because
    // the hash already existed.
    //
    // Prefer the incoming record when it is more complete:
    // - SUCCESS replaces PENDING / FAILED
    // - reconciled replaces non-reconciled
    // - otherwise keep the existing record unchanged
    // --------------------------------------------------

    if (
      existingIndex >=
      0
    ) {

      const existingTransaction =
        existingTransactions[
          existingIndex
        ]


      const incomingIsMoreAuthoritative =
        (
          transaction.status ===
          'SUCCESS' &&
          existingTransaction.status !==
          'SUCCESS'
        ) ||
        (
          transaction.reconciled ===
          true &&
          existingTransaction.reconciled !==
          true
        )


      if (
        incomingIsMoreAuthoritative
      ) {

        const updatedTransactions =
          [
            ...existingTransactions,
          ]


        updatedTransactions[
          existingIndex
        ] = {
          ...existingTransaction,
          ...transaction,
        }


        writeTransactionsToKey(
          walletKey,
          updatedTransactions,
        )


        window.dispatchEvent(
          new CustomEvent(
            TRANSACTION_HISTORY_EVENT,
          ),
        )


        console.log(
          '[TRANSACTION DEBUG] Existing transaction updated with authoritative result:',
          transaction.hash,
        )

        console.log(
          '[TRANSACTION DEBUG] Previous status:',
          existingTransaction.status,
        )

        console.log(
          '[TRANSACTION DEBUG] New status:',
          transaction.status,
        )

        console.log(
          '[TRANSACTION DEBUG] New net profit:',
          transaction.netProfit,
        )

        return
      }


      console.log(
        '[TRANSACTION DEBUG] Transaction already exists — no authoritative update required:',
        transaction.hash,
      )

      return
    }


    const updatedTransactions = [
      transaction,
      ...existingTransactions,
    ]


    // --------------------------------------------------
    // Save to wallet-specific storage
    // --------------------------------------------------

    writeTransactionsToKey(
      walletKey,
      updatedTransactions,
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

    console.log(
      '[TRANSACTION DEBUG] Wallet:',
      getCurrentWalletAddress(),
    )

    console.log(
      '[TRANSACTION DEBUG] Storage key:',
      walletKey,
    )

    console.log(
      '[TRANSACTION DEBUG] Total stored transactions:',
      updatedTransactions.length,
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

      console.log(
        '[TRANSACTION DEBUG] Local transaction update received.',
      )

      callback()
    }


  const handleStorageChange =
    (
      event: StorageEvent,
    ) => {

      // ------------------------------------------------
      // Only respond to our transaction-history keys.
      // ------------------------------------------------

      if (
        !event.key
      ) {

        return
      }


      const currentWalletKey =
        getWalletTransactionHistoryKey()


      if (
        event.key ===
        currentWalletKey
      ) {

        console.log(
          '[TRANSACTION DEBUG] Cross-tab transaction update received.',
        )

        callback()
      }
    }


  // ----------------------------------------------------
  // Same-tab custom event
  // ----------------------------------------------------

  window.addEventListener(
    TRANSACTION_HISTORY_EVENT,
    handleTransactionUpdate,
  )


  // ----------------------------------------------------
  // Cross-tab storage event
  // ----------------------------------------------------

  window.addEventListener(
    'storage',
    handleStorageChange,
  )


  // ====================================================
  // Cleanup
  // ====================================================

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