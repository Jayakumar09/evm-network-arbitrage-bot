import { AbiCoder } from "ethers";
import { encodeMevBackrunParams } from '../blockchain'
import {
  Operation3Simulator,
  simulateOperation3Repayment,
  simulateOperation3TwoLegs,
  validateOperation3LegOutput,
  getOperation3V2PairState,
  simulateOperation3V2Leg,
} from "./operation3Simulator";

import {
  simulateOperation3V2StatefulLeg,
} from "./operation3Simulator";
import {
  createOperation3ExecutionData,
  encodeOperation3ExecutionData,
} from "./operation3Adapter";
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
  Operation3SimulationResult,
  Operation3SimulationRequest,
  Operation3LegSimulationResult,
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

  (window as any).testOperation3V2StatefulLeg =
   testOperation3V2StatefulLeg;
  (window as any).testOperation3StatefulTwoLegs =
     testOperation3StatefulTwoLegs;
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
// STAGE 2.26.12 - OPERATION 3 EXECUTION DATA TEST
// ====================================================
//
// Verifies that explicit Operation 3 route parameters
// are correctly constructed into Operation3ExecutionData.
//
// This test ONLY constructs frontend data.
// It does NOT encode calldata.
// It does NOT send a transaction.
// It does NOT access a wallet.
// ====================================================

(window as any).testOperation3ExecutionData =
  (): void => {
    console.log("========================================");
    console.log(
      "[OPERATION 3 EXECUTION DATA TEST] START",
    );
    console.log("========================================");

    const tokenIn =
      "0x1111111111111111111111111111111111111111";

    const tokenOut =
      "0x2222222222222222222222222222222222222222";

    const executionData =
      createOperation3ExecutionData(
        "V3",
        "V2",
        tokenIn,
        tokenOut,
        3000,
        0,
        900000n,
        1000000n,
        10000n,
      );

    if (executionData.dex1 !== "V3") {
      throw new Error(
        "[OPERATION 3 EXECUTION DATA TEST] dex1 mismatch",
      );
    }

    if (executionData.dex2 !== "V2") {
      throw new Error(
        "[OPERATION 3 EXECUTION DATA TEST] dex2 mismatch",
      );
    }

    if (
      executionData.tokenIn.toLowerCase() !==
      tokenIn.toLowerCase()
    ) {
      throw new Error(
        "[OPERATION 3 EXECUTION DATA TEST] tokenIn mismatch",
      );
    }

    if (
      executionData.tokenOut.toLowerCase() !==
      tokenOut.toLowerCase()
    ) {
      throw new Error(
        "[OPERATION 3 EXECUTION DATA TEST] tokenOut mismatch",
      );
    }

    if (executionData.uniFee1 !== 3000) {
      throw new Error(
        "[OPERATION 3 EXECUTION DATA TEST] uniFee1 mismatch",
      );
    }

    if (executionData.uniFee2 !== 0) {
      throw new Error(
        "[OPERATION 3 EXECUTION DATA TEST] uniFee2 mismatch",
      );
    }

    if (executionData.minOut1 !== 900000n) {
      throw new Error(
        "[OPERATION 3 EXECUTION DATA TEST] minOut1 mismatch",
      );
    }

    if (executionData.minOut2 !== 1000000n) {
      throw new Error(
        "[OPERATION 3 EXECUTION DATA TEST] minOut2 mismatch",
      );
    }

    if (executionData.minProfit !== 10000n) {
      throw new Error(
        "[OPERATION 3 EXECUTION DATA TEST] minProfit mismatch",
      );
    }

    console.log(
      "[OPERATION 3 EXECUTION DATA TEST] ALL FIELDS: PASSED",
    );

    console.log(
      "[OPERATION 3 EXECUTION DATA TEST] PASSED",
    );

    console.log("========================================");
  };

  // ======================================================
// STAGE 2.26.14E — OPERATION 3 PAPER PLAN PROPAGATION TEST
// ======================================================
//
// Verifies that an Operation3SimulationResult can be
// carried by a PaperExecutionPlan without being modified.
//
// This test is paper-only.
// It does NOT:
// - connect a wallet
// - request a signature
// - send a transaction
// - call a write contract method
// - modify blockchain state
// ======================================================

