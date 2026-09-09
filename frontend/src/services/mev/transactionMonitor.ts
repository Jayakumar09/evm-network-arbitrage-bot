import type {
  Block,
  Provider,
} from "ethers";

import {
  getProvider,
  V2_ROUTER_ADDRESS,
} from "../blockchain";

import type {
  MonitoredTransaction,
} from "../../types/mev";

// ======================================================
// SEPOLIA DEX CONTRACTS MONITORED BY TRANSACTION MONITOR
// ======================================================

// Uniswap V3 SwapRouter02 deployment on Ethereum Sepolia.
const V3_ROUTER_ADDRESS =
  "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";

// ======================================================
// CALLBACKS
// ======================================================

export interface TransactionMonitorCallbacks {
  onTransaction?: (
    transaction: MonitoredTransaction,
  ) => void;

  onError?: (
    error: Error,
  ) => void;
}

// ======================================================
// TRANSACTION MONITOR
// ======================================================

export class TransactionMonitor {
  private provider: Provider | null = null;

  private callbacks: TransactionMonitorCallbacks;

  private running = false;

  constructor(
    callbacks: TransactionMonitorCallbacks = {},
  ) {
    this.callbacks = callbacks;
  }

  /**
   * Start the transaction monitor.
   *
   * The existing Phase 1 provider is reused.
   *
   * IMPORTANT:
   * TransactionMonitor does NOT subscribe to blocks directly.
   * The existing BlockMonitor is responsible for detecting
   * new blocks and will call processBlockNumber().
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    try {
      this.provider = await getProvider();

      this.running = true;

      const currentBlock =
        await this.provider.getBlockNumber();

      await this.processBlock(
        currentBlock,
      );

      console.log(
        "[MEV TRANSACTION MONITOR] Started",
      );

      console.log(
        "[MEV TRANSACTION MONITOR] Current block:",
        currentBlock,
      );
    } catch (error) {
      this.running = false;
      this.provider = null;

      this.handleError(error);
    }
  }

  /**
   * Stop monitoring.
   *
   * Block subscriptions are owned by BlockMonitor,
   * so there is no provider listener to remove here.
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    this.provider = null;

    console.log(
      "[MEV TRANSACTION MONITOR] Stopped",
    );
  }

  /**
   * Return monitor status.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Process a block detected by the existing BlockMonitor.
   *
   * This is the public entry point used by the
   * Phase 2 block -> transaction monitoring pipeline.
   */
  async processBlockNumber(
    blockNumber: number,
  ): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      await this.processBlock(
        blockNumber,
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Load the complete block including transactions.
   */
  private async processBlock(
    blockNumber: number,
  ): Promise<void> {
    if (!this.provider) {
      return;
    }

    console.log(
      "[MEV TRANSACTION MONITOR] Processing block:",
      blockNumber,
    );

    const block =
      await this.provider.getBlock(
        blockNumber,
        true,
      );

    if (!block) {
      console.warn(
        "[MEV TRANSACTION MONITOR] Block not available:",
        blockNumber,
      );

      return;
    }

    console.log(
      "[MEV TRANSACTION MONITOR] Transactions in block:",
      block.prefetchedTransactions.length,
    );

    await this.processTransactions(
      block,
    );
  }

  /**
   * Extract transactions from the block.
   *
   * V1:
   * - Log every transaction hash.
   * - Log destination.
   * - Identify transactions targeting monitored DEX routers.
   * - No calldata decoding.
   * - No swap-method detection.
   * - No simulation.
   * - No execution.
   */
  private async processTransactions(
    block: Block,
  ): Promise<void> {
    for (
      const transaction of
      block.prefetchedTransactions
    ) {
      const from =
        transaction.from;

      const to =
        transaction.to;

      const isMonitoredDex =
        this.matchesMonitoredDex(
          to,
        );

      console.log(
        "[MEV TRANSACTION MONITOR] Transaction",
        {
          blockNumber:
            block.number,

          hash:
            transaction.hash,

          from,

          to,

          monitoredDex:
            isMonitoredDex,
        },
      );

      if (!isMonitoredDex) {
        continue;
      }

      const monitoredTransaction:
        MonitoredTransaction = {
          hash:
            transaction.hash,

          blockNumber:
            block.number,

          from,

          to,

          value:
            transaction.value,

          gasLimit:
            transaction.gasLimit,

          gasPrice:
            transaction.gasPrice ??
            undefined,

          nonce:
            transaction.nonce,

          data:
            transaction.data,
        };

      console.log(
        "[MEV TRANSACTION MONITOR] DEX TRANSACTION DETECTED",
        {
          hash:
            monitoredTransaction.hash,

          blockNumber:
            monitoredTransaction.blockNumber,

          to:
            monitoredTransaction.to,
        },
      );

      this.callbacks.onTransaction?.(
        monitoredTransaction,
      );
    }
  }

  /**
   * Check whether the transaction destination
   * matches one of the monitored DEX routers.
   *
   * V1 monitors transaction.to only.
   */
  private matchesMonitoredDex(
    to: string | null,
  ): boolean {
    if (!to) {
      return false;
    }

    const normalizedTo =
      to.toLowerCase();

    if (
      normalizedTo ===
      V2_ROUTER_ADDRESS.toLowerCase()
    ) {
      return true;
    }

    if (
      normalizedTo ===
      V3_ROUTER_ADDRESS.toLowerCase()
    ) {
      return true;
    }

    return false;
  }

  /**
   * Apply optional address filtering.
   *
   * Retained for compatibility with the existing
   * TransactionMonitorOptions API.
   *
   * The V1 DEX detection itself is handled separately
   * by matchesMonitoredDex().
   */
  

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
          );

    console.error(
      "[MEV TRANSACTION MONITOR] ERROR:",
      normalizedError,
    );

    this.callbacks.onError?.(
      normalizedError,
    );
  }
}

// ======================================================
// DEVELOPMENT TEST HOOK
// Exposes the MEV transaction monitor to browser console.
// No monitoring starts automatically.
// ======================================================

if (import.meta.env.DEV) {
  let devTransactionMonitor:
    TransactionMonitor | null = null;

  ;(
    window as any
  ).startMevTransactionMonitor =
    async (): Promise<void> => {
      if (
        devTransactionMonitor?.isRunning()
      ) {
        console.log(
          "[MEV TRANSACTION MONITOR TEST] Already running",
        );

        return;
      }

      devTransactionMonitor =
        new TransactionMonitor(
          {
            onTransaction:
              (transaction) => {
                console.log(
                  "[MEV TRANSACTION MONITOR TEST] TRANSACTION RECEIVED:",
                  transaction,
                );
              },

            onError: (error) => {
              console.error(
                "[MEV TRANSACTION MONITOR TEST] ERROR:",
                error,
              );
            },
          },
        );

      await devTransactionMonitor.start();
    };

  ;(
    window as any
  ).stopMevTransactionMonitor =
    (): void => {
      if (!devTransactionMonitor) {
        console.log(
          "[MEV TRANSACTION MONITOR TEST] Not running",
        );

        return;
      }

      devTransactionMonitor.stop();

      devTransactionMonitor = null;

      console.log(
        "[MEV TRANSACTION MONITOR TEST] Stopped",
      );
    };
}