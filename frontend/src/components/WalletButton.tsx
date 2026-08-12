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
  const [account, setAccount] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  // ======================================================
  // Format Address
  // ======================================================

  function formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // ======================================================
  // Load Existing Connection
  // ======================================================

  useEffect(() => {
    async function loadWallet() {
      try {
        const provider = await getProvider()

        const accounts = await provider.send(
          'eth_accounts',
          [],
        )

        if (accounts.length > 0) {
          setAccount(accounts[0])
        }
      } catch (error) {
        console.error(
          'Failed to load wallet:',
          error,
        )
      }
    }

    loadWallet()
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
      if (accounts.length === 0) {
        setAccount(null)
      } else {
        setAccount(accounts[0])
      }
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
  // Connect Wallet
  // ======================================================

  async function connectWallet() {
    try {
      setConnecting(true)

      const provider = await getProvider()

      // --------------------------------------------------
      // Request MetaMask connection
      // --------------------------------------------------

      const accounts = await provider.send(
        'eth_requestAccounts',
        [],
      )

      if (accounts.length === 0) {
        throw new Error(
          'No MetaMask account was selected.',
        )
      }

      setAccount(accounts[0])

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
  // Render
  // ======================================================

 // ======================================================
// Connected Wallet
// ======================================================

if (account) {
  return (
    <div className="flex items-center gap-2">

      <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400">
        {formatAddress(account)}
      </span>

      <button
        type="button"
        onClick={() => setAccount(null)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400"
        title="Disconnect wallet"
      >
        Disconnect
      </button>

    </div>
  )
}

  return (
    <button
      type="button"
      onClick={connectWallet}
      disabled={connecting}
      className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-500/50 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {connecting
        ? 'Connecting...'
        : 'Connect Wallet'}
    </button>
  )

    // ======================================================
  // Disconnected Wallet
  // ======================================================

  return (
    <button
      type="button"
      onClick={connectWallet}
      disabled={connecting}
      className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-500/50 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {connecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
  )
}

export default WalletButton