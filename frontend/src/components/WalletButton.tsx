import {
  useEffect,
  useRef,
  useState,
} from 'react'



// ======================================================
// Ethereum Provider Type
//
// IMPORTANT:
//
// Do NOT declare another global:
//
//     interface Window {
//       ethereum: ...
//     }
//
// The project already has an ethereum declaration.
//
// Re-declaring it with a different type can cause:
//
//     Subsequent property declarations must have
//     the same type.
//
// Therefore we use a local provider type only.
// ======================================================

type Eip1193Provider = {
  request: (
    args: {
      method: string
      params?: unknown[]
    },
  ) => Promise<unknown>

  on?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void

  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void
}


// ======================================================
// Wallet Account Synchronization Event
//
// WalletButton and TransactionsPage are separate React
// components. Therefore WalletButton cannot directly
// change TransactionsPage state.
//
// After a successful account synchronization we dispatch
// a browser event.
//
// TransactionsPage can listen to:
//
//     flashloan:wallet-account-changed
//
// and reload wallet-specific transaction history.
//
// This does NOT store or delete transaction history.
// ======================================================

const WALLET_ACCOUNT_CHANGED_EVENT =
  'flashloan:wallet-account-changed'


type WalletAccountChangedDetail = {
  account: string | null
}


// ======================================================
// Wallet Button
// ======================================================