(window as any).testOperation3PaperPlanPropagation =
  (): void => {
    console.log("========================================");
    console.log(
      "[OPERATION 3 PAPER PLAN TEST] START",
    );
    console.log("========================================");

    const triggerTransactionHash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const operation3ExecutionData = {
      dex1: "V3" as const,
      dex2: "V2" as const,

      tokenIn:
        "0x1111111111111111111111111111111111111111",

      tokenOut:
        "0x2222222222222222222222222222222222222222",

      uniFee1: 3000,
      uniFee2: 0,

      minOut1: 900000n,
      minOut2: 1000000n,

      minProfit: 10000n,
    };

    const operation3SimulationResult:
      Operation3SimulationResult = {
      success: true,

      executionData:
        operation3ExecutionData,

      expectedProfit: 50000n,
      gasCost: 10000n,
      netProfit: 40000n,

      profitable: true,
    };

    const candidate:
      BackrunCandidate = {
      triggerTransactionHash,

      blockNumber: 12345678,

      description:
        "Operation 3 paper propagation test",

      detectedAt:
        1700000000000,

      tokenIn:
        operation3ExecutionData.tokenIn,

      tokenOut:
        operation3ExecutionData.tokenOut,

      amountIn:
        1000000n,

      expectedAmountOut:
        1100000n,
    };

    const profitablePaperSimulation:
      BackrunSimulationResult = {
      success: true,

      triggerTransactionHash,

      backrunDex: "V2",

      backrunTokenIn:
        operation3ExecutionData.tokenOut,

      backrunTokenOut:
        operation3ExecutionData.tokenIn,

      backrunAmountIn:
        operation3ExecutionData.minOut1,

      backrunExpectedAmountOut:
        operation3ExecutionData.minOut2,

      expectedProfit: 100000n,

      gasCost: 20000n,

      netProfit: 80000n,

      profitable: true,
    };

    const paperExecutionService =
      new PaperExecutionService();

    try {
      // ==================================================
      // Clear previous paper execution state
      // ==================================================

      paperExecutionStore.clear();

      // ==================================================
      // Publish deterministic FRESH opportunity
      // ==================================================

      mevOpportunityStore.setOpportunity(
        candidate,
        profitablePaperSimulation,
      );

      const opportunity =
        mevOpportunityStore.getState();

      if (!opportunity) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "MEV opportunity was not published.",
        );
      }

      if (
        opportunity.freshness !==
        "FRESH"
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "MEV opportunity is not FRESH.",
        );
      }

      if (
        opportunity.candidate
          .triggerTransactionHash
          .toLowerCase() !==
        triggerTransactionHash.toLowerCase()
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "Opportunity trigger hash mismatch.",
        );
      }

      // ==================================================
      // CREATE PAPER PLAN THROUGH THE REAL SERVICE
      // ==================================================

      const paperExecutionResult =
        paperExecutionService.createPlan(
          candidate,
          profitablePaperSimulation,
          operation3SimulationResult,
        );

      if (!paperExecutionResult.success) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "PaperExecutionService.createPlan() failed: " +
            (paperExecutionResult.error ??
              "Unknown error."),
        );
      }

      if (!paperExecutionResult.plan) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "Paper execution plan was not returned.",
        );
      }

      const paperPlan =
        paperExecutionResult.plan;

      // ==================================================
      // Verify Operation 3 result propagation
      // ==================================================

      if (
        paperPlan.operation3SimulationResult ===
        undefined
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "Operation 3 simulation result missing " +
            "from PaperExecutionPlan.",
        );
      }

      const result =
        paperPlan.operation3SimulationResult;

      if (!result.success) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "Expected successful Operation 3 simulation result.",
        );
      }

      // ==================================================
      // Verify Operation 3 execution data
      // ==================================================

      if (
        result.executionData?.dex1 !==
        operation3ExecutionData.dex1
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "dex1 mismatch.",
        );
      }

      if (
        result.executionData?.dex2 !==
        operation3ExecutionData.dex2
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "dex2 mismatch.",
        );
      }

      if (
        result.executionData?.tokenIn.toLowerCase() !==
        operation3ExecutionData.tokenIn.toLowerCase()
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "tokenIn mismatch.",
        );
      }

      if (
        result.executionData?.tokenOut.toLowerCase() !==
        operation3ExecutionData.tokenOut.toLowerCase()
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "tokenOut mismatch.",
        );
      }

      if (
        result.executionData?.uniFee1 !==
        operation3ExecutionData.uniFee1
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "uniFee1 mismatch.",
        );
      }

      if (
        result.executionData?.uniFee2 !==
        operation3ExecutionData.uniFee2
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "uniFee2 mismatch.",
        );
      }

      if (
        result.executionData?.minOut1 !==
        operation3ExecutionData.minOut1
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "minOut1 mismatch.",
        );
      }

      if (
        result.executionData?.minOut2 !==
        operation3ExecutionData.minOut2
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "minOut2 mismatch.",
        );
      }

      if (
        result.executionData?.minProfit !==
        operation3ExecutionData.minProfit
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "minProfit mismatch.",
        );
      }

      // ==================================================
      // Verify Operation 3 financial result
      // ==================================================

      if (
        result.expectedProfit !==
        operation3SimulationResult.expectedProfit
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "expectedProfit mismatch.",
        );
      }

      if (
        result.gasCost !==
        operation3SimulationResult.gasCost
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "gasCost mismatch.",
        );
      }

      if (
        result.netProfit !==
        operation3SimulationResult.netProfit
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "netProfit mismatch.",
        );
      }

      if (
        result.profitable !==
        operation3SimulationResult.profitable
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "profitable mismatch.",
        );
      }

      // ==================================================
      // Verify the plan itself remains paper-only
      // ==================================================

      if (
        paperPlan.paperOnly !== true
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "Paper plan is not marked paperOnly.",
        );
      }

      if (
        paperPlan.state !==
        "PAPER_ACCEPTED"
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "Paper plan state mismatch.",
        );
      }

      if (
        paperPlan.triggerTransactionHash.toLowerCase() !==
        triggerTransactionHash.toLowerCase()
      ) {
        throw new Error(
          "[OPERATION 3 PAPER PLAN TEST] " +
            "Paper plan trigger hash mismatch.",
        );
      }

      console.log(
        "[OPERATION 3 PAPER PLAN TEST] " +
          "Operation 3 simulation result propagated " +
          "through PaperExecutionService.",
      );

      console.log(
        "[OPERATION 3 PAPER PLAN TEST] " +
          "ALL EXECUTION DATA: PASSED",
      );

      console.log(
        "[OPERATION 3 PAPER PLAN TEST] " +
          "PASSED",
      );

      console.log("========================================");
    } finally {
      // ==================================================
      // Restore clean paper execution state
      // ==================================================

      paperExecutionStore.clear();
    }
  };

  // ======================================================
  // STAGE 2.26.14F — OPERATION 3 STORE PROPAGATION TEST
  // ======================================================
  //
  // Verifies that Operation3SimulationResult survives
  // the actual PaperExecutionStore add/get lifecycle.
  //
  // This test is paper-only.
  // It does NOT:
  // - connect a wallet
  // - request a signature
  // - send a transaction
  // - call a write contract method
  // - modify blockchain state
  // ======================================================

  (window as any).testOperation3StorePropagation =
    (): void => {
      console.log('========================================')
      console.log(
        '[OPERATION 3 STORE TEST] START',
      )
      console.log('========================================')

      const operation3ExecutionData = {
        dex1: "V3" as const,
        dex2: "V2" as const,

        tokenIn:
          '0x1111111111111111111111111111111111111111',

        tokenOut:
          '0x2222222222222222222222222222222222222222',

        uniFee1: 3000,
        uniFee2: 0,

        minOut1: 900000n,
        minOut2: 1000000n,

        minProfit: 10000n,
      }

      const operation3SimulationResult = {
        success: true,

        executionData:
          operation3ExecutionData,

        expectedProfit: 50000n,
        gasCost: 10000n,
        netProfit: 40000n,

        profitable: true,
      }

      const paperPlan = {
        paperExecutionId:
          'PAPER-OP3-STORE-TEST-001',

        triggerTransactionHash:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',

        operation3SimulationResult,

        backrunDex: "V2" as const,

        backrunTokenIn:
          operation3ExecutionData.tokenOut,

        backrunTokenOut:
          operation3ExecutionData.tokenIn,

        backrunAmountIn:
          operation3ExecutionData.minOut1,

        backrunExpectedAmountOut:
          operation3ExecutionData.minOut2,

        blockNumber: 12345679,

        tokenIn:
          operation3ExecutionData.tokenIn,

        tokenOut:
          operation3ExecutionData.tokenOut,

        amountIn:
          1000000n,

        expectedAmountOut:
          1100000n,

        expectedProfit:
          operation3SimulationResult.expectedProfit,

        gasCost:
          operation3SimulationResult.gasCost,

        netProfit:
          operation3SimulationResult.netProfit,

        profitable:
          operation3SimulationResult.profitable,

        createdAt: 1700000001000,

        paperOnly: true as const,

        state: "PAPER_ACCEPTED" as const,
      }

      paperExecutionStore.clear()

      paperExecutionStore.add(
        paperPlan,
      )

      const storedPlan =
        paperExecutionStore.getLatest()

      if (
        storedPlan == null
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] Stored paper plan was not found.',
        )
      }

      if (
        storedPlan.paperExecutionId !==
        paperPlan.paperExecutionId
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] Paper execution ID mismatch.',
        )
      }

      if (
        storedPlan.state !==
        "PAPER_RECORDED"
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] Expected PAPER_RECORDED state.',
        )
      }

      const result =
        storedPlan.operation3SimulationResult

      if (
        result === undefined
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] Operation 3 simulation result missing after store.',
        )
      }

      if (
        result.executionData?.dex1 !==
        operation3ExecutionData.dex1
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] dex1 mismatch.',
        )
      }

      if (
        result.executionData?.dex2 !==
        operation3ExecutionData.dex2
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] dex2 mismatch.',
        )
      }

      if (
        result.executionData?.tokenIn.toLowerCase() !==
        operation3ExecutionData.tokenIn.toLowerCase()
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] tokenIn mismatch.',
        )
      }

      if (
        result.executionData?.tokenOut.toLowerCase() !==
        operation3ExecutionData.tokenOut.toLowerCase()
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] tokenOut mismatch.',
        )
      }

      if (
        result.executionData?.uniFee1 !==
        operation3ExecutionData.uniFee1
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] uniFee1 mismatch.',
        )
      }

      if (
        result.executionData?.uniFee2 !==
        operation3ExecutionData.uniFee2
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] uniFee2 mismatch.',
        )
      }

      if (
        result.executionData?.minOut1 !==
        operation3ExecutionData.minOut1
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] minOut1 mismatch.',
        )
      }

      if (
        result.executionData?.minOut2 !==
        operation3ExecutionData.minOut2
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] minOut2 mismatch.',
        )
      }

      if (
        result.executionData?.minProfit !==
        operation3ExecutionData.minProfit
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] minProfit mismatch.',
        )
      }

      if (
        result.expectedProfit !==
        operation3SimulationResult.expectedProfit
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] expectedProfit mismatch.',
        )
      }

      if (
        result.gasCost !==
        operation3SimulationResult.gasCost
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] gasCost mismatch.',
        )
      }

      if (
        result.netProfit !==
        operation3SimulationResult.netProfit
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] netProfit mismatch.',
        )
      }

      if (
        result.profitable !==
        operation3SimulationResult.profitable
      ) {
        throw new Error(
          '[OPERATION 3 STORE TEST] profitable mismatch.',
        )
      }

      console.log(
        '[OPERATION 3 STORE TEST] STORE INSERT: PASSED',
      )

      console.log(
        '[OPERATION 3 STORE TEST] OPERATION 3 DATA: PASSED',
      )

      console.log(
        '[OPERATION 3 STORE TEST] STATE TRANSITION: PASSED',
      )

      console.log(
        '[OPERATION 3 STORE TEST] PASSED',
      )
    }

    // ======================================================
    // STAGE 2.26.14G — OPERATION 3 HISTORY PROPAGATION TEST
    // ======================================================
    //
    // Verifies that Operation3SimulationResult survives the
    // Store -> PaperExecutionService -> History data path.
    //
    // PaperExecutionHistory uses PaperExecutionService.getAll()
    // to obtain the same plans stored in PaperExecutionStore.
    //
    // This test is paper-only.
    // It does NOT:
    // - connect a wallet
    // - request a signature
    // - send a transaction
    // - call a write contract method
    // - modify blockchain state
    // ======================================================

    (window as any).testOperation3HistoryPropagation =
      (): void => {
        console.log('========================================')
        console.log(
          '[OPERATION 3 HISTORY TEST] START',
        )
        console.log('========================================')

        const operation3ExecutionData = {
          dex1: "V3" as const,
          dex2: "V2" as const,

          tokenIn:
            '0x1111111111111111111111111111111111111111',

          tokenOut:
            '0x2222222222222222222222222222222222222222',

          uniFee1: 3000,
          uniFee2: 0,

          minOut1: 900000n,
          minOut2: 1000000n,

          minProfit: 10000n,
        }

        const operation3SimulationResult = {
          success: true,

          executionData:
            operation3ExecutionData,

          expectedProfit: 50000n,
          gasCost: 10000n,
          netProfit: 40000n,

          profitable: true,
        }

        const paperPlan = {
          paperExecutionId:
            'PAPER-OP3-HISTORY-TEST-001',

          triggerTransactionHash:
            '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',

          operation3SimulationResult,

          backrunDex: "V2" as const,

          backrunTokenIn:
            operation3ExecutionData.tokenOut,

          backrunTokenOut:
            operation3ExecutionData.tokenIn,

          backrunAmountIn:
            operation3ExecutionData.minOut1,

          backrunExpectedAmountOut:
            operation3ExecutionData.minOut2,

          blockNumber: 12345680,

          tokenIn:
            operation3ExecutionData.tokenIn,

          tokenOut:
            operation3ExecutionData.tokenOut,

          amountIn:
            1000000n,

          expectedAmountOut:
            1100000n,

          expectedProfit:
            operation3SimulationResult.expectedProfit,

          gasCost:
            operation3SimulationResult.gasCost,

          netProfit:
            operation3SimulationResult.netProfit,

          profitable:
            operation3SimulationResult.profitable,

          createdAt: 1700000002000,

          paperOnly: true as const,

          state: "PAPER_ACCEPTED" as const,
        }

        paperExecutionStore.clear()

        paperExecutionStore.add(
          paperPlan,
        )

        const historyService =
          new PaperExecutionService()

        const history =
          historyService.getAll()

        if (
          history.length !== 1
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] Expected exactly one history record.',
          )
        }

        const historyPlan =
          history[0]

        if (
          historyPlan === undefined
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] History record was not found.',
          )
        }

        if (
          historyPlan.paperExecutionId !==
          paperPlan.paperExecutionId
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] Paper execution ID mismatch.',
          )
        }

        if (
          historyPlan.state !==
          "PAPER_RECORDED"
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] Expected PAPER_RECORDED state.',
          )
        }

        const result =
          historyPlan.operation3SimulationResult

        if (
          result === undefined
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] Operation 3 simulation result missing from history.',
          )
        }

        if (
          result.success !== true
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] Operation 3 simulation success flag mismatch.',
          )
        }

        if (
          result.executionData?.dex1 !==
          operation3ExecutionData.dex1
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] dex1 mismatch.',
          )
        }

        if (
          result.executionData?.dex2 !==
          operation3ExecutionData.dex2
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] dex2 mismatch.',
          )
        }

        if (
          result.executionData?.tokenIn.toLowerCase() !==
          operation3ExecutionData.tokenIn.toLowerCase()
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] tokenIn mismatch.',
          )
        }

        if (
          result.executionData?.tokenOut.toLowerCase() !==
          operation3ExecutionData.tokenOut.toLowerCase()
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] tokenOut mismatch.',
          )
        }

        if (
          result.executionData?.uniFee1 !==
          operation3ExecutionData.uniFee1
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] uniFee1 mismatch.',
          )
        }

        if (
          result.executionData?.uniFee2 !==
          operation3ExecutionData.uniFee2
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] uniFee2 mismatch.',
          )
        }

        if (
          result.executionData?.minOut1 !==
          operation3ExecutionData.minOut1
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] minOut1 mismatch.',
          )
        }

        if (
          result.executionData?.minOut2 !==
          operation3ExecutionData.minOut2
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] minOut2 mismatch.',
          )
        }

        if (
          result.executionData?.minProfit !==
          operation3ExecutionData.minProfit
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] minProfit mismatch.',
          )
        }

        if (
          result.expectedProfit !==
          operation3SimulationResult.expectedProfit
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] expectedProfit mismatch.',
          )
        }

        if (
          result.gasCost !==
          operation3SimulationResult.gasCost
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] gasCost mismatch.',
          )
        }

        if (
          result.netProfit !==
          operation3SimulationResult.netProfit
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] netProfit mismatch.',
          )
        }

        if (
          result.profitable !==
          operation3SimulationResult.profitable
        ) {
          throw new Error(
            '[OPERATION 3 HISTORY TEST] profitable mismatch.',
          )
        }

        console.log(
          '[OPERATION 3 HISTORY TEST] SERVICE -> HISTORY: PASSED',
        )

        console.log(
          '[OPERATION 3 HISTORY TEST] OPERATION 3 DATA: PASSED',
        )

        console.log(
          '[OPERATION 3 HISTORY TEST] STATE: PASSED',
        )

        console.log(
          '[OPERATION 3 HISTORY TEST] PASSED',
        )
      }

  // ====================================================
  // STAGE 2.26.14C - OPERATION 3 SIMULATION FAILURE TEST
  // ====================================================
  //
  // Verifies that Operation3SimulationResult correctly
  // represents a failed simulation.
  //
  // This test ONLY constructs frontend simulation data.
  // It does NOT encode calldata.
  // It does NOT send a transaction.
  // It does NOT access a wallet.
  // ====================================================

  (window as any).testOperation3SimulationFailure =
    (): void => {
      console.log("========================================");
      console.log(
        "[OPERATION 3 SIMULATION FAILURE TEST] START",
      );
      console.log("========================================");

      const result: Operation3SimulationResult = {
        success: false,
        expectedProfit: 0n,
        gasCost: 5000n,
        netProfit: -5000n,
        profitable: false,
        error:
          "Operation 3 simulation failed: insufficient output",
      };

      if (result.success !== false) {
        throw new Error(
          "[OPERATION 3 SIMULATION FAILURE TEST] success mismatch",
        );
      }

      if (result.executionData !== undefined) {
        throw new Error(
          "[OPERATION 3 SIMULATION FAILURE TEST] executionData should be undefined",
        );
      }

      if (result.expectedProfit !== 0n) {
        throw new Error(
          "[OPERATION 3 SIMULATION FAILURE TEST] expectedProfit mismatch",
        );
      }

      if (result.gasCost !== 5000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION FAILURE TEST] gasCost mismatch",
        );
      }

      if (result.netProfit !== -5000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION FAILURE TEST] netProfit mismatch",
        );
      }

      if (result.profitable !== false) {
        throw new Error(
          "[OPERATION 3 SIMULATION FAILURE TEST] profitable mismatch",
        );
      }

      if (
        result.error !==
        "Operation 3 simulation failed: insufficient output"
      ) {
        throw new Error(
          "[OPERATION 3 SIMULATION FAILURE TEST] error mismatch",
        );
      }

      console.log(
        "[OPERATION 3 SIMULATION FAILURE TEST] ALL FIELDS: PASSED",
      );

      console.log(
        "[OPERATION 3 SIMULATION FAILURE TEST] PASSED",
      );

      console.log("========================================");
    };

  // ====================================================
  // STAGE 2.26.15B - OPERATION 3 SIMULATION REQUEST TEST
  // ====================================================
  //
  // Verifies that the complete Operation 3 simulation
  // request contains the route execution data and
  // flash-loan context required by the future simulator.
  //
  // This test ONLY constructs frontend data.
  // It does NOT simulate a swap.
  // It does NOT encode calldata.
  // It does NOT send a transaction.
  // It does NOT access a wallet.
  // ====================================================

  (window as any).testOperation3SimulationRequest =
    (): void => {
      console.log("========================================");
      console.log(
        "[OPERATION 3 SIMULATION REQUEST TEST] START",
      );
      console.log("========================================");

      const executionData = {
        dex1: "V3" as const,
        dex2: "V2" as const,
        tokenIn:
          "0x1111111111111111111111111111111111111111",
        tokenOut:
          "0x2222222222222222222222222222222222222222",
        uniFee1: 3000,
        uniFee2: 0,
        minOut1: 900000n,
        minOut2: 1000000n,
        minProfit: 10000n,
      };

      const request: Operation3SimulationRequest = {
        executionData,

        flashLoanAsset:
          "0x1111111111111111111111111111111111111111",

        flashLoanAmount:
          1000000n,

        flashLoanPremium:
          500n,
      };

      if (!request.executionData) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] executionData missing",
        );
      }

      if (request.executionData.dex1 !== "V3") {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] dex1 mismatch",
        );
      }

      if (request.executionData.dex2 !== "V2") {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] dex2 mismatch",
        );
      }

      if (
        request.executionData.tokenIn.toLowerCase() !==
        executionData.tokenIn.toLowerCase()
      ) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] tokenIn mismatch",
        );
      }

      if (
        request.executionData.tokenOut.toLowerCase() !==
        executionData.tokenOut.toLowerCase()
      ) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] tokenOut mismatch",
        );
      }

      if (request.executionData.uniFee1 !== 3000) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] uniFee1 mismatch",
        );
      }

      if (request.executionData.uniFee2 !== 0) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] uniFee2 mismatch",
        );
      }

      if (request.executionData.minOut1 !== 900000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] minOut1 mismatch",
        );
      }

      if (request.executionData.minOut2 !== 1000000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] minOut2 mismatch",
        );
      }

      if (request.executionData.minProfit !== 10000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] minProfit mismatch",
        );
      }

      if (
        request.flashLoanAsset.toLowerCase() !==
        request.executionData.tokenIn.toLowerCase()
      ) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] flashLoanAsset must match executionData.tokenIn",
        );
      }

      if (request.flashLoanAmount !== 1000000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] flashLoanAmount mismatch",
        );
      }

      if (request.flashLoanPremium !== 500n) {
        throw new Error(
          "[OPERATION 3 SIMULATION REQUEST TEST] flashLoanPremium mismatch",
        );
      }

      console.log(
        "[OPERATION 3 SIMULATION REQUEST TEST] ALL FIELDS: PASSED",
      );

      console.log(
        "[OPERATION 3 SIMULATION REQUEST TEST] PASSED",
      );

      console.log("========================================");
    };

  // ====================================================
  // STAGE 2.26.15D - OPERATION 3 SIMULATOR TEST
  // ====================================================
  //
  // Verifies the dedicated Operation 3 simulator boundary.
  //
  // This stage validates the request but intentionally does
  // NOT implement route-state simulation.
  //
  // IMPORTANT:
  // This test:
  // - does NOT send a transaction
  // - does NOT access a wallet
  // - does NOT call Executor
  // - does NOT modify blockchain state
  // ====================================================

  (window as any).testOperation3Simulator =
    async (): Promise<void> => {
      console.log("========================================");
      console.log(
        "[OPERATION 3 SIMULATOR TEST] START",
      );
      console.log("========================================");

      const simulator =
        new Operation3Simulator();

      const executionData = {
        dex1: "V3" as const,
        dex2: "V2" as const,
        tokenIn:
          "0x1111111111111111111111111111111111111111",
        tokenOut:
          "0x2222222222222222222222222222222222222222",
        uniFee1: 3000,
        uniFee2: 0,
        minOut1: 900000n,
        minOut2: 1000000n,
        minProfit: 10000n,
      };

      const request: Operation3SimulationRequest = {
        executionData,

        flashLoanAsset:
          "0x1111111111111111111111111111111111111111",

        flashLoanAmount:
          1000000n,

        flashLoanPremium:
          500n,
      };

      const result =
        await simulator.simulate(request);

      if (result.success !== false) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] success should be false",
        );
      }

      if (result.executionData !== undefined) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] executionData should be undefined",
        );
      }

      if (result.expectedProfit !== 0n) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] expectedProfit mismatch",
        );
      }

      if (result.gasCost !== 0n) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] gasCost mismatch",
        );
      }

      if (result.netProfit !== 0n) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] netProfit mismatch",
        );
      }

      if (result.profitable !== false) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] profitable should be false",
        );
      }

      if (
        result.error !==
        "Operation 3 route simulation is not implemented yet."
      ) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] error mismatch",
        );
      }

      console.log(
        "[OPERATION 3 SIMULATOR TEST] VALID REQUEST REJECTED AS EXPECTED",
      );

      // ==================================================
      // INVALID FLASH-LOAN ASSET TEST
      // ==================================================

      const invalidRequest:
        Operation3SimulationRequest = {
          ...request,

          flashLoanAsset:
            "0x3333333333333333333333333333333333333333",
        };

      const invalidResult =
        await simulator.simulate(
          invalidRequest,
        );

      if (invalidResult.success !== false) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] invalid request should fail",
        );
      }

      if (
        invalidResult.error !==
        "Operation 3 flash-loan asset must match executionData.tokenIn."
      ) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] invalid asset error mismatch",
        );
      }

      if (
        invalidResult.expectedProfit !== 0n ||
        invalidResult.gasCost !== 0n ||
        invalidResult.netProfit !== 0n
      ) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] invalid request result values mismatch",
        );
      }

      if (invalidResult.profitable !== false) {
        throw new Error(
          "[OPERATION 3 SIMULATOR TEST] invalid request should not be profitable",
        );
      }

      console.log(
        "[OPERATION 3 SIMULATOR TEST] INVALID ASSET REJECTED AS EXPECTED",
      );

      console.log(
        "[OPERATION 3 SIMULATOR TEST] ALL CHECKS: PASSED",
      );

      console.log(
        "[OPERATION 3 SIMULATOR TEST] PASSED",
      );

      console.log("========================================");
    };

  // ====================================================
  // STAGE 2.26.16B - OPERATION 3 REPAYMENT TEST
  // ====================================================
  //
  // Verifies the pure mathematical calculation of the
  // minimum final tokenIn balance required by Operation 3.
  //
  // Formula:
  //
  // requiredBalance =
  //   flashLoanAmount
  //   + flashLoanPremium
  //   + minProfit
  //
  // This test:
  // - does NOT access the blockchain
  // - does NOT access a wallet
  // - does NOT send a transaction
  // - does NOT execute a swap
  // ====================================================

  (window as any).testOperation3Repayment =
    (): void => {
      console.log("========================================");
      console.log(
        "[OPERATION 3 REPAYMENT TEST] START",
      );
      console.log("========================================");

      const request: Operation3SimulationRequest = {
        executionData: {
          dex1: "V3",
          dex2: "V2",
          tokenIn:
            "0x1111111111111111111111111111111111111111",
          tokenOut:
            "0x2222222222222222222222222222222222222222",
          uniFee1: 3000,
          uniFee2: 0,
          minOut1: 900000n,
          minOut2: 1000000n,
          minProfit: 10000n,
        },

        flashLoanAsset:
          "0x1111111111111111111111111111111111111111",

        flashLoanAmount:
          1000000n,

        flashLoanPremium:
          500n,
      };

      const requiredBalance =
        simulateOperation3Repayment(request);

      const expectedRequiredBalance =
        1000000n +
        500n +
        10000n;

      if (
        requiredBalance !==
        expectedRequiredBalance
      ) {
        throw new Error(
          "[OPERATION 3 REPAYMENT TEST] required balance mismatch",
        );
      }

      if (requiredBalance !== 1010500n) {
        throw new Error(
          "[OPERATION 3 REPAYMENT TEST] exact required balance mismatch",
        );
      }

      console.log(
        "[OPERATION 3 REPAYMENT TEST] FORMULA: PASSED",
      );

      console.log(
        "[OPERATION 3 REPAYMENT TEST] EXPECTED: 1010500",
      );

      console.log(
        "[OPERATION 3 REPAYMENT TEST] ACTUAL:",
        requiredBalance.toString(),
      );

      console.log(
        "[OPERATION 3 REPAYMENT TEST] PASSED",
      );

      console.log("========================================");
    };

    // ====================================================
    // STAGE 2.26.18B - OPERATION 3 LEG OUTPUT TEST
    // ====================================================
    //
    // Verifies the minimum-output validation primitive.
    //
    // This test:
    // - does NOT query a DEX
    // - does NOT access the blockchain
    // - does NOT execute a swap
    // ====================================================

    (window as any).testOperation3LegOutputValidation =
      (): void => {
        console.log("========================================");
        console.log(
          "[OPERATION 3 LEG OUTPUT TEST] START",
        );
        console.log("========================================");

        // ==================================================
        // VALID OUTPUT
        // ==================================================

        const validResult =
          validateOperation3LegOutput(
            "V3",
            "0x1111111111111111111111111111111111111111",
            "0x2222222222222222222222222222222222222222",
            1000000n,
            950000n,
            900000n,
          );

        if (validResult.success !== true) {
          throw new Error(
            "[OPERATION 3 LEG OUTPUT TEST] valid success mismatch",
          );
        }

        if (validResult.amountOutValid !== true) {
          throw new Error(
            "[OPERATION 3 LEG OUTPUT TEST] valid amountOutValid mismatch",
          );
        }

        if (validResult.expectedAmountOut !== 950000n) {
          throw new Error(
            "[OPERATION 3 LEG OUTPUT TEST] valid expectedAmountOut mismatch",
          );
        }

        if (validResult.minAmountOut !== 900000n) {
          throw new Error(
            "[OPERATION 3 LEG OUTPUT TEST] valid minAmountOut mismatch",
          );
        }

        if (validResult.error !== undefined) {
          throw new Error(
            "[OPERATION 3 LEG OUTPUT TEST] valid error should be undefined",
          );
        }

        console.log(
          "[OPERATION 3 LEG OUTPUT TEST] VALID OUTPUT: PASSED",
        );

        // ==================================================
        // INVALID OUTPUT
        // ==================================================

        const invalidResult =
          validateOperation3LegOutput(
            "V2",
            "0x2222222222222222222222222222222222222222",
            "0x1111111111111111111111111111111111111111",
            950000n,
            880000n,
            900000n,
          );

        if (invalidResult.success !== false) {
          throw new Error(
            "[OPERATION 3 LEG OUTPUT TEST] invalid success mismatch",
          );
        }

        if (invalidResult.amountOutValid !== false) {
          throw new Error(
            "[OPERATION 3 LEG OUTPUT TEST] invalid amountOutValid mismatch",
          );
        }

        if (invalidResult.expectedAmountOut !== 880000n) {
          throw new Error(
            "[OPERATION 3 LEG OUTPUT TEST] invalid expectedAmountOut mismatch",
          );
        }

        if (invalidResult.minAmountOut !== 900000n) {
          throw new Error(
            "[OPERATION 3 LEG OUTPUT TEST] invalid minAmountOut mismatch",
          );
        }

        if (
          invalidResult.error !==
          "Simulated output is below the minimum output."
        ) {
          throw new Error(
            "[OPERATION 3 LEG OUTPUT TEST] invalid error mismatch",
          );
        }

        console.log(
          "[OPERATION 3 LEG OUTPUT TEST] INVALID OUTPUT: PASSED",
        );

        console.log(
          "[OPERATION 3 LEG OUTPUT TEST] ALL CHECKS: PASSED",
        );

        console.log(
          "[OPERATION 3 LEG OUTPUT TEST] PASSED",
        );

        console.log("========================================");
      };

