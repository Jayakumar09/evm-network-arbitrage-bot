// ======================================================
// Wallet Button
// MetaMask / Ethereum Sepolia
// ======================================================

import { useEffect, useState } from 'react'
import { getProvider } from '../services/blockchain'


// ======================================================
// Wallet Button
// ======================================================

function WalletButton() {
  const [account, setAccount] =
    useState<string | null>(null)

  const [connecting, setConnecting] =
    useState(false)


  // ======================================================
  // Format Address
  // ======================================================

  function formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }


  // ======================================================
  // Update Account
  // ======================================================

  function updateAccount(
    accounts: string[],
  ) {
    if (accounts.length === 0) {
      setAccount(null)

      console.log(
        'MetaMask account disconnected.',
      )

      return
    }

    const newAccount =
      accounts[0]

    setAccount(newAccount)

    console.log(
      'MetaMask current account:',
      newAccount,
    )
  }


  // ======================================================
  // Load Current MetaMask Account
  // ======================================================

  useEffect(() => {
    let mounted = true

    async function loadWallet() {
      try {
        const provider =
          await getProvider()

        const accounts =
          await provider.send(
            'eth_accounts',
            [],
          )

        if (!mounted) {
          return
        }

        updateAccount(accounts)

      } catch (error) {
        console.error(
          'Failed to load wallet:',
          error,
        )

        if (mounted) {
          setAccount(null)
        }
      }
    }

    loadWallet()

    return () => {
      mounted = false
    }
  }, [])


  // ======================================================
  // Listen for MetaMask Account Changes
  // ======================================================

  useEffect(() => {
    if (!window.ethereum) {
      return
    }


    const handleAccountsChanged = (
      accounts: string[],
    ) => {
      console.log(
        'MetaMask accountsChanged:',
        accounts,
      )

      updateAccount(accounts)
    }


    window.ethereum.on(
      'accountsChanged',
      handleAccountsChanged,
    )


    return () => {
      window.ethereum?.removeListener(
        'accountsChanged',
        handleAccountsChanged,
      )
    }
  }, [])


  // ======================================================
  // Listen for Network Changes
  // ======================================================

  // ======================================================
// Listen for Network Changes
// ======================================================

useEffect(() => {
  if (!window.ethereum) {
    return
  }


  const handleChainChanged = () => {
    console.log(
      'MetaMask network changed.',
    )


    window.ethereum
      ?.request({
        method: 'eth_accounts',
      })
      .then((accounts) => {

        if (
          Array.isArray(accounts) &&
          accounts.every(
            (account): account is string =>
              typeof account === 'string',
          )
        ) {
          updateAccount(accounts)
        } else {
          updateAccount([])
        }

      })
      .catch((error) => {
        console.error(
          'Failed to reload account after network change:',
          error,
        )

        setAccount(null)
      })
  }


  window.ethereum.on(
    'chainChanged',
    handleChainChanged,
  )


  return () => {
    window.ethereum?.removeListener(
      'chainChanged',
      handleChainChanged,
    )
  }
}, [])


  // ======================================================
  // Connect Wallet
  // ======================================================

  async function connectWallet() {
    try {
      setConnecting(true)


      const provider =
        await getProvider()


      // --------------------------------------------------
      // Request MetaMask Connection
      // --------------------------------------------------

      const accounts =
        await provider.send(
          'eth_requestAccounts',
          [],
        )


      if (accounts.length === 0) {
        throw new Error(
          'No MetaMask account was selected.',
        )
      }


      updateAccount(accounts)

    } catch (error) {
      console.error(
        'Wallet connection failed:',
        error,
      )

    } finally {
      setConnecting(false)
    }
  }


  // ======================================================
  // Disconnect Wallet
  // ======================================================

  async function disconnectWallet() {
    try {
      setConnecting(true)


      // --------------------------------------------------
      // Clear frontend state immediately
      // --------------------------------------------------

      setAccount(null)


      // --------------------------------------------------
      // Revoke MetaMask dApp permission
      // --------------------------------------------------

      if (window.ethereum) {
        try {
          await window.ethereum.request({
            method:
              'wallet_revokePermissions',
            params: [
              {
                eth_accounts: {},
              },
            ],
          })

          console.log(
            'MetaMask dApp permission revoked.',
          )

        } catch (error) {
          console.log(
            'MetaMask permission revoke not supported or rejected.',
            error,
          )
        }
      }


      console.log(
        'Frontend wallet disconnected.',
      )

    } catch (error) {
      console.error(
        'Wallet disconnect failed:',
        error,
      )

      // Always clear frontend state
      setAccount(null)

    } finally {
      setConnecting(false)
    }
  }


  // ======================================================
  // Render Connected Wallet
  // ======================================================

  if (account) {
    return (
      <div className="flex items-center gap-2">

        <span
          className="
            rounded-lg
            border
            border-emerald-500/20
            bg-emerald-500/10
            px-4
            py-2
            text-sm
            font-medium
            text-emerald-400
          "
        >
          {formatAddress(account)}
        </span>


        <button
          type="button"
          onClick={disconnectWallet}
          disabled={connecting}
          className="
            rounded-lg
            border
            border-slate-700
            bg-slate-900
            px-3
            py-2
            text-sm
            font-semibold
            text-slate-300
            transition
            hover:border-red-500/50
            hover:bg-red-500/10
            hover:text-red-400
            disabled:cursor-not-allowed
            disabled:opacity-60
          "
          title="Disconnect wallet"
        >
          {connecting
            ? 'Disconnecting...'
            : 'Disconnect'}
        </button>

      </div>
    )
  }


  // ======================================================
  // Render Disconnected Wallet
  // ======================================================

  return (
    <button
      type="button"
      onClick={connectWallet}
      disabled={connecting}
      className="
        rounded-lg
        border
        border-slate-700
        bg-slate-900
        px-4
        py-2
        text-sm
        font-semibold
        text-white
        transition
        hover:border-emerald-500/50
        hover:bg-slate-800
        disabled:cursor-not-allowed
        disabled:opacity-60
      "
    >
      {connecting
        ? 'Connecting...'
        : 'Connect Wallet'}
    </button>
  )
}


export default WalletButton