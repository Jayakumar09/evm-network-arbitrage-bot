import {
  AbiCoder,
} from "ethers";

import { BlockMonitor } from "./blockMonitor";
import { TransactionMonitor } from "./transactionMonitor";
import { OpportunityDetector } from "./opportunityDetector";
import { BackrunSimulator } from "./backrunSimulator";
import {
  quoteMevV2Candidate,
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
  MevGasEstimator,
} from "./mevGasEstimator";

import {
  PaperExecutionService,
} from "./paperExecution";

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

                    if (
                      !simulation.success
                    ) {
                      console.error(
                        "[MEV PIPELINE TEST] " +
                          "SIMULATION FAILED:",
                        simulation.error,
                      );

                      return;
                    }

                    console.log(
                      "[MEV PIPELINE TEST] " +
                        (
                          simulation.profitable
                            ? "SIMULATION PROFITABLE"
                            : "SIMULATION NOT PROFITABLE"
                        ),
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

                        console.log(
                          "[MEV PIPELINE TEST] " +
                            "BLOCK -> TRANSACTION MONITOR:",
                          block.number,
                        );

                        await devPipelineMonitor.processBlockNumber(
                          block.number,
                        );
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

         const gasEstimator =
            new MevGasEstimator(
              provider,
              {
                estimatedGasUnits:
                  300000n,

                profitToken:
                  SEPOLIA_USDC,

                wrappedNativeToken:
                  SEPOLIA_WETH,
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
          * Independently estimate the gas cost.
          *
          * This verifies that BackrunSimulator is using
          * the gas estimator rather than silently assuming
          * zero gas cost.
          */
          const gasEstimate =
            await gasEstimator.estimate();

          if (
            !gasEstimate.success
          ) {
            throw new Error(
              gasEstimate.error ??
                "Independent gas estimation failed.",
            );
          }

          const expectedGasCost =
            gasEstimate.gasCostProfitToken;

          if (
            simulation.gasCost !==
            expectedGasCost
          ) {
            throw new Error(
              "BackrunSimulator gas cost does not match independent gas estimation.",
            );
          }

          const expectedNetProfit =
            expectedGrossProfit -
            expectedGasCost;

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
            expectedGasCost.toString(),
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

        // --------------------------------------------------
        // Negative-profit rejection
        // --------------------------------------------------

        const rejectedPaperExecution =
          paperExecutionService.createPlan(
            candidate,
            simulation,
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
          storedPaperExecutionCount !== 1
        ) {
          throw new Error(
            "Paper execution store count is incorrect after accepted execution.",
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
          paperPlan.paperExecutionId
        ) {
          throw new Error(
            "Paper execution store latest plan ID mismatch.",
          );
        }

        if (
          latestPaperExecution.triggerTransactionHash !==
          paperPlan.triggerTransactionHash
        ) {
          throw new Error(
            "Paper execution store latest trigger hash mismatch.",
          );
        }

        const allPaperExecutions =
          paperExecutionService.getAll();

        if (
          allPaperExecutions.length !== 1
        ) {
          throw new Error(
            "Paper execution store history length is incorrect.",
          );
        }

        if (
          allPaperExecutions[0].paperExecutionId !==
          paperPlan.paperExecutionId
        ) {
          throw new Error(
            "Paper execution store history plan mismatch.",
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
          countAfterRejectedExecution !== 1
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
}