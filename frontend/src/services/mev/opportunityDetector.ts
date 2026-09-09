import {
  AbiCoder,
} from "ethers";

import type {
  MonitoredTransaction,
  BackrunCandidate,
} from "../../types/mev";

import {
  decodeV2SwapCalldata,
} from "./v2CalldataDecoder";

export interface OpportunityDetectorConfig {
  watchedContracts?: string[];

  minimumValueWei?: bigint;

  /**
   * Minimum calldata size to consider a transaction
   * potentially relevant to a contract interaction.
   */
  minimumCalldataLength?: number;

  /**
   * Function selectors that are recognized as swap calls.
   */
  recognizedFunctionSelectors?: string[];
}

const V2_SWAP_EXACT_TOKENS_FOR_TOKENS_SELECTOR =
  "0x38ed1739";

export class OpportunityDetector {
  private config: OpportunityDetectorConfig;

  constructor(
    config: OpportunityDetectorConfig = {},
  ) {
    this.config = {
      minimumCalldataLength: 10,

      recognizedFunctionSelectors: [
        "0x38ed1739",
        "0x8803dbee",
        "0x7ff36ab5",
        "0x4a25d94a",
        "0x18cbafe5",
        "0xfb3bdb41",
      ],

      ...config,
    };
  }

  detect(
    transaction: MonitoredTransaction,
  ): BackrunCandidate | null {
    if (
      !this.isPotentiallyRelevant(
        transaction,
      )
    ) {
      return null;
    }

    const selector =
      transaction.data
        .slice(0, 10)
        .toLowerCase();

    if (
      selector ===
      V2_SWAP_EXACT_TOKENS_FOR_TOKENS_SELECTOR
    ) {
      const decoded =
        decodeV2SwapCalldata(
          transaction.data,
        );

      if (!decoded) {
        return null;
      }

      return {
        triggerTransactionHash:
          transaction.hash,

        blockNumber:
          transaction.blockNumber,

        tokenIn:
          decoded.tokenIn,

        tokenOut:
          decoded.tokenOut,

        amountIn:
          decoded.amountIn,

        description:
          this.createDescription(
            transaction,
            decoded.tokenIn,
            decoded.tokenOut,
            decoded.amountIn,
          ),

        detectedAt:
          Date.now(),
      };
    }

    return {
      triggerTransactionHash:
        transaction.hash,

      blockNumber:
        transaction.blockNumber,

      description:
        this.createDescription(
          transaction,
        ),

      detectedAt:
        Date.now(),
    };
  }

