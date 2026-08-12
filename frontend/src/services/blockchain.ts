// ======================================================
// Blockchain Service
// Ethereum Sepolia
// ======================================================

import {
  BrowserProvider,
  Contract,
  formatEther,
  formatUnits,
  type Eip1193Provider,
} from 'ethers'

import {
  EXECUTOR_CONTRACT_ADDRESS,
  USDC_ADDRESS,
  WETH_ADDRESS,
} from '../config/contracts'

import { ERC20_ABI } from '../abi/erc20'

// ======================================================
// MetaMask Provider Type
// ======================================================

type WindowWithEthereum = Window & {
  ethereum?: Eip1193Provider
}

// ======================================================
// Executor Read-Only ABI
// ======================================================

const EXECUTOR_READ_ABI = [
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function getTokenBalance(address tokenAddress) view returns (uint256)',
]

// ======================================================
// Executor Write ABI
// ======================================================

const EXECUTOR_WRITE_ABI = [
  'function emergencyPause()',
  'function emergencyUnpause()',
  'function transferOwnership(address newOwner)',
]

// ======================================================
// Emergency Pause Executor
// ======================================================

export async function emergencyPauseExecutor(): Promise<string> {
  const provider = await getProvider()

  const signer = await provider.getSigner()

  const executor = new Contract(
    EXECUTOR_CONTRACT_ADDRESS,
    EXECUTOR_WRITE_ABI,
    signer,
  )

  const transaction =
    await executor.emergencyPause()

  await transaction.wait()

  return transaction.hash
}


// ======================================================
// Emergency Unpause Executor
// ======================================================

export async function emergencyUnpauseExecutor(): Promise<string> {
  const provider = await getProvider()

  const signer = await provider.getSigner()

  const executor = new Contract(
    EXECUTOR_CONTRACT_ADDRESS,
    EXECUTOR_WRITE_ABI,
    signer,
  )

  const transaction =
    await executor.emergencyUnpause()

  await transaction.wait()

  return transaction.hash
}


// ======================================================
// Transfer Executor Ownership
// ======================================================

export async function transferExecutorOwnership(
  newOwner: string,
): Promise<string> {
  const provider = await getProvider()

  const signer = await provider.getSigner()

  const executor = new Contract(
    EXECUTOR_CONTRACT_ADDRESS,
    EXECUTOR_WRITE_ABI,
    signer,
  )

  const transaction =
    await executor.transferOwnership(
      newOwner,
    )

  await transaction.wait()

  return transaction.hash
}

// ======================================================
// Get MetaMask Provider
// ======================================================

export async function getProvider(): Promise<BrowserProvider> {
  const ethereum = (window as WindowWithEthereum).ethereum

  if (!ethereum) {
    throw new Error('MetaMask is not installed.')
  }

  return new BrowserProvider(ethereum)
}

// ======================================================
// Get Connected Wallet Address
// ======================================================

export async function getConnectedWalletAddress(): Promise<string | null> {
  const provider = await getProvider()

  const accounts = await provider.send(
    'eth_accounts',
    [],
  )

  if (accounts.length === 0) {
    return null
  }

  return accounts[0]
}

// ======================================================
// Get Executor Contract
// ======================================================

async function getExecutorContract(): Promise<Contract> {
  const provider = await getProvider()

  return new Contract(
    EXECUTOR_CONTRACT_ADDRESS,
    EXECUTOR_READ_ABI,
    provider,
  )
}

// ======================================================
// Get Executor Owner
// ======================================================

export async function getExecutorOwner(): Promise<string> {
  const contract = await getExecutorContract()

  return await contract.owner()
}

// ======================================================
// Get Executor Paused Status
// ======================================================

export async function getExecutorPaused(): Promise<boolean> {
  const contract = await getExecutorContract()

  return await contract.paused()
}

// ======================================================
// Get Executor ETH Balance
// ======================================================

export async function getExecutorETHBalance(): Promise<string> {
  const provider = await getProvider()

  const balance = await provider.getBalance(
    EXECUTOR_CONTRACT_ADDRESS,
  )

  return formatEther(balance)
}

// ======================================================
// Get Executor USDC Balance
// ======================================================

export async function getExecutorUSDCBalance(): Promise<string> {
  const provider = await getProvider()

  const usdcContract = new Contract(
    USDC_ADDRESS,
    ERC20_ABI,
    provider,
  )

  const balance = await usdcContract.balanceOf(
    EXECUTOR_CONTRACT_ADDRESS,
  )

  return formatUnits(balance, 6)
}

// ======================================================
// Get Executor WETH Balance
// ======================================================

export async function getExecutorWETHBalance(): Promise<string> {
  const provider = await getProvider()

  const wethContract = new Contract(
    WETH_ADDRESS,
    ERC20_ABI,
    provider,
  )

  const balance = await wethContract.balanceOf(
    EXECUTOR_CONTRACT_ADDRESS,
  )

  return formatUnits(balance, 18)
}

// ======================================================
// Get Connected Wallet ETH Balance
// ======================================================

export async function getWalletETHBalance(): Promise<string> {
  const provider = await getProvider()

  const wallet =
    await getConnectedWalletAddress()

  if (!wallet) {
    return '0'
  }

  const balance =
    await provider.getBalance(wallet)

  return formatEther(balance)
}


// ======================================================
// Get Connected Wallet USDC Balance
// ======================================================

export async function getWalletUSDCBalance(): Promise<string> {
  const provider = await getProvider()

  const wallet =
    await getConnectedWalletAddress()

  if (!wallet) {
    return '0'
  }

  const usdcContract = new Contract(
    USDC_ADDRESS,
    ERC20_ABI,
    provider,
  )

  const balance =
    await usdcContract.balanceOf(wallet)

  return formatUnits(balance, 6)
}


// ======================================================
// Get Connected Wallet WETH Balance
// ======================================================

export async function getWalletWETHBalance(): Promise<string> {
  const provider = await getProvider()

  const wallet =
    await getConnectedWalletAddress()

  if (!wallet) {
    return '0'
  }

  const wethContract = new Contract(
    WETH_ADDRESS,
    ERC20_ABI,
    provider,
  )

  const balance =
    await wethContract.balanceOf(wallet)

  return formatUnits(balance, 18)
}

// ======================================================
// Check Executor Owner
// ======================================================

export async function isConnectedWalletExecutorOwner(): Promise<boolean> {
  const connectedWallet =
    await getConnectedWalletAddress()

  if (!connectedWallet) {
    return false
  }

  const owner = await getExecutorOwner()

  return (
    connectedWallet.toLowerCase() ===
    owner.toLowerCase()
  )
}