// ======================================================
// Blockchain Service
// Ethereum Sepolia
// ======================================================

import {
  BrowserProvider,
  Contract,
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