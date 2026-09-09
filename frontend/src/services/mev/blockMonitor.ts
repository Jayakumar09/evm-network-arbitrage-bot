import type { Provider } from 'ethers'

import { getProvider } from '../blockchain'

import type { MonitoredBlock } from '../../types/mev'

export interface BlockMonitorCallbacks {
  onBlock?: (block: MonitoredBlock) => void
  onError?: (error: Error) => void
}

export class BlockMonitor {
  private provider: Provider | null = null

  private callbacks: BlockMonitorCallbacks

  private running = false

  private lastBlockNumber: number | null = null

  constructor(
    callbacks: BlockMonitorCallbacks = {},
  ) {
    this.callbacks = callbacks
  }

  /**
   * Start listening for new Ethereum Sepolia blocks.
   *
   * Uses the existing Phase 1 MetaMask provider.
   */
  async start(): Promise<void> {
    if (this.running) {
      return
    }

    try {
      this.provider = await getProvider()

      this.running = true

      const currentBlock =
        await this.provider.getBlockNumber()

      this.lastBlockNumber =
        currentBlock

      await this.processBlock(
        currentBlock,
      )

      this.provider.on(
        'block',
        this.handleNewBlock,
      )

      console.log(
        '[MEV BLOCK MONITOR] Started',
      )

      console.log(
        '[MEV BLOCK MONITOR] Current block:',
        currentBlock,
      )
    } catch (error) {
      this.running = false
      this.provider = null

      this.handleError(error)
    }
  }

  /**
   * Stop listening for new blocks.
   */
  stop(): void {
    if (
      !this.running ||
      !this.provider
    ) {
      return
    }

    this.provider.off(
      'block',
      this.handleNewBlock,
    )

    this.running = false

    this.provider = null

    console.log(
      '[MEV BLOCK MONITOR] Stopped',
    )
  }

  /**
   * Return whether the monitor is running.
   */
  isRunning(): boolean {
    return this.running
  }

  /**
   * Return the last processed block.
   */
  getLastBlockNumber(): number | null {
    return this.lastBlockNumber
  }

  /**
   * Handle a newly detected block.
   */
  private handleNewBlock = async (
    blockNumber: number,
  ): Promise<void> => {
    if (!this.running) {
      return
    }

    try {
      await this.processBlock(
        blockNumber,
      )
    } catch (error) {
      this.handleError(error)
    }
  }

  /**
   * Load block information.
   */
  private async processBlock(
    blockNumber: number,
  ): Promise<void> {
    if (!this.provider) {
      return
    }

    const block =
      await this.provider.getBlock(
        blockNumber,
        false,
      )

    if (!block) {
      return
    }

    const monitoredBlock:
      MonitoredBlock = {
        number: block.number,
        hash: block.hash ?? '',
        timestamp: block.timestamp,
        transactionCount:
          block.transactions.length,
      }

    this.lastBlockNumber =
      block.number

    console.log(
      '[MEV BLOCK MONITOR] New block',
      {
        number:
          monitoredBlock.number,

        hash:
          monitoredBlock.hash,

        timestamp:
          monitoredBlock.timestamp,

        transactions:
          monitoredBlock.transactionCount,
      },
    )

    this.callbacks.onBlock?.(
      monitoredBlock,
    )
  }

  /**
   * Normalize and report errors.
   */
  private handleError(
    error: unknown,
  ): void {
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(
            String(error),
          )

    console.error(
      '[MEV BLOCK MONITOR] ERROR:',
      normalizedError,
    )

    this.callbacks.onError?.(
      normalizedError,
    )
  }
}

// ======================================================
// DEVELOPMENT TEST HOOK
// Exposes the MEV block monitor to browser console.
// No monitoring starts automatically.
// ======================================================

if (import.meta.env.DEV) {
  let devBlockMonitor: BlockMonitor | null = null

  ;(window as any).startMevBlockMonitor = async (): Promise<void> => {
    if (devBlockMonitor?.isRunning()) {
      console.log(
        '[MEV BLOCK MONITOR TEST] Already running',
      )
      return
    }

    devBlockMonitor = new BlockMonitor({
      onBlock: (block) => {
        console.log(
          '[MEV BLOCK MONITOR TEST] BLOCK RECEIVED:',
          block,
        )
      },
      onError: (error) => {
        console.error(
          '[MEV BLOCK MONITOR TEST] ERROR:',
          error,
        )
      },
    })

    await devBlockMonitor.start()
  }

  ;(window as any).stopMevBlockMonitor = (): void => {
    if (!devBlockMonitor) {
      console.log(
        '[MEV BLOCK MONITOR TEST] Not running',
      )
      return
    }

    devBlockMonitor.stop()
    devBlockMonitor = null

    console.log(
      '[MEV BLOCK MONITOR TEST] Stopped',
    )
  }
}