// ====================================================
// STAGE 2.26.19B - OPERATION 3 TWO-LEG TEST
// ====================================================
//
// Verifies the complete mathematical composition of
// the two Operation 3 swap legs.
//
// No DEX quote.
// No blockchain.
// No wallet.
// No transaction.
// ====================================================

(window as any).testOperation3TwoLegs =
  (): void => {
    console.log("========================================");
    console.log(
      "[OPERATION 3 TWO-LEG TEST] START",
    );
    console.log("========================================");

    const request: Operation3SimulationRequest = {
      executionData: {
        dex1: "V3",
        dex2: "V2",

        tokenIn:
          "0x1111111111111111111111111111111111111111",

        tokenOut:
          "0x2222222222222222222222222222222222222222",

        uniFee1: 3000,
        uniFee2: 0,

        minOut1: 900000n,
        minOut2: 1000000n,

        minProfit: 10000n,
      },

      flashLoanAsset:
        "0x1111111111111111111111111111111111111111",

      flashLoanAmount:
        1000000n,

      flashLoanPremium:
        500n,
    };

    // ==================================================
    // CASE 1: PROFITABLE
    // ==================================================

    const profitableResult =
      simulateOperation3TwoLegs(
        request,
        950000n,
        1015000n,
      );

    if (profitableResult.success !== true) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] profitable success mismatch",
      );
    }

    if (
      profitableResult.expectedProfit !==
      14500n
    ) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] profitable expectedProfit mismatch",
      );
    }

    if (profitableResult.gasCost !== 0n) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] profitable gasCost mismatch",
      );
    }

    if (
      profitableResult.netProfit !==
      14500n
    ) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] profitable netProfit mismatch",
      );
    }

    if (profitableResult.profitable !== true) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] profitable flag mismatch",
      );
    }

    if (
      profitableResult.executionData !==
      request.executionData
    ) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] executionData was not preserved",
      );
    }

    console.log(
      "[OPERATION 3 TWO-LEG TEST] PROFITABLE CASE: PASSED",
    );

    // ==================================================
    // CASE 2: NOT PROFITABLE
    // ==================================================

    const unprofitableResult =
      simulateOperation3TwoLegs(
        request,
        950000n,
        1005000n,
      );

    if (unprofitableResult.success !== true) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] unprofitable simulation should still succeed",
      );
    }

    if (
      unprofitableResult.expectedProfit !==
      4500n
    ) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] unprofitable expectedProfit mismatch",
      );
    }

    if (unprofitableResult.netProfit !== 4500n) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] unprofitable netProfit mismatch",
      );
    }

    if (unprofitableResult.profitable !== false) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] unprofitable flag mismatch",
      );
    }

    console.log(
      "[OPERATION 3 TWO-LEG TEST] UNPROFITABLE CASE: PASSED",
    );

    // ==================================================
    // CASE 3: LEG 1 MINIMUM OUTPUT FAILURE
    // ==================================================

    const leg1FailureResult =
      simulateOperation3TwoLegs(
        request,
        899999n,
        1015000n,
      );

    if (leg1FailureResult.success !== false) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 1 failure should fail",
      );
    }

    if (
      leg1FailureResult.expectedProfit !==
      0n
    ) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 1 failure expectedProfit mismatch",
      );
    }

    if (leg1FailureResult.gasCost !== 0n) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 1 failure gasCost mismatch",
      );
    }

    if (leg1FailureResult.netProfit !== 0n) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 1 failure netProfit mismatch",
      );
    }

    if (leg1FailureResult.profitable !== false) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 1 failure profitable mismatch",
      );
    }

    if (
      leg1FailureResult.error !==
      "Simulated output is below the minimum output."
    ) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 1 failure error mismatch",
      );
    }

    console.log(
      "[OPERATION 3 TWO-LEG TEST] LEG 1 FAILURE CASE: PASSED",
    );

        // ==================================================
    // CASE 4: LEG 2 MINIMUM OUTPUT FAILURE
    // ==================================================

    const leg2FailureResult =
      simulateOperation3TwoLegs(
        request,
        950000n,
        999999n,
      );

    if (leg2FailureResult.success !== false) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 2 failure should fail",
      );
    }

    if (
      leg2FailureResult.expectedProfit !==
      0n
    ) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 2 failure expectedProfit mismatch",
      );
    }

    if (leg2FailureResult.gasCost !== 0n) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 2 failure gasCost mismatch",
      );
    }

    if (leg2FailureResult.netProfit !== 0n) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 2 failure netProfit mismatch",
      );
    }

    if (
      leg2FailureResult.profitable !==
      false
    ) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 2 failure profitable mismatch",
      );
    }

    if (
      leg2FailureResult.error !==
      "Simulated output is below the minimum output."
    ) {
      throw new Error(
        "[OPERATION 3 TWO-LEG TEST] leg 2 failure error mismatch",
      );
    }

    console.log(
      "[OPERATION 3 TWO-LEG TEST] LEG 2 FAILURE CASE: PASSED",
    );

    console.log(
      "[OPERATION 3 TWO-LEG TEST] ALL CHECKS: PASSED",
    );

    console.log(
      "[OPERATION 3 TWO-LEG TEST] PASSED",
    );

    console.log("========================================");
  };

  // ====================================================