  detectMany(
    transactions: MonitoredTransaction[],
  ): BackrunCandidate[] {
    const candidates: BackrunCandidate[] = [];

    for (
      const transaction of transactions
    ) {
      const candidate =
        this.detect(
          transaction,
        );

      if (candidate) {
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  private isPotentiallyRelevant(
    transaction: MonitoredTransaction,
  ): boolean {
    if (!transaction.to) {
      return false;
    }

    if (
      this.config.minimumValueWei !==
        undefined &&
      transaction.value <
        this.config.minimumValueWei
    ) {
      return false;
    }

    if (
      transaction.data.length <
      (
        this.config.minimumCalldataLength ??
        10
      )
    ) {
      return false;
    }

    const watchedContracts =
      this.config.watchedContracts;

    if (
      watchedContracts &&
      watchedContracts.length > 0
    ) {
      const normalized =
        watchedContracts.map(
          (address) =>
            address.toLowerCase(),
        );

      if (
        !normalized.includes(
          transaction.to.toLowerCase(),
        )
      ) {
        return false;
      }
    }

    const recognizedSelectors =
      this.config
        .recognizedFunctionSelectors;

    if (
      recognizedSelectors &&
      recognizedSelectors.length > 0
    ) {
      const selector =
        transaction.data
          .slice(0, 10)
          .toLowerCase();

      const normalizedSelectors =
        recognizedSelectors.map(
          (value) =>
            value.toLowerCase(),
        );

      if (
        !normalizedSelectors.includes(
          selector,
        )
      ) {
        return false;
      }
    }

    return true;
  }

  private createDescription(
    transaction: MonitoredTransaction,
    tokenIn?: string,
    tokenOut?: string,
    amountIn?: bigint,
  ): string {
    const target =
      transaction.to ??
      "unknown";

    const selector =
      transaction.data
        .slice(0, 10)
        .toLowerCase();

    let description =
      `Potential MEV trigger transaction ` +
      `${transaction.hash.slice(0, 10)}... ` +
      `target=${target} ` +
      `selector=${selector}`;

    if (
      tokenIn &&
      tokenOut &&
      amountIn !== undefined
    ) {
      description +=
        ` tokenIn=${tokenIn}` +
        ` tokenOut=${tokenOut}` +
        ` amountIn=${amountIn.toString()}`;
    }

    return description;
  }
}

// ======================================================
// DEVELOPMENT TEST HOOK
// ======================================================

if (import.meta.env.DEV) {
  ;(
    window as any
  ).testMevOpportunityDetector =
    (): void => {
      console.log(
        "[MEV OPPORTUNITY DETECTOR TEST] Starting",
      );

      const detector =
        new OpportunityDetector();

      const abiCoder =
        AbiCoder.defaultAbiCoder();

      const tokenIn =
        "0x1111111111111111111111111111111111111111";

      const tokenOut =
        "0x2222222222222222222222222222222222222222";

      const recipient =
        "0x3333333333333333333333333333333333333333";

      const amountIn =
        1000000n;

      const amountOutMin =
        950000n;

      const deadline =
        2000000000n;

      const encodedParameters =
        abiCoder.encode(
          [
            "uint256",
            "uint256",
            "address[]",
            "address",
            "uint256",
          ],
          [
            amountIn,
            amountOutMin,
            [
              tokenIn,
              tokenOut,
            ],
            recipient,
            deadline,
          ],
        );

      const recognizedTransaction:
        MonitoredTransaction = {
        hash:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",

        blockNumber:
          11625136,

        from:
          "0x4444444444444444444444444444444444444444",

        to:
          "0x5555555555555555555555555555555555555555",

        value:
          0n,

        gasLimit:
          210000n,

        gasPrice:
          1000000000n,

        nonce:
          1,

        data:
          V2_SWAP_EXACT_TOKENS_FOR_TOKENS_SELECTOR +
          encodedParameters.slice(2),
      };

      const candidate =
        detector.detect(
          recognizedTransaction,
        );

      console.log(
        "[MEV OPPORTUNITY DETECTOR TEST] " +
          "RECOGNIZED V2 RESULT:",
        candidate,
      );

      if (!candidate) {
        console.error(
          "[MEV OPPORTUNITY DETECTOR TEST] FAILED: " +
            "V2 swap was not detected.",
        );

        return;
      }

      if (
        candidate.tokenIn?.toLowerCase() !==
          tokenIn.toLowerCase() ||
        candidate.tokenOut?.toLowerCase() !==
          tokenOut.toLowerCase() ||
        candidate.amountIn !==
          amountIn
      ) {
        console.error(
          "[MEV OPPORTUNITY DETECTOR TEST] FAILED: " +
            "Decoded V2 fields were not propagated.",
        );

        return;
      }

      const invalidCandidate =
        detector.detect({
          ...recognizedTransaction,
          data:
            "0xdeadbeef" +
            encodedParameters.slice(2),
        });

      console.log(
        "[MEV OPPORTUNITY DETECTOR TEST] " +
          "UNRECOGNIZED SELECTOR RESULT:",
        invalidCandidate,
      );

      if (
        invalidCandidate !== null
      ) {
        console.error(
          "[MEV OPPORTUNITY DETECTOR TEST] FAILED: " +
            "Unrecognized selector was accepted.",
        );

        return;
      }

      console.log(
        "[MEV OPPORTUNITY DETECTOR TEST] PASSED",
      );
    };
}