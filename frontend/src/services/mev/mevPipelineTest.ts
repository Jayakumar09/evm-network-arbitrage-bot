import { AbiCoder } from "ethers";
import { encodeMevBackrunParams } from '../blockchain'
import { encodeOperation3ExecutionData } from "./operation3Adapter";
import { BlockMonitor } from "./blockMonitor";
import { TransactionMonitor } from "./transactionMonitor";
import { OpportunityDetector } from "./opportunityDetector";
import { BackrunSimulator } from "./backrunSimulator";
import {
  quoteMevV2Candidate,
  revalidateMevV2Candidate,
} from "./mevV2Quote";

import {
  getProvider,
  V2_ROUTER_ADDRESS,
} from "../blockchain";

import {
  getV2PairState,
} from "./v2PairState";

import {
  simulateV2Swap,
} from "./v2StateSimulator";

import type {
  MonitoredTransaction,
  BackrunCandidate,
  BackrunSimulationResult,
} from "../../types/mev";



import {
  PaperExecutionService,
} from "./paperExecution";

import {
  paperExecutionStore,
} from "./paperExecutionStore";

import {
  mevOpportunityStore,
} from "./mevOpportunityStore";

// ======================================================
// DEVELOPMENT MEV PIPELINE TEST
//
// Live pipeline:
//
// TransactionMonitor
//      ↓
// OpportunityDetector
//      ↓
// MEV V2 Quote
//      ↓
// V2 Pair State
//      ↓
// Trigger State Simulation
//      ↓
// Backrun State Simulation
//      ↓
// BackrunSimulator
//      ↓
// MevProfitCalculator
//
// IMPORTANT:
// Read-only development testing only.
// No blockchain transaction is submitted.
// No wallet transaction is requested.
// ======================================================

const V2_SWAP_EXACT_TOKENS_FOR_TOKENS_SELECTOR =
  "0x38ed1739";

const SEPOLIA_USDC =
  "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

const SEPOLIA_WETH =
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";

const abiCoder =
  AbiCoder.defaultAbiCoder();