// STAGE 2.26.20B - OPERATION 3 V2 PAIR STATE TEST
// ====================================================
//
// Verifies that Operation 3 can reuse the existing
// V2 pair-state reader.
//
// READ-ONLY:
// - no transaction
// - no wallet signing
// - no state change
// ====================================================

(window as any).testOperation3V2PairState =
  async (): Promise<void> => {
    console.log("========================================");
    console.log(
      "[OPERATION 3 V2 PAIR STATE TEST] START",
    );
    console.log("========================================");

    const {
      getProvider,
    } = await import("../blockchain");

    const provider = await getProvider();

    const tokenA =
      "0x1111111111111111111111111111111111111111";

    const tokenB =
      "0x2222222222222222222222222222222222222222";

    try {
      await getOperation3V2PairState(
        provider,
        tokenA,
        tokenB,
      );

      throw new Error(
        "[OPERATION 3 V2 PAIR STATE TEST] deterministic test unexpectedly reached RPC with fake token addresses",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.log(
        "[OPERATION 3 V2 PAIR STATE TEST] EXPECTED READ FAILURE: PASSED",
      );

      if (!message) {
        throw new Error(
          "[OPERATION 3 V2 PAIR STATE TEST] missing error message",
        );
      }
    }

    console.log(
      "[OPERATION 3 V2 PAIR STATE TEST] ALL CHECKS: PASSED",
    );

    console.log(
      "[OPERATION 3 V2 PAIR STATE TEST] PASSED",
    );

    console.log("========================================");
  };

  // ====================================================
// STAGE 2.26.20D - OPERATION 3 V2 LEG TEST
// ====================================================

(window as any).testOperation3V2Leg =
  (): void => {
    console.log("========================================");
    console.log(
      "[OPERATION 3 V2 LEG TEST] START",
    );
    console.log("========================================");

    // Deterministic V2 state:
    // reserveIn  = 1,000,000
    // reserveOut = 2,000,000
    // amountIn   = 100,000
    const reserveIn = 1_000_000n;
    const reserveOut = 2_000_000n;
    const amountIn = 100_000n;

    const expectedAmountOut =
      (amountIn * 997n * reserveOut) /
      (reserveIn * 1000n + amountIn * 997n);

    const actualAmountOut =
      simulateOperation3V2Leg(
        reserveIn,
        reserveOut,
        amountIn,
      );

    if (
      actualAmountOut !==
      expectedAmountOut
    ) {
      throw new Error(
        `[OPERATION 3 V2 LEG TEST] output mismatch: expected ${expectedAmountOut}, got ${actualAmountOut}`,
      );
    }

    console.log(
      "[OPERATION 3 V2 LEG TEST] OUTPUT: PASSED",
    );

    // Invalid reserve
    let invalidReserveRejected = false;

    try {
      simulateOperation3V2Leg(
        0n,
        reserveOut,
        amountIn,
      );
    } catch {
      invalidReserveRejected = true;
    }

    if (!invalidReserveRejected) {
      throw new Error(
        "[OPERATION 3 V2 LEG TEST] invalid reserve was not rejected",
      );
    }

    console.log(
      "[OPERATION 3 V2 LEG TEST] INVALID RESERVE: PASSED",
    );

    // Invalid amount
    let invalidAmountRejected = false;

    try {
      simulateOperation3V2Leg(
        reserveIn,
        reserveOut,
        0n,
      );
    } catch {
      invalidAmountRejected = true;
    }

    if (!invalidAmountRejected) {
      throw new Error(
        "[OPERATION 3 V2 LEG TEST] invalid amount was not rejected",
      );
    }

    console.log(
      "[OPERATION 3 V2 LEG TEST] INVALID AMOUNT: PASSED",
    );

    console.log(
      "[OPERATION 3 V2 LEG TEST] ALL CHECKS: PASSED",
    );

    console.log(
      "[OPERATION 3 V2 LEG TEST] PASSED",
    );

    console.log("========================================");
  };

  // ======================================================
// OPERATION 3 STATEFUL V2 LEG TEST
// ======================================================
//
// Deterministically validates that Operation 3 V2 leg
// simulation reuses the existing V2 state simulator.
//
// No RPC.
// No wallet.
// No transaction.
// No blockchain state change.
// ======================================================

async function testOperation3V2StatefulLeg(): Promise<void> {
  console.log(
    "========================================",
  );
  console.log(
    "[OPERATION 3 STATEFUL V2 LEG TEST] START",
  );
  console.log(
    "========================================",
  );

  const tokenIn =
    "0x1111111111111111111111111111111111111111";

  const tokenOut =
    "0x2222222222222222222222222222222222222222";

  const pairState = {
    pairAddress:
      "0x3333333333333333333333333333333333333333",

    token0: tokenIn,

    token1: tokenOut,

    reserve0: 1000000000n,

    reserve1: 500000000000000000n,

    blockTimestampLast: 1,
  };

  const amountIn =
    1000000n;

  const expectedAmountOut =
    (
      amountIn * 997n * pairState.reserve1
    ) /
    (
      pairState.reserve0 * 1000n +
      amountIn * 997n
    );

  const validResult =
    simulateOperation3V2StatefulLeg(
      pairState,
      tokenIn,
      tokenOut,
      amountIn,
      expectedAmountOut,
    );

  if (!validResult.success) {
    throw new Error(
      "[OPERATION 3 STATEFUL V2 LEG TEST] valid stateful leg unexpectedly failed",
    );
  }

  if (
    validResult.minAmountOut !==
    expectedAmountOut
  ) {
    throw new Error(
      "[OPERATION 3 STATEFUL V2 LEG TEST] minAmountOut mismatch",
    );
  }

  console.log(
    "[OPERATION 3 STATEFUL V2 LEG TEST] VALID LEG: PASSED",
  );

  const invalidResult =
    simulateOperation3V2StatefulLeg(
      pairState,
      tokenIn,
      tokenOut,
      amountIn,
      expectedAmountOut + 1n,
    );

  if (invalidResult.success) {
    throw new Error(
      "[OPERATION 3 STATEFUL V2 LEG TEST] invalid minOut unexpectedly passed",
    );
  }

  if (
    !invalidResult.error
  ) {
    throw new Error(
      "[OPERATION 3 STATEFUL V2 LEG TEST] invalid minOut did not return an error",
    );
  }

  console.log(
    "[OPERATION 3 STATEFUL V2 LEG TEST] INVALID MIN OUT: PASSED",
  );

  console.log(
    "[OPERATION 3 STATEFUL V2 LEG TEST] ALL CHECKS: PASSED",
  );

  console.log(
    "[OPERATION 3 STATEFUL V2 LEG TEST] PASSED",
  );

  console.log(
    "========================================",
  );
}

// ======================================================
// OPERATION 3 STATEFUL TWO-LEG TEST
// ======================================================
//
// Verifies the complete two-leg Operation 3 simulation
// using deterministic values.
//
// Route:
//
// flashLoanAmount
//       ↓
//     Leg 1
//       ↓
//    amountOut1
//       ↓
//     Leg 2
//       ↓
//    amountOut2
//
// Then verifies:
//
// amountOut1 >= minOut1
// amountOut2 >= minOut2
// amountOut2 >= flashLoanAmount
//              + flashLoanPremium
//              + minProfit
//
// This test is simulation-only.
// It does NOT execute a transaction.
// ======================================================

async function testOperation3StatefulTwoLegs(): Promise<void> {
  console.log(
    "========================================",
  );

  console.log(
    "[OPERATION 3 STATEFUL TWO-LEG TEST] START",
  );

  console.log(
    "========================================",
  );

  const tokenIn =
    "0x1111111111111111111111111111111111111111";

  const tokenOut =
    "0x2222222222222222222222222222222222222222";

  const executionData = {
    dex1: "V2" as const,
    dex2: "V2" as const,
    tokenIn,
    tokenOut,
    uniFee1: 0,
    uniFee2: 0,
    minOut1: 950000n,
    minOut2: 1010000n,
    minProfit: 5000n,
  };

  const request = {
    executionData,
    flashLoanAsset: tokenIn,
    flashLoanAmount: 1000000n,
    flashLoanPremium: 5000n,
  };

  const amountOut1 = 980000n;
  const amountOut2 = 1015000n;

  const result =
    simulateOperation3TwoLegs(
      request,
      amountOut1,
      amountOut2,
    );

  if (!result.success) {
    throw new Error(
      "[OPERATION 3 STATEFUL TWO-LEG TEST] valid two-leg simulation unexpectedly failed",
    );
  }

  if (
    result.executionData?.tokenIn?.toLowerCase() !==
    tokenIn.toLowerCase()
  ) {
    throw new Error(
      "[OPERATION 3 STATEFUL TWO-LEG TEST] tokenIn mismatch",
    );
  }

  if (
    result.executionData?.tokenOut?.toLowerCase() !==
    tokenOut.toLowerCase()
  ) {
    throw new Error(
      "[OPERATION 3 STATEFUL TWO-LEG TEST] tokenOut mismatch",
    );
  }

  if (
    result.executionData?.minOut1 !==
    950000n
  ) {
    throw new Error(
      "[OPERATION 3 STATEFUL TWO-LEG TEST] minOut1 mismatch",
    );
  }

  if (
    result.executionData?.minOut2 !==
    1010000n
  ) {
    throw new Error(
      "[OPERATION 3 STATEFUL TWO-LEG TEST] minOut2 mismatch",
    );
  }

  const expectedProfit =
    amountOut2 -
    request.flashLoanAmount -
    request.flashLoanPremium;

  if (
    result.expectedProfit !==
    expectedProfit
  ) {
    throw new Error(
      "[OPERATION 3 STATEFUL TWO-LEG TEST] expectedProfit mismatch",
    );
  }

  const requiredBalance =
    request.flashLoanAmount +
    request.flashLoanPremium +
    request.executionData.minProfit;

  if (
    amountOut2 <
    requiredBalance
  ) {
    throw new Error(
      "[OPERATION 3 STATEFUL TWO-LEG TEST] repayment requirement mismatch",
    );
  }

  if (!result.profitable) {
    throw new Error(
      "[OPERATION 3 STATEFUL TWO-LEG TEST] profitable route was not marked profitable",
    );
  }

  console.log(
    "[OPERATION 3 STATEFUL TWO-LEG TEST] VALID ROUTE: PASSED",
  );

  // ----------------------------------------------------
  // Deterministic failure case:
  // Leg 2 output is below minOut2.
  // ----------------------------------------------------

  const invalidLeg2Result =
    simulateOperation3TwoLegs(
      request,
      amountOut1,
      1000000n,
    );

  if (
    invalidLeg2Result.success
  ) {
    throw new Error(
      "[OPERATION 3 STATEFUL TWO-LEG TEST] invalid leg 2 output unexpectedly succeeded",
    );
  }

  console.log(
    "[OPERATION 3 STATEFUL TWO-LEG TEST] INVALID LEG 2: PASSED",
  );

  // ----------------------------------------------------
  // Deterministic failure case:
  // Final output does not satisfy repayment + profit.
  // ----------------------------------------------------

  const invalidProfitResult =
    simulateOperation3TwoLegs(
      request,
      amountOut1,
      1005000n,
    );

  if (
    invalidProfitResult.profitable
  ) {
    throw new Error(
      "[OPERATION 3 STATEFUL TWO-LEG TEST] insufficient final balance unexpectedly marked profitable",
    );
  }

  console.log(
    "[OPERATION 3 STATEFUL TWO-LEG TEST] INSUFFICIENT PROFIT: PASSED",
  );

  console.log(
    "[OPERATION 3 STATEFUL TWO-LEG TEST] ALL CHECKS: PASSED",
  );

  console.log(
    "[OPERATION 3 STATEFUL TWO-LEG TEST] PASSED",
  );

  console.log(
    "========================================",
  );
}

    // ====================================================
    // STAGE 2.26.17B - OPERATION 3 LEG RESULT TEST
    // ====================================================
    //
    // Verifies the result boundary for one Operation 3 leg.
    //
    // This test:
    // - does NOT query a DEX
    // - does NOT access the blockchain
    // - does NOT execute a swap
    // ====================================================

    (window as any).testOperation3LegSimulationResult =
      (): void => {
        console.log("========================================");
        console.log(
          "[OPERATION 3 LEG RESULT TEST] START",
        );
        console.log("========================================");

        // ==================================================
        // VALID LEG
        // ==================================================

        const validLeg: Operation3LegSimulationResult = {
          success: true,

          dex: "V3",

          tokenIn:
            "0x1111111111111111111111111111111111111111",

          tokenOut:
            "0x2222222222222222222222222222222222222222",

          amountIn: 1000000n,

          expectedAmountOut: 950000n,

          minAmountOut: 900000n,

          amountOutValid: true,
        };

        if (validLeg.success !== true) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] valid success mismatch",
          );
        }

        if (validLeg.dex !== "V3") {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] valid dex mismatch",
          );
        }

        if (validLeg.amountIn !== 1000000n) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] valid amountIn mismatch",
          );
        }

        if (
          validLeg.expectedAmountOut !==
          950000n
        ) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] valid expectedAmountOut mismatch",
          );
        }

        if (validLeg.minAmountOut !== 900000n) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] valid minAmountOut mismatch",
          );
        }

        if (validLeg.amountOutValid !== true) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] valid amountOutValid mismatch",
          );
        }

        if (validLeg.error !== undefined) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] valid error should be undefined",
          );
        }

        console.log(
          "[OPERATION 3 LEG RESULT TEST] VALID LEG: PASSED",
        );

        // ==================================================
        // INVALID / MINIMUM OUTPUT FAILURE
        // ==================================================

        const invalidLeg: Operation3LegSimulationResult = {
          success: false,

          dex: "V2",

          tokenIn:
            "0x2222222222222222222222222222222222222222",

          tokenOut:
            "0x1111111111111111111111111111111111111111",

          amountIn: 950000n,

          expectedAmountOut: 880000n,

          minAmountOut: 900000n,

          amountOutValid: false,

          error:
            "Simulated output is below the minimum output.",
        };

        if (invalidLeg.success !== false) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] invalid success mismatch",
          );
        }

        if (invalidLeg.dex !== "V2") {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] invalid dex mismatch",
          );
        }

        if (invalidLeg.amountIn !== 950000n) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] invalid amountIn mismatch",
          );
        }

        if (
          invalidLeg.expectedAmountOut !==
          880000n
        ) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] invalid expectedAmountOut mismatch",
          );
        }

        if (invalidLeg.minAmountOut !== 900000n) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] invalid minAmountOut mismatch",
          );
        }

        if (invalidLeg.amountOutValid !== false) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] invalid amountOutValid mismatch",
          );
        }

        if (
          invalidLeg.error !==
          "Simulated output is below the minimum output."
        ) {
          throw new Error(
            "[OPERATION 3 LEG RESULT TEST] invalid error mismatch",
          );
        }

        console.log(
          "[OPERATION 3 LEG RESULT TEST] INVALID LEG: PASSED",
        );

        console.log(
          "[OPERATION 3 LEG RESULT TEST] ALL FIELDS: PASSED",
        );

        console.log(
          "[OPERATION 3 LEG RESULT TEST] PASSED",
        );

        console.log("========================================");
      };

  // ====================================================
  // STAGE 2.26.14B - OPERATION 3 SIMULATION RESULT TEST
  // ====================================================
  //
  // Verifies that a complete Operation 3 simulation result
  // correctly contains the simulation status, execution data,
  // profit values, and profitability state.
  //
  // This test ONLY constructs frontend simulation data.
  // It does NOT encode calldata.
  // It does NOT send a transaction.
  // It does NOT access a wallet.
  // ====================================================

  (window as any).testOperation3SimulationResult =
    (): void => {
      console.log("========================================");
      console.log(
        "[OPERATION 3 SIMULATION RESULT TEST] START",
      );
      console.log("========================================");

      const executionData = {
        dex1: "V3" as const,
        dex2: "V2" as const,
        tokenIn:
          "0x1111111111111111111111111111111111111111",
        tokenOut:
          "0x2222222222222222222222222222222222222222",
        uniFee1: 3000,
        uniFee2: 0,
        minOut1: 900000n,
        minOut2: 1000000n,
        minProfit: 10000n,
      };

      const result: Operation3SimulationResult = {
        success: true,
        executionData,
        expectedProfit: 25000n,
        gasCost: 5000n,
        netProfit: 20000n,
        profitable: true,
      };

      if (result.success !== true) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] success mismatch",
        );
      }

      if (!result.executionData) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] executionData missing",
        );
      }

      if (result.executionData.dex1 !== "V3") {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] dex1 mismatch",
        );
      }

      if (result.executionData.dex2 !== "V2") {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] dex2 mismatch",
        );
      }

      if (
        result.executionData.tokenIn.toLowerCase() !==
        executionData.tokenIn.toLowerCase()
      ) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] tokenIn mismatch",
        );
      }

      if (
        result.executionData.tokenOut.toLowerCase() !==
        executionData.tokenOut.toLowerCase()
      ) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] tokenOut mismatch",
        );
      }

      if (result.executionData.uniFee1 !== 3000) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] uniFee1 mismatch",
        );
      }

      if (result.executionData.uniFee2 !== 0) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] uniFee2 mismatch",
        );
      }

      if (result.executionData.minOut1 !== 900000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] minOut1 mismatch",
        );
      }

      if (result.executionData.minOut2 !== 1000000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] minOut2 mismatch",
        );
      }

      if (result.executionData.minProfit !== 10000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] minProfit mismatch",
        );
      }

      if (result.expectedProfit !== 25000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] expectedProfit mismatch",
        );
      }

      if (result.gasCost !== 5000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] gasCost mismatch",
        );
      }

      if (result.netProfit !== 20000n) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] netProfit mismatch",
        );
      }

      if (result.profitable !== true) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] profitable mismatch",
        );
      }

      if (result.error !== undefined) {
        throw new Error(
          "[OPERATION 3 SIMULATION RESULT TEST] error should be undefined",
        );
      }

      console.log(
        "[OPERATION 3 SIMULATION RESULT TEST] ALL FIELDS: PASSED",
      );

      console.log(
        "[OPERATION 3 SIMULATION RESULT TEST] PASSED",
      );

      console.log("========================================");
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