function WalletButton() {

  // ====================================================
  // State
  // ====================================================

  const [
    walletAddress,
    setWalletAddress,
  ] = useState<string | null>(null)

  const [
    isConnected,
    setIsConnected,
  ] = useState(false)

  const [
    isConnecting,
    setIsConnecting,
  ] = useState(false)

  const [
    isSyncing,
    setIsSyncing,
  ] = useState(false)

  const [
    isDisconnecting,
    setIsDisconnecting,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<string | null>(null)


  // ====================================================
  // Mounted Ref
  // ====================================================

  const mountedRef =
    useRef(true)


  // ====================================================
  // Provider Helper
  // ====================================================

  function getEthereum():
    Eip1193Provider | null {

    const ethereum =
      (
        window as
        Window & {
          ethereum?: Eip1193Provider
        }
      ).ethereum

    if (
      !ethereum
    ) {
      return null
    }

    return ethereum
  }


  // ====================================================
  // Normalize Address
  // ====================================================

  function normalizeAddress(
    address: string,
  ): string {

    return address
      .trim()
      .toLowerCase()
  }


  // ====================================================
  // Format Address
  // ====================================================

  function formatAddress(
    address: string,
  ): string {

    if (
      address.length < 12
    ) {
      return address
    }

    return (
      `${address.slice(0, 6)}...` +
      `${address.slice(-4)}`
    )
  }


  // ====================================================
  // Notify Application About Wallet Account
  //
  // IMPORTANT:
  //
  // This event is the bridge between WalletButton and
  // pages such as TransactionsPage.
  //
  // account = null
  //     means frontend wallet is disconnected.
  //
  // account = address
  //     means the active MetaMask account changed or was
  //     synchronized successfully.
  // ====================================================

  function notifyWalletAccountChanged(
    account: string | null,
  ) {

    const detail: WalletAccountChangedDetail = {
      account,
    }




    window.dispatchEvent(
      new CustomEvent<WalletAccountChangedDetail>(
        WALLET_ACCOUNT_CHANGED_EVENT,
        {
          detail,
        },
      ),
    )
  }


  // ====================================================
  // Clear Frontend Wallet State
  //
  // IMPORTANT:
  //
  // This does NOT touch transactionHistory.ts.
  //
  // It only clears WalletButton UI state.
  //
  // Transaction history remains stored by:
  //
  //     Network
  //     +
  //     Executor
  //     +
  //     Wallet
  // ====================================================

  function clearWalletState() {



    if (
      !mountedRef.current
    ) {
      return
    }


    setWalletAddress(
      null,
    )

    setIsConnected(
      false,
    )

    setError(
      null,
    )


    // --------------------------------------------------
    // Tell other application components that the wallet
    // is no longer active.
    // --------------------------------------------------

    notifyWalletAccountChanged(
      null,
    )
  }


  // ====================================================
  // Apply Active Wallet Account
  //
  // This is the single place where a successfully
  // detected MetaMask account becomes the application's
  // active account.
  // ====================================================

  function applyWalletAccount(
  account: string,
) {

    const normalizedAccount =
      normalizeAddress(
        account,
      )








    if (
      mountedRef.current
    ) {

      setWalletAddress(
        normalizedAccount,
      )

      setIsConnected(
        true,
      )

      setError(
        null,
      )
    }


    // --------------------------------------------------
    // Notify TransactionsPage / other components.
    // --------------------------------------------------

    notifyWalletAccountChanged(
      normalizedAccount,
    )





    return normalizedAccount
  }


  // ====================================================
  // Read Current MetaMask Account
  //
  // IMPORTANT:
  //
  // This function uses eth_accounts ONLY.
  //
  // It never opens MetaMask.
  // ====================================================

  async function readCurrentMetaMaskAccount():
    Promise<string | null> {

    const ethereum =
      getEthereum()


    if (
      !ethereum
    ) {

      console.warn(
        '[WalletButton] MetaMask / window.ethereum not available.',
      )

      return null
    }


    const result =
      await ethereum.request({
        method:
          'eth_accounts',
      })


    const accounts =
      Array.isArray(result)
        ? result as string[]
        : []




    if (
      accounts.length === 0
    ) {
      return null
    }


    const account =
      accounts[0]


    if (
      typeof account !== 'string' ||
      account.trim().length === 0
    ) {
      return null
    }


    return normalizeAddress(
      account,
    )
  }


  // ====================================================
  // Sync Wallet Account
  //
  // IMPORTANT:
  //
  // This function NEVER calls:
  //
  //     eth_requestAccounts
  //
  // It only synchronizes an already-permitted account.
  //
  // accountOverride is used for accountsChanged.
  //
  // This is important because the accountChanged event
  // already contains the authoritative new account.
  // ====================================================

  async function syncWalletAccount(
    source:
      | 'INITIAL_LOAD'
      | 'ACCOUNT_CHANGED'
      | 'MANUAL_SYNC'
      | 'CHAIN_CHANGED',
    accountOverride?: string | null,
  ) {





    try {

      let account: string | null =
        null


      // ------------------------------------------------
      // ACCOUNT_CHANGED
      //
      // Use the account supplied directly by MetaMask.
      //
      // Do NOT immediately call eth_accounts here.
      //
      // This avoids reading a stale provider account while
      // MetaMask is still updating internally.
      // ------------------------------------------------

      if (
        source === 'ACCOUNT_CHANGED' &&
        typeof accountOverride === 'string' &&
        accountOverride.trim().length > 0
      ) {

        account =
          normalizeAddress(
            accountOverride,
          )


      } else {

        account =
          await readCurrentMetaMaskAccount()
      }


      // ------------------------------------------------
      // No connected account
      // ------------------------------------------------

      if (
        !account
      ) {


        clearWalletState()

        return null
      }


      return applyWalletAccount(
            account,
          )

    } catch (syncError) {

      console.error(
        '[WalletButton] Account sync failed:',
        syncError,
      )


      if (
        mountedRef.current
      ) {

        setError(
          syncError instanceof Error
            ? syncError.message
            : 'Failed to sync MetaMask account.',
        )
      }


      return null
    }
  }


  // ====================================================
  // Connect Wallet
  //
  // ONLY this function calls eth_requestAccounts.
  //
  // This is an explicit user operation.
  // ====================================================

  async function connectWallet() {

    if (
      isConnecting ||
      isDisconnecting
    ) {
      return
    }


    const ethereum =
      getEthereum()


    if (
      !ethereum
    ) {

      setError(
        'MetaMask is not installed.',
      )

      return
    }






    try {

      setIsConnecting(
        true,
      )

      setError(
        null,
      )


      // ------------------------------------------------
      // Explicit MetaMask connection request.
      // ------------------------------------------------

      const result =
        await ethereum.request({
          method:
            'eth_requestAccounts',
        })


      const accounts =
        Array.isArray(result)
          ? result as string[]
          : []




      if (
        accounts.length === 0
      ) {

        throw new Error(
          'MetaMask returned no accounts.',
        )
      }


      const account =
        accounts[0]


      if (
        typeof account !== 'string' ||
        account.trim().length === 0
      ) {

        throw new Error(
          'MetaMask returned an invalid account.',
        )
      }


      // ------------------------------------------------
      // Apply the account returned by the explicit
      // connection request.
      //
      // Do not call eth_requestAccounts again.
      // ------------------------------------------------

      applyWalletAccount(
          account,
        )




    } catch (connectError: any) {

      console.error(
        '[WalletButton] Wallet connection failed:',
        connectError,
      )


      // ------------------------------------------------
      // User rejected connection.
      // ------------------------------------------------

      if (
        connectError?.code === 4001 ||
        connectError?.reason === 'rejected'
      ) {

        if (
          mountedRef.current
        ) {

          setError(
            'Wallet connection was cancelled.',
          )
        }

      } else {

        if (
          mountedRef.current
        ) {

          setError(
            connectError instanceof Error
              ? connectError.message
              : 'Failed to connect wallet.',
          )
        }
      }

    } finally {

      if (
        mountedRef.current
      ) {

        setIsConnecting(
          false,
        )
      }
    }
  }


  // ====================================================
  // Manual Account Sync
  //
  // This is intentionally a separate user operation.
  //
  // Use this when MetaMask was changed manually and the
  // user wants to force an account synchronization.
  // ====================================================

  async function handleManualSync() {

    if (
      isSyncing ||
      isConnecting ||
      isDisconnecting
    ) {
      return
    }






    try {

      setIsSyncing(
        true,
      )

      setError(
        null,
      )


      await syncWalletAccount(
        'MANUAL_SYNC',
      )

    } finally {

      if (
        mountedRef.current
      ) {

        setIsSyncing(
          false,
        )
      }
    }
  }


  // ====================================================
  // Disconnect Wallet
  //
  // IMPORTANT:
  //
  // 1. Clear frontend wallet state.
  // 2. Attempt MetaMask permission revocation.
  // 3. Do NOT delete transaction history.
  //
  // If MetaMask does not support permission revocation,
  // the application still remains disconnected.
  // ====================================================

  async function disconnectWallet() {

    if (
      isDisconnecting
    ) {
      return
    }


    const ethereum =
      getEthereum()






    try {

      setIsDisconnecting(
        true,
      )

      setError(
        null,
      )


      // ------------------------------------------------
      // Clear frontend state FIRST.
      // ------------------------------------------------

      clearWalletState()


      // ------------------------------------------------
      // Ask MetaMask to revoke this site's account
      // permission.
      //
      // This is best-effort because not every injected
      // provider supports wallet_revokePermissions.
      // ------------------------------------------------

      if (
        ethereum
      ) {

        try {

          await ethereum.request({
            method:
              'wallet_revokePermissions',

            params: [
              {
                eth_accounts: {},
              },
            ],
          })



        } catch (revokeError) {

          console.warn(
            '[WalletButton] MetaMask permission revocation unavailable or rejected.',
            revokeError,
          )
        }


        // ------------------------------------------------
        // Do not call eth_requestAccounts here.
        //
        // Verify only with eth_accounts.
        // ------------------------------------------------

        try {

          const accounts =
            await readCurrentMetaMaskAccount()




          if (
            accounts
          ) {

            console.warn(
              '[WalletButton] MetaMask still exposes an account after disconnect.',
            )

            console.warn(
              '[WalletButton] Application remains disconnected until Connect is pressed.',
            )
          }

        } catch (verifyError) {

          console.warn(
            '[WalletButton] Unable to verify MetaMask disconnect state:',
            verifyError,
          )
        }
      }





    } finally {

      if (
        mountedRef.current
      ) {

        setIsDisconnecting(
          false,
        )
      }
    }
  }


  // ====================================================
  // MetaMask Event: Accounts Changed
  //
  // IMPORTANT:
  //
  // MetaMask sends the NEW account in this event.
  //
  // We therefore use that account directly.
  //
  // NEVER call eth_requestAccounts here.
  //
  // This is the critical fix for:
  //
  // MetaMask Account 1
  //        ↓
  // application still showing Test Account
  // ====================================================

  function handleAccountsChanged(
    ...args: unknown[]
  ) {

    const accounts =
      Array.isArray(args[0])
        ? args[0] as string[]
        : []







    // --------------------------------------------------
    // MetaMask reports no connected account.
    // --------------------------------------------------

    if (
      accounts.length === 0
    ) {


      clearWalletState()

      return
    }


    const account =
      accounts[0]


    if (
      typeof account !== 'string' ||
      account.trim().length === 0
    ) {

      console.warn(
        '[WalletButton] accountsChanged returned invalid account.',
      )

      return
    }


    // --------------------------------------------------
    // Synchronize directly from the event.
    //
    // No eth_requestAccounts.
    // No reconnect.
    // No MetaMask popup.
    // --------------------------------------------------

    void syncWalletAccount(
      'ACCOUNT_CHANGED',
      account,
    )
  }


  // ====================================================
  // MetaMask Event: Chain Changed
  //
  // Do not reconnect the wallet.
  //
  // Only synchronize the current account.
  // ====================================================

  function handleChainChanged(
        ..._args: unknown[]
      ) {
        void syncWalletAccount(
          'CHAIN_CHANGED',
        )
      }


  // ====================================================
  // Initial Setup
  //
  // IMPORTANT:
  //
  // Initial load uses eth_accounts only.
  //
  // We DO NOT automatically call eth_requestAccounts.
  // ====================================================

  useEffect(() => {

    mountedRef.current =
      true


    const ethereum =
      getEthereum()




    if (
      !ethereum
    ) {

      console.warn(
        '[WalletButton] MetaMask / window.ethereum not available.',
      )

      return () => {

        mountedRef.current =
          false
      }
    }


    // --------------------------------------------------
    // Initial silent account check.
    // --------------------------------------------------

    void syncWalletAccount(
      'INITIAL_LOAD',
    )


    // --------------------------------------------------
    // Register MetaMask listeners.
    // --------------------------------------------------



    if (
      ethereum.on
    ) {

      ethereum.on(
        'accountsChanged',
        handleAccountsChanged,
      )

      ethereum.on(
        'chainChanged',
        handleChainChanged,
      )
    }




    // --------------------------------------------------
    // Cleanup MetaMask listeners.
    // --------------------------------------------------

    return () => {

      mountedRef.current =
        false


      if (
        ethereum.removeListener
      ) {

        ethereum.removeListener(
          'accountsChanged',
          handleAccountsChanged,
        )

        ethereum.removeListener(
          'chainChanged',
          handleChainChanged,
        )
      }


    }

    // The listener registration intentionally happens
    // once when WalletButton is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // ====================================================
  // Render
  // ====================================================

  return (
    <div
      className="
        flex
        items-center
        gap-2
      "
    >

      {/* =================================================
          Disconnected
          ================================================= */}

      {!isConnected && (

        <button
          type="button"
          onClick={connectWallet}
          disabled={
            isConnecting ||
            isDisconnecting
          }
          className="
            rounded-lg
            border
            border-slate-700
            bg-slate-900
            px-4
            py-2
            text-sm
            font-medium
            text-white
            transition
            hover:border-emerald-500/50
            hover:bg-slate-800
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
        >

          {isConnecting
            ? 'Connecting...'
            : 'Connect'}

        </button>
      )}


      {/* =================================================
          Connected
          ================================================= */}

      {isConnected && walletAddress && (

        <>

          {/* -----------------------------------------------
              Wallet Address
              ----------------------------------------------- */}

          <div
            className="
              rounded-lg
              border
              border-emerald-500/20
              bg-emerald-500/5
              px-3
              py-2
              text-xs
              font-medium
              text-emerald-400
            "
            title={walletAddress}
          >

            {formatAddress(
              walletAddress,
            )}

          </div>


          {/* -----------------------------------------------
              Sync Account
              ----------------------------------------------- */}

          <button
            type="button"
            onClick={handleManualSync}
            disabled={
              isSyncing ||
              isConnecting ||
              isDisconnecting
            }
            className="
              rounded-lg
              border
              border-slate-700
              bg-slate-900
              px-3
              py-2
              text-xs
              font-medium
              text-slate-300
              transition
              hover:border-emerald-500/40
              hover:text-emerald-400
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
            title="Synchronize the currently selected MetaMask account"
          >

            {isSyncing
              ? 'Syncing...'
              : 'Sync'}

          </button>


          {/* -----------------------------------------------
              Disconnect
              ----------------------------------------------- */}

          <button
            type="button"
            onClick={disconnectWallet}
            disabled={
              isDisconnecting ||
              isConnecting
            }
            className="
              rounded-lg
              border
              border-slate-700
              bg-slate-900
              px-3
              py-2
              text-xs
              font-medium
              text-slate-300
              transition
              hover:border-red-500/40
              hover:text-red-400
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >

            {isDisconnecting
              ? 'Disconnecting...'
              : 'Disconnect'}

          </button>

        </>
      )}


      {/* =================================================
          Error
          ================================================= */}

      {error && (

        <span
          className="
            max-w-[220px]
            truncate
            text-xs
            text-red-400
          "
          title={error}
        >
          {error}
        </span>

      )}

    </div>
  )
}


// ======================================================
// Export
// ======================================================

export default WalletButton