if (import.meta.env.DEV) {
  let devBlockMonitor:
  BlockMonitor | null = null;

  let devPipelineMonitor:
    TransactionMonitor | null = null;

  let devBackrunSimulator:
    BackrunSimulator | null = null;

  let devTransactionMonitorStartupBlock:
    number | null = null;
  // ====================================================
  // LIVE PIPELINE TEST
  // ====================================================

  (window as any).startMevPipelineTest =
      async (): Promise<void> => {
        if (
          devBlockMonitor?.isRunning() ||
          devPipelineMonitor?.isRunning()
        ) {
          console.log(
            "[MEV PIPELINE TEST] Already running",
          );

          return;
        }

        try {
          const provider =
            await getProvider();

          const detector =
            new OpportunityDetector({
              watchedContracts: [
                V2_ROUTER_ADDRESS,
              ],
            });

          devBackrunSimulator =
            new BackrunSimulator(
              provider,
              {
                minimumProfit: 0n,

                estimatedGasUnits:
                  300000n,

                profitToken:
                  "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",

                wrappedNativeToken:
                  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
              },
            );

          console.log(
            "[MEV PIPELINE TEST] Watching V2 router:",
            V2_ROUTER_ADDRESS,
          );

          console.log(
            "[MEV PIPELINE TEST] Full pipeline:",
            "BlockMonitor -> " +
              "TransactionMonitor -> " +
              "OpportunityDetector -> " +
              "V2 Quote -> " +
              "V2 Pair State -> " +
              "Trigger State -> " +
              "Backrun State -> " +
              "BackrunSimulator -> " +
              "MevProfitCalculator",
          );

          console.log(
            "[MEV PIPELINE TEST] Mode: READ-ONLY SIMULATION",
          );

          // ==================================================
          // TRANSACTION MONITOR
          // ==================================================

          devPipelineMonitor =
            new TransactionMonitor({
              onTransaction:
              async (
                transaction:
                  MonitoredTransaction,
              ): Promise<void> => {
                try {
                  const candidate:
                    BackrunCandidate | null =
                    detector.detect(
                      transaction,
                    );

                  if (!candidate) {
                    return;
                  }

                  console.log(
                    "[MEV PIPELINE TEST] " +
                      "CANDIDATE DETECTED:",
                    candidate,
                  );

                  if (
                    candidate.tokenIn &&
                    candidate.tokenOut &&
                    candidate.amountIn !==
                      undefined
                  ) {
                    const quote =
                      await quoteMevV2Candidate(
                        candidate,
                      );

                    if (!quote.success) {
                      console.error(
                        "[MEV PIPELINE TEST] " +
                          "V2 QUOTE FAILED:",
                        quote.error,
                      );

                      return;
                    }

                    candidate.expectedAmountOut =
                      quote.expectedAmountOut;

                    console.log(
                      "[MEV PIPELINE TEST] " +
                        "V2 QUOTE RESULT:",
                      {
                        amountIn:
                          quote.amountIn.toString(),

                        expectedAmountOut:
                          quote.expectedAmountOut.toString(),
                      },
                    );
                  }

                  if (
                    !devBackrunSimulator
                  ) {
                    console.error(
                      "[MEV PIPELINE TEST] " +
                        "Backrun simulator is unavailable.",
                    );

                    return;
                  }

                  const simulation:
                    BackrunSimulationResult =
                    await devBackrunSimulator.simulate(
                      candidate,
                    );

                  console.log(
                    "[MEV PIPELINE TEST] " +
                      "SIMULATION RESULT:",
                    {
                      triggerTransactionHash:
                        simulation.triggerTransactionHash,

                      success:
                        simulation.success,

                      expectedProfit:
                        simulation.expectedProfit.toString(),

                      gasCost:
                        simulation.gasCost.toString(),

                      netProfit:
                        simulation.netProfit.toString(),

                      profitable:
                        simulation.profitable,

                      error:
                        simulation.error,
                    },
                  );

                  // ==================================================
                  // SIMULATION SUCCESS GUARD
                  // ==================================================
                  //
                  // A failed simulation is not a valid MEV
                  // opportunity and must not update the UI store.
                  //
                  // This remains strictly read-only:
                  // - no wallet signature
                  // - no blockchain transaction
                  // - no state-changing operation
                  // ==================================================

                  if (!simulation.success) {
                    console.error(
                      "[MEV PIPELINE TEST] " +
                        "SIMULATION FAILED:",
                      simulation.error,
                    );

                    return;
                  }

                  // ==================================================
                  // PUBLISH SUCCESSFUL MEV SIMULATION
                  // ==================================================
                  //
                  // Publish only after the complete read-only
                  // simulation has succeeded.
                  //
                  // This updates in-memory UI state only.
                  // ==================================================

                  mevOpportunityStore.setOpportunity(
                    candidate,
                    simulation,
                  );

                  console.log(
                    "[MEV PIPELINE TEST] " +
                      "MEV OPPORTUNITY PUBLISHED TO STORE:",
                    {
                      triggerTransactionHash:
                        candidate.triggerTransactionHash,

                      blockNumber:
                        candidate.blockNumber,

                      profitable:
                        simulation.profitable,

                      netProfit:
                        simulation.netProfit.toString(),
                    },
                  );

                  console.log(
                    "[MEV PIPELINE TEST] " +
                      (simulation.profitable
                        ? "SIMULATION PROFITABLE"
                        : "SIMULATION NOT PROFITABLE"),
                  );
                } catch (error) {
                  console.error(
                    "[MEV PIPELINE TEST] " +
                      "Transaction processing error:",
                    error,
                  );
                }
              },

              onError:
                (error) => {
                  console.error(
                    "[MEV PIPELINE TEST] ERROR:",
                    error,
                  );
                },
            });

                // ==================================================
                // START TRANSACTION MONITOR FIRST
                // ==================================================
                //
                // TransactionMonitor processes the current block
                // during startup.
                //
                // Remember that block so BlockMonitor does not
                // process the same initial block a second time.
                // ==================================================

                devTransactionMonitorStartupBlock =
                  await provider.getBlockNumber();

                await devPipelineMonitor.start();

                // ==================================================
                // BLOCK MONITOR
                // ==================================================
                //
                // BlockMonitor owns the block subscription.
                // It forwards each detected block to
                // TransactionMonitor.processBlockNumber().
                //
                // The initial block may already have been processed
                // by TransactionMonitor.start(), so skip that exact
                // block when BlockMonitor reports it.
                // ==================================================

                devBlockMonitor =
                  new BlockMonitor({
                    onBlock:
                      async (block) => {
                        if (
                          !devPipelineMonitor?.isRunning()
                        ) {
                          return;
                        }

                        if (
                          devTransactionMonitorStartupBlock !==
                            null &&
                          block.number ===
                            devTransactionMonitorStartupBlock
                        ) {
                          console.log(
                            "[MEV PIPELINE TEST] " +
                              "Skipping duplicate initial block:",
                            block.number,
                          );

                          return;
                        }

                        // ==================================================
                        // MEV OPPORTUNITY FRESHNESS
                        // ==================================================
                        //
                        // An opportunity is valid only for the block in
                        // which its trigger transaction was observed.
                        //
                        // When a newer block arrives, mark the current
                        // opportunity stale before processing the new block.
                        //
                        // BlockMonitor owns the single blockchain block
                        // subscription. No additional subscription is added.
                        // ==================================================

                        mevOpportunityStore.markStale(
                          block.number,
                        );

                        // ==================================================
                        // PROCESS THE NEW BLOCK FIRST
                        // ==================================================
                        //
                        // The new block must be processed before attempting
                        // any diagnostic work on the previous opportunity.
                        //
                        // This allows a genuinely new monitored transaction
                        // to create a new FRESH opportunity first.
                        //
                        // If a new candidate is published, the store replaces
                        // the old STALE opportunity and no stale diagnostic
                        // should be run against the replaced snapshot.
                        // ==================================================

                        console.log(
                          "[MEV PIPELINE TEST] " +
                            "BLOCK -> TRANSACTION MONITOR:",
                          block.number,
                        );

                        await devPipelineMonitor.processBlockNumber(
                          block.number,
                        );

                        // ==================================================
                        // STALE OPPORTUNITY REVALIDATION
                        // ==================================================
                        //
                        // Only inspect the store AFTER the new block has been
                        // processed.
                        //
                        // If the new block produced a new candidate, the store
                        // now contains that new FRESH opportunity and the old
                        // stale candidate is no longer the latest snapshot.
                        //
                        // If no new candidate was published, the previous
                        // opportunity remains STALE and can be evaluated as a
                        // current-state diagnostic.
                        //
                        // IMPORTANT:
                        // - Do NOT replay the original trigger transaction.
                        // - Do NOT call BackrunSimulator.simulate().
                        // - Do NOT restore FRESH state.
                        // - Do NOT enable Paper Execution.
                        // ==================================================

                        const staleOpportunity =
                          mevOpportunityStore.getState();

                        if (
                          staleOpportunity &&
                          staleOpportunity.freshness ===
                            "STALE"
                        ) {
                          const revalidation =
                            await revalidateMevV2Candidate(
                              staleOpportunity.candidate,
                            );

                          console.log(
                            "[MEV PIPELINE TEST] " +
                              "STALE OPPORTUNITY REVALIDATION:",
                            {
                              triggerTransactionHash:
                                revalidation.triggerTransactionHash,

                              success:
                                revalidation.success,

                              originalExpectedAmountOut:
                                revalidation
                                  .originalExpectedAmountOut
                                  .toString(),

                              currentExpectedAmountOut:
                                revalidation
                                  .currentExpectedAmountOut
                                  .toString(),

                              changed:
                                revalidation.changed,

                              error:
                                revalidation.error,
                            },
                          );

                          if (revalidation.success) {
                            console.log(
                              "[MEV PIPELINE TEST] " +
                                "STALE OPPORTUNITY QUOTE " +
                                "REVALIDATION PASSED.",
                            );

                            // ==================================================
                            // STALE OPPORTUNITY CURRENT-STATE SIMULATION
                            // ==================================================
                            //
                            // Quote revalidation alone is not enough to make
                            // a stale opportunity executable.
                            //
                            // Evaluate the same candidate size against the
                            // CURRENT V2 pair state using the dedicated
                            // current-state simulator.
                            //
                            // The result is diagnostic only. The original
                            // trigger opportunity remains STALE.
                            // ==================================================

                            if (!devBackrunSimulator) {
                              console.error(
                                "[MEV PIPELINE TEST] " +
                                  "Backrun simulator is unavailable " +
                                  "for stale current-state simulation.",
                              );
                            } else {
                              const currentStateSimulation =
                                await devBackrunSimulator.simulateCurrentState(
                                  staleOpportunity.candidate,
                                );

                              console.log(
                                "[MEV PIPELINE TEST] " +
                                  "STALE OPPORTUNITY CURRENT-STATE " +
                                  "SIMULATION:",
                                {
                                  triggerTransactionHash:
                                    currentStateSimulation
                                      .triggerTransactionHash,

                                  success:
                                    currentStateSimulation.success,

                                  expectedProfit:
                                    currentStateSimulation
                                      .expectedProfit
                                      .toString(),

                                  gasCost:
                                    currentStateSimulation
                                      .gasCost
                                      .toString(),

                                  netProfit:
                                    currentStateSimulation
                                      .netProfit
                                      .toString(),

                                  profitable:
                                    currentStateSimulation.profitable,

                                  error:
                                    currentStateSimulation.error,
                                },
                              );

                              if (
                                currentStateSimulation.success &&
                                currentStateSimulation.profitable
                              ) {
                                console.log(
                                  "[MEV PIPELINE TEST] " +
                                    "CURRENT-STATE SIMULATION IS " +
                                    "PROFITABLE, BUT THE ORIGINAL " +
                                    "OPPORTUNITY REMAINS STALE.",
                                );
                              } else if (
                                currentStateSimulation.success
                              ) {
                                console.log(
                                  "[MEV PIPELINE TEST] " +
                                    "CURRENT-STATE SIMULATION IS " +
                                    "NOT PROFITABLE.",
                                );
                              } else {
                                console.error(
                                  "[MEV PIPELINE TEST] " +
                                    "STALE OPPORTUNITY CURRENT-STATE " +
                                    "SIMULATION FAILED:",
                                  currentStateSimulation.error,
                                );
                              }

                              const snapshotAfterCurrentStateSimulation =
                                mevOpportunityStore.getState();

                              if (
                                !snapshotAfterCurrentStateSimulation ||
                                snapshotAfterCurrentStateSimulation.freshness !==
                                  "STALE"
                              ) {
                                console.error(
                                  "[MEV PIPELINE TEST] " +
                                    "SAFETY CHECK FAILED: stale opportunity " +
                                    "must remain STALE after current-state " +
                                    "simulation.",
                                );
                              }
                            }
                          } else {
                            console.error(
                              "[MEV PIPELINE TEST] " +
                                "STALE OPPORTUNITY QUOTE " +
                                "REVALIDATION FAILED:",
                              revalidation.error,
                            );
                          }
                        }
                      },

                    onError:
                      (error) => {
                        console.error(
                          "[MEV PIPELINE TEST] " +
                            "BLOCK MONITOR ERROR:",
                          error,
                        );
                      },
                  });

                await devBlockMonitor.start();

                console.log(
                  "[MEV PIPELINE TEST] " +
                    "BlockMonitor -> TransactionMonitor " +
                    "integration started",
                );
        } catch (error) {
          console.error(
            "[MEV PIPELINE TEST] START FAILED:",
            error,
          );

          devBlockMonitor?.stop();
          devBlockMonitor =
            null;

          devPipelineMonitor?.stop();
          devPipelineMonitor =
            null;

          devBackrunSimulator =
            null;
        }
      };

  // ====================================================
  // STOP LIVE PIPELINE
  // ====================================================

    (window as any).stopMevPipelineTest =
          (): void => {
            if (
              !devBlockMonitor &&
              !devPipelineMonitor
            ) {
              console.log(
                "[MEV PIPELINE TEST] Not running",
              );

              return;
            }

            // BlockMonitor owns the block subscription,
            // so stop it first.
            devBlockMonitor?.stop();

            devBlockMonitor =
              null;

            // Then stop TransactionMonitor.
            devPipelineMonitor?.stop();

            devPipelineMonitor =
              null;

            devTransactionMonitorStartupBlock =
              null;

            devBackrunSimulator =
              null;

            console.log(
              "[MEV PIPELINE TEST] Stopped",
            );
          };

  // ====================================================
  // DETERMINISTIC END-TO-END TEST
  //
  // Tests:
  //
  // Transaction
  //   ↓
  // Detector
  //   ↓
  // V2 Calldata Decoder
  //   ↓
  // Candidate
  //   ↓
  // Live V2 Quote
  //   ↓
  // Current Pair State
  //   ↓
  // Trigger State Simulation
  //   ↓
  // Post-Trigger Pair State
  //   ↓
  // Backrun State Simulation
  //   ↓
  // BackrunSimulator
  //   ↓
  // Profit Calculator
  //
  // Also verifies that an unrecognized selector
  // is rejected before simulation.
  // ====================================================

  (window as any).testMevPipelineEndToEnd =
    async (): Promise<void> => {
      console.log(
        "[MEV PIPELINE E2E TEST] Starting",
      );

      try {
        const provider =
          await getProvider();

        const detector =
          new OpportunityDetector({
            watchedContracts: [
              V2_ROUTER_ADDRESS,
            ],
          });

        const simulator =
          new BackrunSimulator(
            provider,
            {
              minimumProfit: 0n,
              estimatedGasUnits: 300000n,
              profitToken:
                "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
              wrappedNativeToken:
                "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
            },
          );

        
        // ==================================================
        // Build VALID V2 calldata
        // ==================================================

        const amountIn =
          1000000n;

        const amountOutMin =
          1n;

        const recipient =
          "0x3333333333333333333333333333333333333333";

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
                SEPOLIA_USDC,
                SEPOLIA_WETH,
              ],
              recipient,
              deadline,
            ],
          );

        const validCalldata =
          V2_SWAP_EXACT_TOKENS_FOR_TOKENS_SELECTOR +
          encodedParameters.slice(2);

        const recognizedTransaction:
          MonitoredTransaction = {
          hash:
            "0x" +
            "11".repeat(32),

          blockNumber:
            await provider.getBlockNumber(),

          from:
            "0x1111111111111111111111111111111111111111",

          to:
            V2_ROUTER_ADDRESS,

          value:
            0n,

          gasLimit:
            300000n,

          gasPrice:
            1000000000n,

          nonce:
            1,

          data:
            validCalldata,
        };

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Testing recognized V2 transaction...",
        );

        const candidate =
          detector.detect(
            recognizedTransaction,
          );

        if (!candidate) {
          throw new Error(
            "Recognized V2 transaction was not detected.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Candidate detected:",
          candidate,
        );

        // ==================================================
        // Verify decoded candidate
        // ==================================================

        if (
          candidate.tokenIn?.toLowerCase() !==
          SEPOLIA_USDC.toLowerCase()
        ) {
          throw new Error(
            "Candidate tokenIn does not match Sepolia USDC.",
          );
        }

        if (
          candidate.tokenOut?.toLowerCase() !==
          SEPOLIA_WETH.toLowerCase()
        ) {
          throw new Error(
            "Candidate tokenOut does not match Sepolia WETH.",
          );
        }

        if (
          candidate.amountIn !==
          amountIn
        ) {
          throw new Error(
            "Candidate amountIn does not match test amount.",
          );
        }

        if (
          candidate.amountOutMin !==
          amountOutMin
        ) {
          throw new Error(
            "Candidate amountOutMin does not match test amountOutMin.",
          );
        }

        if (
          !candidate.path ||
          candidate.path.length !== 2 ||
          candidate.path[0].toLowerCase() !==
            SEPOLIA_USDC.toLowerCase() ||
          candidate.path[1].toLowerCase() !==
            SEPOLIA_WETH.toLowerCase()
        ) {
          throw new Error(
            "Candidate V2 path does not match expected USDC -> WETH path.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "V2 calldata decoding PASSED.",
        );

        // ==================================================
        // Live V2 quote
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Requesting real Sepolia V2 quote...",
        );

        const quote =
          await quoteMevV2Candidate(
            candidate,
          );

        if (!quote.success) {
          throw new Error(
            quote.error ??
              "V2 quote failed.",
          );
        }

        if (
          quote.expectedAmountOut <=
          0n
        ) {
          throw new Error(
            "V2 quote returned zero output.",
          );
        }

        candidate.expectedAmountOut =
          quote.expectedAmountOut;

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Expected Amount Out:",
          candidate.expectedAmountOut.toString(),
        );

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Candidate quote integration PASSED.",
        );

        // ==================================================
        // Current pair state
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Reading current V2 pair state...",
        );

        const pairState =
          await getV2PairState(
            provider,
            candidate.tokenIn!,
            candidate.tokenOut!,
          );

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "CURRENT PAIR STATE:",
          {
            pairAddress:
              pairState.pairAddress,

            token0:
              pairState.token0,

            token1:
              pairState.token1,

            reserve0:
              pairState.reserve0.toString(),

            reserve1:
              pairState.reserve1.toString(),
          },
        );

        if (
          pairState.reserve0 <= 0n ||
          pairState.reserve1 <= 0n
        ) {
          throw new Error(
            "Current pair reserves are invalid.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Current pair state PASSED.",
        );

        // ==================================================
        // Trigger state simulation
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Simulating trigger swap...",
        );

        const triggerSimulation =
          simulateV2Swap(
            pairState,
            candidate.tokenIn!,
            candidate.tokenOut!,
            candidate.amountIn!,
          );

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "TRIGGER STATE TRANSITION:",
          {
            tokenIn:
              triggerSimulation.tokenIn,

            tokenOut:
              triggerSimulation.tokenOut,

            amountIn:
              triggerSimulation.amountIn.toString(),

            amountOut:
              triggerSimulation.amountOut.toString(),

            newReserve0:
              triggerSimulation.newReserve0.toString(),

            newReserve1:
              triggerSimulation.newReserve1.toString(),
          },
        );

        if (
          triggerSimulation.amountOut !==
          candidate.expectedAmountOut
        ) {
          throw new Error(
            "Trigger simulation does not match live V2 quote.",
          );
        }

        if (
          candidate.amountOutMin !==
          undefined &&
          triggerSimulation.amountOut <
            candidate.amountOutMin
        ) {
          throw new Error(
            "Trigger simulation output is below candidate amountOutMin.",
          );
        }

        if (
          !candidate.path ||
          candidate.path.length < 2 ||
          candidate.path[0].toLowerCase() !==
            candidate.tokenIn!.toLowerCase() ||
          candidate.path[
            candidate.path.length - 1
          ].toLowerCase() !==
            candidate.tokenOut!.toLowerCase()
        ) {
          throw new Error(
            "Trigger simulation candidate path is invalid.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Trigger state simulation PASSED.",
        );

        // ==================================================
        // Construct post-trigger pair state
        // ==================================================

        const postTriggerPairState = {
          ...pairState,

          reserve0:
            triggerSimulation.newReserve0,

          reserve1:
            triggerSimulation.newReserve1,
        };

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "POST-TRIGGER PAIR STATE:",
          {
            reserve0:
              postTriggerPairState.reserve0.toString(),

            reserve1:
              postTriggerPairState.reserve1.toString(),
          },
        );

        // ==================================================
        // Backrun state simulation
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Simulating backrun against post-trigger state...",
        );

        const backrunStateSimulation =
          simulateV2Swap(
            postTriggerPairState,
            candidate.tokenOut!,
            candidate.tokenIn!,
            triggerSimulation.amountOut,
          );

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "BACKRUN STATE TRANSITION:",
          {
            tokenIn:
              backrunStateSimulation.tokenIn,

            tokenOut:
              backrunStateSimulation.tokenOut,

            amountIn:
              backrunStateSimulation.amountIn.toString(),

            amountOut:
              backrunStateSimulation.amountOut.toString(),

            newReserve0:
              backrunStateSimulation.newReserve0.toString(),

            newReserve1:
              backrunStateSimulation.newReserve1.toString(),
          },
        );

        if (
          backrunStateSimulation.amountOut <=
          0n
        ) {
          throw new Error(
            "Backrun state simulation returned zero.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Backrun state simulation PASSED.",
        );

        // ==================================================
        // Full BackrunSimulator
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Running BackrunSimulator...",
        );

        const simulation:
          BackrunSimulationResult =
          await simulator.simulate(
            candidate,
          );

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "SIMULATION RESULT:",
          {
            success:
              simulation.success,

            expectedProfit:
              simulation.expectedProfit.toString(),

            gasCost:
              simulation.gasCost.toString(),

            netProfit:
              simulation.netProfit.toString(),

            profitable:
              simulation.profitable,

            error:
              simulation.error,
          },
        );

        if (
          !simulation.success
        ) {
          throw new Error(
            simulation.error ??
              "Backrun simulation failed.",
          );
        }

        if (
          simulation.triggerTransactionHash !==
          recognizedTransaction.hash
        ) {
          throw new Error(
            "Simulation trigger hash does not match candidate.",
          );
        }

        if (simulation.backrunDex !== "V2") {
            throw new Error(
              "BackrunSimulator backrunDex must be V2.",
            );
          }

          if (
            simulation.backrunTokenIn?.toLowerCase() !==
            candidate.tokenOut?.toLowerCase()
          ) {
            throw new Error(
              "BackrunSimulator backrunTokenIn does not match trigger tokenOut.",
            );
          }

          if (
            simulation.backrunTokenOut?.toLowerCase() !==
            candidate.tokenIn?.toLowerCase()
          ) {
            throw new Error(
              "BackrunSimulator backrunTokenOut does not match trigger tokenIn.",
            );
          }

          if (
            simulation.backrunAmountIn !==
            triggerSimulation.amountOut
          ) {
            throw new Error(
              "BackrunSimulator backrunAmountIn does not match trigger amountOut.",
            );
          }

          if (
            simulation.backrunExpectedAmountOut !==
            backrunStateSimulation.amountOut
          ) {
            throw new Error(
              "BackrunSimulator backrunExpectedAmountOut does not match backrun simulation.",
            );
          }

          console.log(
            "[MEV PIPELINE E2E TEST] " +
              "Backrun execution data verification PASSED.",
          );

        const expectedGrossProfit =
            backrunStateSimulation.amountOut -
            candidate.amountIn!;

          if (
            simulation.expectedProfit !==
            expectedGrossProfit
          ) {
            throw new Error(
              "BackrunSimulator gross profit does not match post-trigger state simulation.",
            );
          }

          /*
          * Verify that BackrunSimulator used a real,
          * positive gas cost without comparing against
          * a second live gas estimate.
          *
          * A second provider fee read can naturally
          * return a different value on Sepolia.
          */
          if (
            simulation.gasCost <= 0n
          ) {
            throw new Error(
              "BackrunSimulator gas cost must be greater than zero.",
            );
          }

          const expectedNetProfit =
            expectedGrossProfit -
            simulation.gasCost;

          if (
            simulation.netProfit !==
            expectedNetProfit
          ) {
            throw new Error(
              "BackrunSimulator net profit does not match gross profit minus gas cost.",
            );
          }

          const expectedProfitable =
            expectedNetProfit > 0n;

          if (
            simulation.profitable !==
            expectedProfitable
          ) {
            throw new Error(
              "BackrunSimulator profitable flag is incorrect.",
            );
          }

          console.log(
              "[MEV PIPELINE E2E TEST] " +
                "Gross profit:",
              expectedGrossProfit.toString(),
            );

            console.log(
              "[MEV PIPELINE E2E TEST] " +
                "Gas cost:",
              simulation.gasCost.toString(),
            );

            console.log(
              "[MEV PIPELINE E2E TEST] " +
                "Expected net profit:",
              expectedNetProfit.toString(),
            );

          console.log(
            "[MEV PIPELINE E2E TEST] " +
              "Gross profit:",
            expectedGrossProfit.toString(),
          );
          
          console.log(
            "[MEV PIPELINE E2E TEST] " +
              "Expected net profit:",
            expectedNetProfit.toString(),
          );

          console.log(
            "[MEV PIPELINE E2E TEST] " +
              "Profit calculation verification PASSED.",
          );

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "BackrunSimulator integration PASSED.",
        );

        // ==================================================
        // Paper Execution
        // ==================================================
        //
        // The real Sepolia simulation above is allowed to be
        // negative because profitability depends on current
        // market conditions.
        //
        // Therefore Paper Execution is tested with a deterministic
        // profitable simulation while the real simulation is also
        // explicitly tested for rejection below.
        //
        // No wallet is connected, no signature is requested, and
        // no blockchain transaction is submitted.
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Testing Paper Execution...",
        );

        const paperExecutionService =
          new PaperExecutionService();

        const profitablePaperSimulation:
          BackrunSimulationResult = {
          ...simulation,

          success: true,
          expectedProfit: 100000n,
          gasCost: 20000n,
          netProfit: 80000n,
          profitable: true,
        };


        // ==================================================
        // MEV OPPORTUNITY STORE
        // ==================================================
        //
        // Verify that a successful deterministic simulation
        // can be published to the shared MEV Opportunity Store.
        //
        // This is an in-memory UI state update only.
        //
        // No wallet signature.
        // No blockchain transaction.
        // No state-changing contract call.
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Testing MEV Opportunity Store...",
        );

        mevOpportunityStore.setOpportunity(
          candidate,
          profitablePaperSimulation,
        );

        const storedMevOpportunity =
          mevOpportunityStore.getState();

        if (!storedMevOpportunity) {
          throw new Error(
            "MEV Opportunity Store did not return stored opportunity.",
          );
        }

        if (
          storedMevOpportunity.candidate
            .triggerTransactionHash !==
          candidate.triggerTransactionHash
        ) {
          throw new Error(
            "MEV Opportunity Store trigger hash mismatch.",
          );
        }

        if (
          storedMevOpportunity.simulation
            .success !== true
        ) {
          throw new Error(
            "MEV Opportunity Store stored unsuccessful simulation.",
          );
        }

        if (
          storedMevOpportunity.simulation
            .expectedProfit !==
          profitablePaperSimulation.expectedProfit
        ) {
          throw new Error(
            "MEV Opportunity Store expected profit mismatch.",
          );
        }

        if (
          storedMevOpportunity.simulation
            .gasCost !==
          profitablePaperSimulation.gasCost
        ) {
          throw new Error(
            "MEV Opportunity Store gas cost mismatch.",
          );
        }

        if (
          storedMevOpportunity.simulation
            .netProfit !==
          profitablePaperSimulation.netProfit
        ) {
          throw new Error(
            "MEV Opportunity Store net profit mismatch.",
          );
        }

        if (
          storedMevOpportunity.simulation
            .profitable !== true
        ) {
          throw new Error(
            "MEV Opportunity Store profitable flag mismatch.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "MEV Opportunity Store verification PASSED.",
        );

        // ==================================================
        // MEV OPPORTUNITY FRESHNESS
        // ==================================================
        //
        // Verify that the stored opportunity starts FRESH and
        // becomes STALE when a newer block is observed.
        //
        // This is an in-memory lifecycle test only.
        // ==================================================

        if (
          storedMevOpportunity.freshness !==
          "FRESH"
        ) {
          throw new Error(
            "MEV Opportunity Store did not mark a new opportunity FRESH.",
          );
        }

        mevOpportunityStore.markStale(
          candidate.blockNumber + 1,
        );

        const staleMevOpportunity =
          mevOpportunityStore.getState();

        if (!staleMevOpportunity) {
          throw new Error(
            "MEV Opportunity Store lost the opportunity while marking it stale.",
          );
        }

        if (
          staleMevOpportunity.freshness !==
          "STALE"
        ) {
          throw new Error(
            "MEV Opportunity Store did not mark the opportunity STALE after a newer block.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "MEV Opportunity freshness lifecycle PASSED.",
        );

        // Mark the same candidate STALE again so the following
        // Stage 2.3/2.4 tests operate on the required stale
        // opportunity state.
        mevOpportunityStore.markStale(
          candidate.blockNumber + 1,
        );

        const staleOpportunityBeforeRevalidation =
          mevOpportunityStore.getState();

        if (
          !staleOpportunityBeforeRevalidation ||
          staleOpportunityBeforeRevalidation.freshness !==
            "STALE"
        ) {
          throw new Error(
            "Stage 2.3 E2E failed: opportunity must be STALE before quote revalidation.",
          );
        }

        // ==================================================
        // STAGE 2.3 / 2.4 — STALE OPPORTUNITY REVALIDATION E2E
        // ==================================================
        //
        // Verify that a stale V2 MEV opportunity can be
        // revalidated against the current V2 router quote
        // and evaluated against current V2 pair state.
        //
        // IMPORTANT:
        // - The original trigger is NOT replayed.
        // - BackrunSimulator is NOT called again.
        // - Opportunity freshness is NOT restored.
        // - Paper Execution remains blocked while stale.
        // ==================================================

        const staleRevalidation =
          await revalidateMevV2Candidate(
            candidate,
          );

        if (!staleRevalidation.success) {
          throw new Error(
            "Stage 2.3 E2E failed: stale V2 quote revalidation failed: " +
              staleRevalidation.error,
          );
        }

        if (
          staleRevalidation.triggerTransactionHash.toLowerCase() !==
          candidate.triggerTransactionHash.toLowerCase()
        ) {
          throw new Error(
            "Stage 2.3 E2E failed: revalidation trigger transaction hash mismatch.",
          );
        }

        if (
          staleRevalidation.originalExpectedAmountOut !==
          candidate.expectedAmountOut
        ) {
          throw new Error(
            "Stage 2.3 E2E failed: original expectedAmountOut mismatch.",
          );
        }

        if (
          staleRevalidation.currentExpectedAmountOut <=
          0n
        ) {
          throw new Error(
            "Stage 2.3 E2E failed: current V2 quote must be greater than zero.",
          );
        }

        const staleSnapshotAfterRevalidation =
          mevOpportunityStore.getState();

        if (!staleSnapshotAfterRevalidation) {
          throw new Error(
            "Stage 2.3 E2E failed: opportunity snapshot missing after revalidation.",
          );
        }

        if (
          staleSnapshotAfterRevalidation.freshness !==
          "STALE"
        ) {
          throw new Error(
            "Stage 2.3 E2E failed: quote revalidation must not restore FRESH state.",
          );
        }

        console.log(
          "[MEV PIPELINE TEST] " +
            "STALE OPPORTUNITY REVALIDATION E2E PASSED.",
        );

        console.log(
          "[MEV PIPELINE TEST] " +
            "Original expectedAmountOut:",
          staleRevalidation
            .originalExpectedAmountOut
            .toString(),
        );

        console.log(
          "[MEV PIPELINE TEST] " +
            "Current expectedAmountOut:",
          staleRevalidation
            .currentExpectedAmountOut
            .toString(),
        );

        console.log(
          "[MEV PIPELINE TEST] " +
            "Quote changed:",
          staleRevalidation.changed,
        );

        console.log(
          "[MEV PIPELINE TEST] " +
            "Opportunity freshness after revalidation:",
          staleSnapshotAfterRevalidation.freshness,
        );

        // ==================================================
        // STAGE 2.4 — CURRENT-STATE SIMULATION E2E
        // ==================================================
        //
        // Verify that the new current-state simulator can
        // evaluate the stale candidate without replaying
        // the original trigger transaction.
        //
        // IMPORTANT:
        // - The original trigger hash is preserved.
        // - The original trigger block is preserved.
        // - The opportunity remains STALE.
        // - No wallet/signature/transaction is used.
        // ==================================================

        console.log(
          "[MEV PIPELINE TEST] " +
            "Testing stale opportunity current-state simulation...",
        );

        const currentStateSimulation =
          await simulator.simulateCurrentState(
            candidate,
          );

        console.log(
          "[MEV PIPELINE TEST] " +
            "CURRENT-STATE SIMULATION RESULT:",
          {
            triggerTransactionHash:
              currentStateSimulation
                .triggerTransactionHash,

            success:
              currentStateSimulation.success,

            expectedProfit:
              currentStateSimulation
                .expectedProfit
                .toString(),

            gasCost:
              currentStateSimulation
                .gasCost
                .toString(),

            netProfit:
              currentStateSimulation
                .netProfit
                .toString(),

            profitable:
              currentStateSimulation.profitable,

            error:
              currentStateSimulation.error,
          },
        );

        if (!currentStateSimulation.success) {
          throw new Error(
            "Stage 2.4 E2E failed: current-state simulation failed: " +
              currentStateSimulation.error,
          );
        }

        if (
          currentStateSimulation.triggerTransactionHash.toLowerCase() !==
          candidate.triggerTransactionHash.toLowerCase()
        ) {
          throw new Error(
            "Stage 2.4 E2E failed: current-state simulation trigger hash mismatch.",
          );
        }

        if (
          currentStateSimulation.gasCost <=
          0n
        ) {
          throw new Error(
            "Stage 2.4 E2E failed: current-state simulation gas cost must be greater than zero.",
          );
        }

        const snapshotAfterCurrentStateSimulation =
          mevOpportunityStore.getState();

        if (!snapshotAfterCurrentStateSimulation) {
          throw new Error(
            "Stage 2.4 E2E failed: opportunity snapshot missing after current-state simulation.",
          );
        }

        if (
          snapshotAfterCurrentStateSimulation.freshness !==
          "STALE"
        ) {
          throw new Error(
            "Stage 2.4 E2E failed: current-state simulation must not restore FRESH state.",
          );
        }

        console.log(
          "[MEV PIPELINE TEST] " +
            "STALE OPPORTUNITY CURRENT-STATE " +
            "SIMULATION E2E PASSED.",
        );

        // ==================================================
        // STAGE 2.6 — NEW OPPORTUNITY REPLACEMENT E2E
        // ==================================================
        //
        // Verify that a genuinely new candidate replaces the
        // previous STALE opportunity and becomes FRESH.
        //
        // IMPORTANT:
        // - The replacement candidate uses a different trigger hash.
        // - The replacement candidate uses a newer block number.
        // - The old STALE snapshot must no longer be the latest snapshot.
        // - Publishing a new candidate creates a new FRESH snapshot.
        // - This is an in-memory lifecycle test only.
        // ==================================================

        console.log(
          "[MEV PIPELINE TEST] " +
            "Testing new opportunity replacement...",
        );

        const replacementCandidate: BackrunCandidate = {
          ...candidate,
          triggerTransactionHash:
            "0x" +
            "33".repeat(32),
          blockNumber:
            candidate.blockNumber + 1,
          detectedAt:
            Date.now(),
        };

        const replacementSimulation:
          BackrunSimulationResult = {
          ...profitablePaperSimulation,
          triggerTransactionHash:
            replacementCandidate.triggerTransactionHash,
        };

        mevOpportunityStore.setOpportunity(
          replacementCandidate,
          replacementSimulation,
        );

        const replacementSnapshot =
          mevOpportunityStore.getState();

        if (!replacementSnapshot) {
          throw new Error(
            "Stage 2.6 E2E failed: replacement opportunity was not stored.",
          );
        }

        if (
          replacementSnapshot.freshness !==
          "FRESH"
        ) {
          throw new Error(
            "Stage 2.6 E2E failed: replacement opportunity was not marked FRESH.",
          );
        }

        if (
          replacementSnapshot.candidate
            .triggerTransactionHash.toLowerCase() !==
          replacementCandidate.triggerTransactionHash.toLowerCase()
        ) {
          throw new Error(
            "Stage 2.6 E2E failed: replacement trigger hash mismatch.",
          );
        }

        if (
          replacementSnapshot.candidate.blockNumber !==
          replacementCandidate.blockNumber
        ) {
          throw new Error(
            "Stage 2.6 E2E failed: replacement block number mismatch.",
          );
        }

        if (
          replacementSnapshot.candidate
            .triggerTransactionHash.toLowerCase() ===
          candidate.triggerTransactionHash.toLowerCase()
        ) {
          throw new Error(
            "Stage 2.6 E2E failed: old trigger transaction was not replaced.",
          );
        }

        console.log(
          "[MEV PIPELINE TEST] " +
            "NEW OPPORTUNITY REPLACEMENT E2E PASSED.",
        );

        // Restore the original candidate as a newly published
        // FRESH opportunity so the existing Paper Execution
        // checks below continue to test their original candidate.
        mevOpportunityStore.setOpportunity(
          candidate,
          profitablePaperSimulation,
        );

        const restoredFreshSnapshot =
          mevOpportunityStore.getState();

        if (
          !restoredFreshSnapshot ||
          restoredFreshSnapshot.freshness !==
            "FRESH"
        ) {
          throw new Error(
            "Stage 2.6 E2E failed: original candidate could not be republished as FRESH for subsequent tests.",
          );
        }

        const paperExecutionResult =
          paperExecutionService.createPlan(
            candidate,
            profitablePaperSimulation,
          );

        if (
          !paperExecutionResult.success
        ) {
          throw new Error(
            paperExecutionResult.error ??
              "Paper execution plan creation failed.",
          );
        }

        const paperPlan =
          paperExecutionResult.plan;

        if (!paperPlan) {
          throw new Error(
            "Paper execution plan was not created.",
          );
        }

        if (
          paperPlan.paperOnly !== true
        ) {
          throw new Error(
            "Paper execution plan is not marked paperOnly.",
          );
        }

        if (
          paperPlan.triggerTransactionHash !==
          candidate.triggerTransactionHash
        ) {
          throw new Error(
            "Paper execution trigger hash mismatch.",
          );
        }

        if (
          paperPlan.blockNumber !==
          candidate.blockNumber
        ) {
          throw new Error(
            "Paper execution block number mismatch.",
          );
        }

        if (
          paperPlan.amountIn !==
          candidate.amountIn
        ) {
          throw new Error(
            "Paper execution amountIn mismatch.",
          );
        }

        if (
          paperPlan.expectedAmountOut !==
          candidate.expectedAmountOut
        ) {
          throw new Error(
            "Paper execution expectedAmountOut mismatch.",
          );
        }

        if (paperPlan.backrunDex !== "V2") {
            throw new Error(
              "Paper execution backrunDex mismatch.",
            );
          }

          if (
            paperPlan.backrunTokenIn.toLowerCase() !==
            candidate.tokenOut!.toLowerCase()
          ) {
            throw new Error(
              "Paper execution backrunTokenIn mismatch.",
            );
          }

          if (
            paperPlan.backrunTokenOut.toLowerCase() !==
            candidate.tokenIn!.toLowerCase()
          ) {
            throw new Error(
              "Paper execution backrunTokenOut mismatch.",
            );
          }

          if (
            paperPlan.backrunAmountIn !==
            triggerSimulation.amountOut
          ) {
            throw new Error(
              "Paper execution backrunAmountIn mismatch.",
            );
          }

          if (
            paperPlan.backrunExpectedAmountOut !==
            backrunStateSimulation.amountOut
          ) {
            throw new Error(
              "Paper execution backrunExpectedAmountOut mismatch.",
            );
          }

          console.log(
            "[MEV PIPELINE E2E TEST] " +
              "Paper Execution backrun data verification PASSED.",
          );

        if (
          paperPlan.expectedProfit !==
          profitablePaperSimulation.expectedProfit
        ) {
          throw new Error(
            "Paper execution expectedProfit mismatch.",
          );
        }

        if (
          paperPlan.gasCost !==
          profitablePaperSimulation.gasCost
        ) {
          throw new Error(
            "Paper execution gasCost mismatch.",
          );
        }

        if (
          paperPlan.netProfit !==
          profitablePaperSimulation.netProfit
        ) {
          throw new Error(
            "Paper execution netProfit mismatch.",
          );
        }

        if (
          paperPlan.netProfit <= 0n
        ) {
          throw new Error(
            "Paper execution net profit is not positive.",
          );
        }

        if (
          paperPlan.profitable !== true
        ) {
          throw new Error(
            "Paper execution profitable flag is incorrect.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Paper Execution ACCEPTED profitable simulation:",
          paperPlan,
        );

                // ==================================================
        // STAGE 2.10 — PAPER EXECUTION SAFETY LIFECYCLE E2E
        // ==================================================
        //
        // Verify that a successfully recorded Paper Execution
        // becomes non-executable when its opportunity becomes
        // STALE.
        //
        // Lifecycle:
        //
        // FRESH opportunity
        //      ↓
        // PAPER_ACCEPTED
        //      ↓
        // PAPER_RECORDED
        //      ↓
        // newer block
        //      ↓
        // STALE
        //      ↓
        // same trigger rejected
        //
        // The rejected stale execution must not change
        // Paper Execution history.
        //
        // This remains strictly paper-only:
        // - no wallet
        // - no signature
        // - no blockchain transaction
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Testing Stage 2.10 Paper Execution safety lifecycle...",
        );

        // The service returns the accepted plan while the
        // store records the plan as PAPER_RECORDED.
        if (
          paperPlan.state !==
          "PAPER_ACCEPTED"
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: Paper Execution service did not return PAPER_ACCEPTED state.",
          );
        }

        const recordedExecutionsAfterFirstPaperExecution =
          paperExecutionService.getAll();

        if (
          recordedExecutionsAfterFirstPaperExecution.length !==
          1
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: first Paper Execution was not recorded exactly once.",
          );
        }

        if (
          recordedExecutionsAfterFirstPaperExecution[0].state !==
          "PAPER_RECORDED"
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: stored Paper Execution is not PAPER_RECORDED.",
          );
        }

        if (
          recordedExecutionsAfterFirstPaperExecution[0]
            .triggerTransactionHash.toLowerCase() !==
          candidate.triggerTransactionHash.toLowerCase()
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: recorded Paper Execution trigger hash mismatch.",
          );
        }

              // ==================================================
              // STAGE 2.20 — STORE -> HISTORY BACKRUN DATA E2E
              // ==================================================
              //
              // Verify that the Paper Execution Store preserves
              // the complete backrun execution data produced by
              // the PaperExecutionService.
              //
              // PaperExecutionHistory reads these same stored plans,
              // so this verifies the data path:
              //
              // BackrunSimulator
              //      ↓
              // PaperExecutionPlan
              //      ↓
              // PaperExecutionService
              //      ↓
              // PaperExecutionStore
              //      ↓
              // PaperExecutionHistory
              //
              // This remains strictly paper-only.
              // ==================================================

              const recordedPaperExecution =
                recordedExecutionsAfterFirstPaperExecution[0];

              if (
                recordedPaperExecution.backrunDex !==
                profitablePaperSimulation.backrunDex
              ) {
                throw new Error(
                  "Stage 2.20 E2E failed: recorded backrunDex does not match Paper Execution plan.",
                );
              }

              if (
                recordedPaperExecution.backrunTokenIn.toLowerCase() !==
                profitablePaperSimulation.backrunTokenIn!.toLowerCase()
              ) {
                throw new Error(
                  "Stage 2.20 E2E failed: recorded backrunTokenIn does not match Paper Execution plan.",
                );
              }

              if (
                recordedPaperExecution.backrunTokenOut.toLowerCase() !==
                profitablePaperSimulation.backrunTokenOut!.toLowerCase()
              ) {
                throw new Error(
                  "Stage 2.20 E2E failed: recorded backrunTokenOut does not match Paper Execution plan.",
                );
              }

              if (
                recordedPaperExecution.backrunAmountIn !==
                profitablePaperSimulation.backrunAmountIn
              ) {
                throw new Error(
                  "Stage 2.20 E2E failed: recorded backrunAmountIn does not match Paper Execution plan.",
                );
              }

              if (
                recordedPaperExecution.backrunExpectedAmountOut !==
                profitablePaperSimulation.backrunExpectedAmountOut
              ) {
                throw new Error(
                  "Stage 2.20 E2E failed: recorded backrunExpectedAmountOut does not match Paper Execution plan.",
                );
              }

              if (
                recordedPaperExecution.state !==
                "PAPER_RECORDED"
              ) {
                throw new Error(
                  "Stage 2.20 E2E failed: recorded Paper Execution state must remain PAPER_RECORDED.",
                );
              }

              console.log(
                "[MEV PIPELINE E2E TEST] " +
                  "Stage 2.20 Store -> History backrun data verification PASSED.",
              );

        const countBeforeStaleExecution =
          paperExecutionService.getCount();

        // Simulate arrival of a newer block.
        mevOpportunityStore.markStale(
          candidate.blockNumber + 1,
        );

        const staleSnapshotBeforeExecution =
          mevOpportunityStore.getState();

        if (
          !staleSnapshotBeforeExecution ||
          staleSnapshotBeforeExecution.freshness !==
            "STALE"
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: opportunity did not become STALE after a newer block.",
          );
        }

        if (
          staleSnapshotBeforeExecution.candidate
            .triggerTransactionHash.toLowerCase() !==
          candidate.triggerTransactionHash.toLowerCase()
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: stale opportunity trigger hash changed unexpectedly.",
          );
        }

        // Attempt to execute the SAME trigger again.
        const stalePaperExecution =
          paperExecutionService.createPlan(
            candidate,
            profitablePaperSimulation,
          );

        if (
          stalePaperExecution.success
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: stale opportunity was incorrectly accepted for Paper Execution.",
          );
        }

        if (
          stalePaperExecution.error !==
          "Paper execution rejected: opportunity is stale."
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: stale Paper Execution rejection message is incorrect.",
          );
        }

        if (
          paperExecutionService.getCount() !==
          countBeforeStaleExecution
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: rejected stale execution changed Paper Execution history.",
          );
        }

        const staleSnapshotAfterExecutionAttempt =
          mevOpportunityStore.getState();

        if (
          !staleSnapshotAfterExecutionAttempt ||
          staleSnapshotAfterExecutionAttempt.freshness !==
            "STALE"
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: stale opportunity changed state after rejected Paper Execution.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Stage 2.10 correctly rejected Paper Execution " +
            "for STALE opportunity:",
          stalePaperExecution.error,
        );

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Stage 2.10 Paper Execution safety lifecycle PASSED.",
        );

        // Restore the original candidate as a newly published
        // FRESH opportunity so the remaining Stage 2.9/2.8
        // negative-profit and replacement-trigger tests continue
        // from a valid opportunity state.
        mevOpportunityStore.setOpportunity(
          candidate,
          profitablePaperSimulation,
        );

        const freshSnapshotAfterStaleLifecycle =
          mevOpportunityStore.getState();

        if (
          !freshSnapshotAfterStaleLifecycle ||
          freshSnapshotAfterStaleLifecycle.freshness !==
            "FRESH"
        ) {
          throw new Error(
            "Stage 2.10 E2E failed: opportunity could not be republished as FRESH after stale lifecycle test.",
          );
        }

        // ==================================================
        // STAGE 2.9 — PAPER EXECUTION STATE VALIDATION
        // ==================================================
        //
        // The PaperExecutionStore must accept only plans that
        // have been explicitly accepted by PaperExecutionService.
        // A SIMULATED plan must never be recorded directly.
        // ==================================================

        const countBeforeInvalidState =
          paperExecutionService.getCount();

        const simulatedStatePlan = {
          ...paperPlan,
          paperExecutionId:
            `PAPER-INVALID-STATE-${Date.now()}`,
          state: "SIMULATED" as const,
        };

        let invalidStateRejected = false;

        try {
          paperExecutionStore.add(
            simulatedStatePlan,
          );
        } catch (error) {
          invalidStateRejected = true;

          if (
            !error ||
            !(error instanceof Error) ||
            error.message !==
              "Paper execution store accepts only PAPER_ACCEPTED plans."
          ) {
            throw new Error(
              "Stage 2.9 E2E failed: invalid state rejection message is incorrect.",
            );
          }

          console.log(
            "[MEV PIPELINE E2E TEST] " +
              "Stage 2.9 correctly rejected SIMULATED paper plan:",
            error.message,
          );
        }

        if (!invalidStateRejected) {
          throw new Error(
            "Stage 2.9 E2E failed: SIMULATED paper plan was incorrectly stored.",
          );
        }

        if (
          paperExecutionService.getCount() !==
          countBeforeInvalidState
        ) {
          throw new Error(
            "Stage 2.9 E2E failed: rejected invalid-state plan changed paper execution history.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Stage 2.9 paper execution state validation PASSED.",
        );

        // --------------------------------------------------
        // Negative-profit rejection
        // --------------------------------------------------
        //
        // Use a deterministic unprofitable simulation so this
        // safety test does not depend on the current Sepolia
        // market state of the real simulation above.
        //
        // Paper Execution must reject any simulation whose
        // NET profit is not strictly positive.
        // --------------------------------------------------

        const unprofitablePaperSimulation:
          BackrunSimulationResult = {
          ...profitablePaperSimulation,
          success: true,
          expectedProfit: 10000n,
          gasCost: 10000n,
          netProfit: 0n,
          profitable: false,
        };

        const rejectedPaperExecution =
          paperExecutionService.createPlan(
            candidate,
            unprofitablePaperSimulation,
          );

        if (
          rejectedPaperExecution.success
        ) {
          throw new Error(
            "Paper execution incorrectly accepted a non-positive NET-profit simulation.",
          );
        }

        if (
          rejectedPaperExecution.error !==
          "Paper execution rejected: simulated net profit is not positive."
        ) {
          throw new Error(
            "Paper execution negative-profit rejection message is incorrect.",
          );
        }

        // --------------------------------------------------
        // Duplicate paper execution rejection
        // --------------------------------------------------

        const duplicatePaperExecution =
          paperExecutionService.createPlan(
            candidate,
            profitablePaperSimulation,
          );

        if (
          duplicatePaperExecution.success
        ) {
          throw new Error(
            "Paper execution incorrectly accepted duplicate trigger transaction.",
          );
        }

        if (
          duplicatePaperExecution.error !==
          "Paper execution already recorded for this trigger transaction."
        ) {
          throw new Error(
            "Paper execution duplicate rejection message is incorrect.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Paper Execution correctly rejected duplicate trigger:",
          duplicatePaperExecution.error,
        );

        // --------------------------------------------------
        // New trigger acceptance
        // --------------------------------------------------
        //
        // A paper execution recorded for one trigger transaction
        // must not block a genuinely new opportunity.
        //
        // Publish a deterministic replacement opportunity with a
        // different trigger transaction hash and newer block.
        // The new opportunity must be FRESH before Paper Execution
        // can accept it.
        // --------------------------------------------------


        mevOpportunityStore.setOpportunity(
          replacementCandidate,
          replacementSimulation,
        );

        const replacementOpportunity =
          mevOpportunityStore.getState();

        if (!replacementOpportunity) {
          throw new Error(
            "Stage 2.8 E2E failed: replacement opportunity was not published.",
          );
        }

        if (
          replacementOpportunity.freshness !==
          "FRESH"
        ) {
          throw new Error(
            "Stage 2.8 E2E failed: replacement opportunity must be FRESH.",
          );
        }

        if (
          replacementOpportunity.candidate.triggerTransactionHash ===
          candidate.triggerTransactionHash
        ) {
          throw new Error(
            "Stage 2.8 E2E failed: replacement opportunity must use a different trigger transaction.",
          );
        }

        const replacementPaperExecution =
          paperExecutionService.createPlan(
            replacementCandidate,
            replacementSimulation,
          );

        if (
          !replacementPaperExecution.success ||
          !replacementPaperExecution.plan
        ) {
          throw new Error(
            replacementPaperExecution.error ??
              "Stage 2.8 E2E failed: a new trigger opportunity was incorrectly blocked by the previous paper execution.",
          );
        }

        if (
          replacementPaperExecution.plan.triggerTransactionHash !==
          replacementCandidate.triggerTransactionHash
        ) {
          throw new Error(
            "Stage 2.8 E2E failed: replacement paper execution trigger hash mismatch.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Paper Execution correctly accepted new trigger opportunity:",
          replacementPaperExecution.plan,
        );

        if (
          rejectedPaperExecution.success
        ) {
          throw new Error(
            "Paper execution incorrectly accepted the real negative-profit simulation.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Paper Execution correctly rejected real simulation:",
          rejectedPaperExecution.error,
        );

        // ==================================================
        // Paper Execution Store verification
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Testing Paper Execution Store...",
        );

        const storedPaperExecutionCount =
          paperExecutionService.getCount();

        if (
          storedPaperExecutionCount !== 2
        ) {
          throw new Error(
            "Paper execution store count is incorrect after accepting two distinct trigger opportunities.",
          );
        }

        const latestPaperExecution =
          paperExecutionService.getLatest();

        if (!latestPaperExecution) {
          throw new Error(
            "Paper execution store did not return the latest plan.",
          );
        }

        if (
          latestPaperExecution.paperExecutionId !==
          replacementPaperExecution.plan.paperExecutionId
        ) {
          throw new Error(
            "Paper execution store latest plan ID mismatch.",
          );
        }

        if (
          latestPaperExecution.triggerTransactionHash !==
          replacementPaperExecution.plan.triggerTransactionHash
        ) {
          throw new Error(
            "Paper execution store latest trigger hash mismatch.",
          );
        }

        const allPaperExecutions =
          paperExecutionService.getAll();

        if (
          allPaperExecutions.length !== 2
        ) {
          throw new Error(
            "Paper execution store history length is incorrect after two distinct trigger executions.",
          );
        }

        if (
          allPaperExecutions[0].paperExecutionId !==
          paperPlan.paperExecutionId
        ) {
          throw new Error(
            "Paper execution store history first plan mismatch.",
          );
        }

        if (
          allPaperExecutions[1].paperExecutionId !==
          replacementPaperExecution.plan.paperExecutionId
        ) {
          throw new Error(
            "Paper execution store history replacement plan mismatch.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Paper Execution Store ACCEPTED plan verification PASSED.",
        );

        // --------------------------------------------------
        // Verify rejected execution is NOT stored
        // --------------------------------------------------

        const countAfterRejectedExecution =
          paperExecutionService.getCount();

        if (
          countAfterRejectedExecution !== 2
        ) {
          throw new Error(
            "Rejected paper execution incorrectly changed store history.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Paper Execution Store correctly ignored rejected execution.",
        );

        // --------------------------------------------------
        // Clear history
        // --------------------------------------------------

        paperExecutionService.clearHistory();

        if (
          paperExecutionService.getCount() !== 0
        ) {
          throw new Error(
            "Paper execution store was not cleared.",
          );
        }

        if (
          paperExecutionService.getLatest() !== null
        ) {
          throw new Error(
            "Paper execution store latest plan was not cleared.",
          );
        }

        if (
          paperExecutionService.getAll().length !== 0
        ) {
          throw new Error(
            "Paper execution store history was not cleared.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Paper Execution Store clear verification PASSED.",
        );

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Paper Execution integration PASSED.",
        );

        // ==================================================
        // Wrong selector rejection
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Testing unrecognized selector rejection...",
        );

        const rejectedTransaction:
          MonitoredTransaction = {
          ...recognizedTransaction,

          hash:
            "0x" +
            "22".repeat(32),

          data:
            "0xdeadbeef" +
            encodedParameters.slice(2),
        };

        const rejectedCandidate =
          detector.detect(
            rejectedTransaction,
          );

        if (
          rejectedCandidate !==
          null
        ) {
          throw new Error(
            "Unrecognized selector was incorrectly accepted.",
          );
        }

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Unrecognized selector correctly rejected.",
        );

        // ==================================================
        // Final result
        // ==================================================

        console.log(
          "[MEV PIPELINE E2E TEST] PASSED",
        );

        console.log(
          "[MEV PIPELINE E2E TEST] " +
            "Detector -> Decoder -> " +
            "Live Quote -> Pair State -> " +
            "Trigger State -> Post-Trigger Backrun -> " +
            "BackrunSimulator -> Profit Calculator -> " +
            "Paper Execution integration verified.",
        );
      } catch (error) {
        console.error(
          "[MEV PIPELINE E2E TEST] FAILED:",
          error,
        );
      }
    };

  // ====================================================
  // STAGE 2.26.7 - DETERMINISTIC OPERATION 3 ENCODING TEST
  // ====================================================
  // Verifies frontend encoding matches the Solidity
  // Operation 3 ABI structure.
  //
  // This test ONLY encodes/decodes calldata.
  // It does NOT send a transaction.
  // ====================================================

  (window as any).testOperation3Encoding =
    (): void => {
      console.log('========================================')
      console.log('[OPERATION 3 ENCODING TEST] START')
      console.log('========================================')

      const tokenIn =
        '0x1111111111111111111111111111111111111111'

      const tokenOut =
        '0x2222222222222222222222222222222222222222'

      const dex1 = 0
      const dex2 = 1

      const uniFee1 = 3000
      const uniFee2 = 0

      const minOut1 = 950000000000000000n
      const minOut2 = 1000000000n
      const minProfit = 1000000n

      const params = encodeMevBackrunParams(
        dex1,
        dex2,
        tokenIn,
        tokenOut,
        uniFee1,
        uniFee2,
        minOut1,
        minOut2,
        minProfit,
      )

      if (!params.startsWith('0x')) {
        throw new Error(
          '[OPERATION 3 ENCODING TEST] Encoded params must start with 0x',
        )
      }

      // Decode using the exact Solidity ABI structure.
      const [operationType, operationData] =
        abiCoder.decode(
          ['uint8', 'bytes'],
          params,
        )

      if (Number(operationType) !== 3) {
        throw new Error(
          `[OPERATION 3 ENCODING TEST] Expected operationType 3, got ${operationType}`,
        )
      }

      const decoded =
        abiCoder.decode(
          [
            'uint8',
            'uint8',
            'address',
            'address',
            'uint24',
            'uint24',
            'uint256',
            'uint256',
            'uint256',
          ],
          operationData,
        )

      if (Number(decoded[0]) !== dex1) {
        throw new Error(
          '[OPERATION 3 ENCODING TEST] dex1 mismatch',
        )
      }

      if (Number(decoded[1]) !== dex2) {
        throw new Error(
          '[OPERATION 3 ENCODING TEST] dex2 mismatch',
        )
      }

      if (
        decoded[2].toLowerCase() !==
        tokenIn.toLowerCase()
      ) {
        throw new Error(
          '[OPERATION 3 ENCODING TEST] tokenIn mismatch',
        )
      }

      if (
        decoded[3].toLowerCase() !==
        tokenOut.toLowerCase()
      ) {
        throw new Error(
          '[OPERATION 3 ENCODING TEST] tokenOut mismatch',
        )
      }

      if (Number(decoded[4]) !== uniFee1) {
        throw new Error(
          '[OPERATION 3 ENCODING TEST] uniFee1 mismatch',
        )
      }

      if (Number(decoded[5]) !== uniFee2) {
        throw new Error(
          '[OPERATION 3 ENCODING TEST] uniFee2 mismatch',
        )
      }

      if (decoded[6] !== minOut1) {
        throw new Error(
          '[OPERATION 3 ENCODING TEST] minOut1 mismatch',
        )
      }

      if (decoded[7] !== minOut2) {
        throw new Error(
          '[OPERATION 3 ENCODING TEST] minOut2 mismatch',
        )
      }

      if (decoded[8] !== minProfit) {
        throw new Error(
          '[OPERATION 3 ENCODING TEST] minProfit mismatch',
        )
      }

      console.log(
        '[OPERATION 3 ENCODING TEST] operationType:',
        Number(operationType),
      )
      console.log(
        '[OPERATION 3 ENCODING TEST] dex1:',
        Number(decoded[0]),
      )
      console.log(
        '[OPERATION 3 ENCODING TEST] dex2:',
        Number(decoded[1]),
      )
      console.log(
        '[OPERATION 3 ENCODING TEST] tokenIn:',
        decoded[2],
      )
      console.log(
        '[OPERATION 3 ENCODING TEST] tokenOut:',
        decoded[3],
      )
      console.log(
        '[OPERATION 3 ENCODING TEST] uniFee1:',
        Number(decoded[4]),
      )
      console.log(
        '[OPERATION 3 ENCODING TEST] uniFee2:',
        Number(decoded[5]),
      )
      console.log(
        '[OPERATION 3 ENCODING TEST] minOut1:',
        decoded[6].toString(),
      )
      console.log(
        '[OPERATION 3 ENCODING TEST] minOut2:',
        decoded[7].toString(),
      )
      console.log(
        '[OPERATION 3 ENCODING TEST] minProfit:',
        decoded[8].toString(),
      )
      console.log(
        '[OPERATION 3 ENCODING TEST] PASSED',
      )
      console.log('========================================')
    };

    // ====================================================
    // STAGE 2.26.11 - OPERATION 3 ADAPTER TEST
    // ====================================================
    // Verifies the frontend DEX representation is correctly
    // converted into the numeric Solidity Operation 3 selectors.
    //
    // This test ONLY encodes/decodes calldata.
    // It does NOT send a transaction.
    // ====================================================

    (window as any).testOperation3Adapter =
      (): void => {
        console.log('========================================')
        console.log('[OPERATION 3 ADAPTER TEST] START')
        console.log('========================================')

        const tokenIn =
          '0x1111111111111111111111111111111111111111'

        const tokenOut =
          '0x2222222222222222222222222222222222222222'

        const executionData = {
          dex1: "V3" as const,
          dex2: "V2" as const,
          tokenIn,
          tokenOut,
          uniFee1: 3000,
          uniFee2: 0,
          minOut1: 900000n,
          minOut2: 1000000n,
          minProfit: 10000n,
        }

        const params =
          encodeOperation3ExecutionData(
            executionData,
          )

        if (!params.startsWith('0x')) {
          throw new Error(
            '[OPERATION 3 ADAPTER TEST] Encoded params must start with 0x',
          )
        }

        const abiCoder =
          AbiCoder.defaultAbiCoder()

        const [
          operationType,
          operationData,
        ] =
          abiCoder.decode(
            ['uint8', 'bytes'],
            params,
          )

        if (Number(operationType) !== 3) {
          throw new Error(
            `[OPERATION 3 ADAPTER TEST] Expected operationType 3, got ${operationType}`,
          )
        }

        const decoded =
          abiCoder.decode(
            [
              'uint8',
              'uint8',
              'address',
              'address',
              'uint24',
              'uint24',
              'uint256',
              'uint256',
              'uint256',
            ],
            operationData,
          )

        if (Number(decoded[0]) !== 0) {
          throw new Error(
            '[OPERATION 3 ADAPTER TEST] V3 dex1 must map to selector 0',
          )
        }

        if (Number(decoded[1]) !== 1) {
          throw new Error(
            '[OPERATION 3 ADAPTER TEST] V2 dex2 must map to selector 1',
          )
        }

        if (
          decoded[2].toLowerCase() !==
          tokenIn.toLowerCase()
        ) {
          throw new Error(
            '[OPERATION 3 ADAPTER TEST] tokenIn mismatch',
          )
        }

        if (
          decoded[3].toLowerCase() !==
          tokenOut.toLowerCase()
        ) {
          throw new Error(
            '[OPERATION 3 ADAPTER TEST] tokenOut mismatch',
          )
        }

        if (Number(decoded[4]) !== 3000) {
          throw new Error(
            '[OPERATION 3 ADAPTER TEST] uniFee1 mismatch',
          )
        }

        if (Number(decoded[5]) !== 0) {
          throw new Error(
            '[OPERATION 3 ADAPTER TEST] uniFee2 mismatch',
          )
        }

        if (decoded[6] !== 900000n) {
          throw new Error(
            '[OPERATION 3 ADAPTER TEST] minOut1 mismatch',
          )
        }

        if (decoded[7] !== 1000000n) {
          throw new Error(
            '[OPERATION 3 ADAPTER TEST] minOut2 mismatch',
          )
        }

        if (decoded[8] !== 10000n) {
          throw new Error(
            '[OPERATION 3 ADAPTER TEST] minProfit mismatch',
          )
        }

        console.log(
          '[OPERATION 3 ADAPTER TEST] V3 -> 0: PASSED',
        )

        console.log(
          '[OPERATION 3 ADAPTER TEST] V2 -> 1: PASSED',
        )

        console.log(
          '[OPERATION 3 ADAPTER TEST] ALL FIELDS: PASSED',
        )

        console.log(
          '[OPERATION 3 ADAPTER TEST] PASSED',
        )

        console.log('========================================')
      }
}
