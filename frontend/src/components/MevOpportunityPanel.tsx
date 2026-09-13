import {
  useEffect,
  useState,
} from "react";

import {
  mevOpportunityStore,
} from "../services/mev/mevOpportunityStore";

import type {
  MevOpportunitySnapshot,
} from "../services/mev/mevOpportunityStore";

import {
  paperExecutionStore,
} from "../services/mev/paperExecutionStore";

import {
  PaperExecutionService,
} from "../services/mev/paperExecution";

// ======================================================
// MEV OPPORTUNITY PANEL
// ======================================================
//
// Phase 2 MEV opportunity display.
//
// IMPORTANT:
//
// - Read-only MEV detection/simulation
// - No wallet interaction
// - No blockchain transaction
// - Paper execution requires explicit user action
// - Displays the latest opportunity published by
//   MevOpportunityStore
// - Prevents duplicate paper execution attempts
// ======================================================

export default function MevOpportunityPanel() {
  const [state, setState] =
    useState<MevOpportunitySnapshot | null>(
      mevOpportunityStore.getState(),
    );

  const [
    paperExecutions,
    setPaperExecutions,
  ] = useState(
    paperExecutionStore.getAll(),
  );

  const [
    paperExecutionMessage,
    setPaperExecutionMessage,
  ] = useState<string | null>(null);

  const [
    paperExecutionError,
    setPaperExecutionError,
  ] = useState<string | null>(null);

  // ====================================================
  // STORE SUBSCRIPTIONS
  // ====================================================

  useEffect(() => {
    const handleMevOpportunityUpdate =
      (): void => {
        setState(
          mevOpportunityStore.getState(),
        );

        // Clear the previous action message when
        // a new MEV opportunity arrives.
        setPaperExecutionMessage(null);
        setPaperExecutionError(null);
      };

    const handlePaperExecutionUpdate =
      (): void => {
        setPaperExecutions(
          paperExecutionStore.getAll(),
        );
      };

    handleMevOpportunityUpdate();
    handlePaperExecutionUpdate();

    const unsubscribeMevOpportunity =
      mevOpportunityStore.subscribe(
        handleMevOpportunityUpdate,
      );

    const unsubscribePaperExecution =
      paperExecutionStore.subscribe(
        handlePaperExecutionUpdate,
      );

    return () => {
      unsubscribeMevOpportunity();
      unsubscribePaperExecution();
    };
  }, []);

  // ====================================================
  // EMPTY STATE
  // ====================================================

  if (!state) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-400">
              MEV PAPER MODE
            </p>

            <h2 className="mt-1 text-2xl font-bold text-white">
              MEV Opportunity
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              No MEV opportunity is currently available.
            </p>
          </div>

          <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-400">
            PAPER ONLY
          </span>
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-5">
          <p className="text-sm text-slate-400">
            The Phase 2 MEV pipeline is waiting for a
            detected candidate and completed simulation.
          </p>
        </div>
      </section>
    );
  }

  const {
  candidate,
  simulation,
  updatedAt,
  freshness,
} = state;

  // ====================================================
  // PROFITABILITY GATE
  // ====================================================
  //
  // Paper execution is available only when:
  //
  // 1. Simulation succeeded
  // 2. Simulation marked the opportunity profitable
  // 3. Net profit is strictly positive
  // 4. Opportunity is still FRESH
  //
  // The PaperExecutionService performs the same
  // validation again before storing the plan.
  // ====================================================

  const isProfitable =
    simulation.success &&
    simulation.profitable &&
    simulation.netProfit > 0n;

  // ====================================================
  // DUPLICATE PAPER EXECUTION GATE
  // ====================================================
  //
  // A trigger transaction can only have one paper
  // execution record during the current browser session.
  //
  // The PaperExecutionService also enforces this rule.
  // This UI check prevents the user from attempting
  // the duplicate action in the first place.
  // ====================================================

  const hasPaperExecution =
    paperExecutions.some(
      (execution) =>
        execution.triggerTransactionHash.toLowerCase() ===
        candidate.triggerTransactionHash.toLowerCase(),
    );

  const isFresh =
    freshness === "FRESH";

  const canPaperExecute =
    isProfitable &&
    freshness === "FRESH" &&
    !hasPaperExecution;
    
  const netProfit =
    simulation.netProfit.toString();

  const expectedProfit =
    simulation.expectedProfit.toString();

  const gasCost =
    simulation.gasCost.toString();

  const amountIn =
    candidate.amountIn !== undefined
      ? candidate.amountIn.toString()
      : "—";

  const expectedAmountOut =
    candidate.expectedAmountOut !== undefined
      ? candidate.expectedAmountOut.toString()
      : "—";

  const updatedTime =
    new Date(updatedAt).toLocaleTimeString();

  // ====================================================
  // PAPER EXECUTION
  // ====================================================
  //
  // This creates an in-memory paper execution record.
  //
  // IMPORTANT:
  //
  // - No wallet
  // - No signature
  // - No contract write
  // - No blockchain transaction
  // - No blockchain state modification
  // ====================================================

  const handlePaperExecution = (): void => {
  setPaperExecutionMessage(null);
  setPaperExecutionError(null);

  // ==================================================
  // UI DUPLICATE GUARD
  // ==================================================
  //
  // Prevent another paper execution attempt for the
  // same trigger transaction during this session.
  //
  // The service performs the authoritative duplicate
  // validation again.
  // ==================================================

  if (hasPaperExecution) {
    setPaperExecutionError(
      "Paper execution has already been recorded for this trigger transaction.",
    );

    return;
  }

  // ==================================================
  // FRESHNESS GUARD
  // ==================================================
  //
  // A paper execution is allowed only while the
  // opportunity is tied to the current block state.
  //
  // Once a newer block arrives, the opportunity is
  // stale and must not be paper executed.
  // ==================================================

  if (freshness !== "FRESH") {
    setPaperExecutionError(
      "Paper execution is blocked because this opportunity is stale.",
    );

    return;
  }

  if (!isProfitable) {
    setPaperExecutionError(
      "Paper execution is blocked because the simulation is not profitable.",
    );

    return;
  }

  const paperExecutionService =
    new PaperExecutionService();

  const result =
    paperExecutionService.createPlan(
      candidate,
      simulation,
    );

  if (!result.success || !result.plan) {
    setPaperExecutionError(
      result.error ??
        "Paper execution could not be created.",
    );

    console.error(
      "[MEV OPPORTUNITY PANEL] " +
        "Paper execution rejected:",
      result.error,
    );

    return;
  }

  setPaperExecutionMessage(
    `Paper execution recorded: ${result.plan.paperExecutionId}`,
  );

  console.log(
    "[MEV OPPORTUNITY PANEL] " +
      "Paper execution recorded:",
    result.plan,
  );
};

  // ====================================================
  // OPPORTUNITY DISPLAY
  // ====================================================

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/10">
      {/* ------------------------------------------------
          Header
      ------------------------------------------------ */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-400">
            MEV PAPER MODE
          </p>

          <h2 className="mt-1 text-2xl font-bold text-white">
            MEV Opportunity
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Latest detected backrun candidate and
            read-only simulation result.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div
            className={[
              "inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold",
              isProfitable
                ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border border-red-500/20 bg-red-500/10 text-red-400",
            ].join(" ")}
          >
            <span
              className={[
                "h-2 w-2 rounded-full",
                isProfitable
                  ? "bg-emerald-400"
                  : "bg-red-400",
              ].join(" ")}
            />

            {isProfitable
              ? "PROFITABLE"
              : "NOT PROFITABLE"}
          </div>

          <div
            className={[
              "inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold",
              isFresh
                ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border border-amber-500/20 bg-amber-500/10 text-amber-400",
            ].join(" ")}
          >
            <span
              className={[
                "h-2 w-2 rounded-full",
                isFresh
                  ? "bg-emerald-400"
                  : "bg-amber-400",
              ].join(" ")}
            />

            {isFresh ? "FRESH" : "STALE"}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------
          Candidate Information
      ------------------------------------------------ */}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Trigger Block
          </p>

          <p className="mt-2 text-lg font-semibold text-white">
            {candidate.blockNumber}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Amount In
          </p>

          <p className="mt-2 break-all text-lg font-semibold text-white">
            {amountIn}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Expected Out
          </p>

          <p className="mt-2 break-all text-lg font-semibold text-white">
            {expectedAmountOut}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Updated
          </p>

          <p className="mt-2 text-lg font-semibold text-white">
            {updatedTime}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------
          Route
      ------------------------------------------------ */}

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-5">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Route
        </p>

        <p className="mt-2 break-all text-sm font-semibold text-white">
          {candidate.tokenIn ?? "Unknown"}

          <span className="mx-2 text-slate-500">
            →
          </span>

          {candidate.tokenOut ?? "Unknown"}
        </p>

        <p className="mt-3 text-sm text-slate-400">
          {candidate.description}
        </p>
      </div>

      {/* ------------------------------------------------
          Trigger Transaction
      ------------------------------------------------ */}

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-5">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Trigger Transaction
        </p>

        <p className="mt-2 break-all font-mono text-xs text-slate-300">
          {candidate.triggerTransactionHash}
        </p>
      </div>

      {/* ------------------------------------------------
          Simulation Result
      ------------------------------------------------ */}

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Backrun Simulation
            </p>

            <h3 className="mt-1 text-lg font-semibold text-white">
              Profit Analysis
            </h3>
          </div>

          <span
            className={[
              "rounded-lg px-3 py-2 text-xs font-semibold",
              simulation.success
                ? "border border-slate-700 bg-slate-800/60 text-slate-300"
                : "border border-red-500/20 bg-red-500/10 text-red-400",
            ].join(" ")}
          >
            {simulation.success
              ? "SIMULATED"
              : "SIMULATION FAILED"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Expected Profit
            </p>

            <p className="mt-2 break-all text-lg font-semibold text-white">
              {expectedProfit}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Gas Cost
            </p>

            <p className="mt-2 break-all text-lg font-semibold text-white">
              {gasCost}
            </p>
          </div>

          <div
            className={[
              "rounded-xl border p-5",
              isProfitable
                ? "border-emerald-500/20 bg-emerald-500/10"
                : "border-red-500/20 bg-red-500/10",
            ].join(" ")}
          >
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Net Profit
            </p>

            <p
              className={[
                "mt-2 break-all text-lg font-semibold",
                isProfitable
                  ? "text-emerald-400"
                  : "text-red-400",
              ].join(" ")}
            >
              {netProfit}
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------
          Paper Execution Action
      ------------------------------------------------ */}

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Paper Execution
            </p>

            <p className="mt-1 text-sm text-slate-400">
              {hasPaperExecution
                ? "This trigger transaction has already been recorded in paper mode."
                : !isFresh
                  ? "This opportunity is stale because a newer block has arrived."
                  : "Create a hypothetical execution record from this completed simulation."}
            </p>
          </div>

          <button
            type="button"
            onClick={handlePaperExecution}
            disabled={!canPaperExecute}
            className={[
              "rounded-xl px-5 py-3 text-sm font-semibold transition",
              canPaperExecute
                ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                : "cursor-not-allowed bg-slate-700 text-slate-400 opacity-70",
            ].join(" ")}
          >
            {hasPaperExecution
              ? "Already Paper Executed"
              : !isFresh
                ? "Paper Execute Blocked (Stale)"
                : isProfitable
                  ? "Paper Execute"
                  : "Paper Execute Blocked"}
          </button>
        </div>

        {paperExecutionMessage && (
          <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
            <p className="text-sm text-emerald-400">
              {paperExecutionMessage}
            </p>
          </div>
        )}

        {paperExecutionError && (
          <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <p className="text-sm text-red-400">
              {paperExecutionError}
            </p>
          </div>
        )}
      </div>

      {/* ------------------------------------------------
          Safety / Paper Mode Notice
      ------------------------------------------------ */}

      <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-amber-400">
            ●
          </span>

          <div>
            <p className="text-sm font-semibold text-amber-300">
              PAPER EXECUTION MODE
            </p>

            <p className="mt-1 text-sm leading-6 text-slate-400">
              Paper execution creates an in-memory hypothetical
              execution record only. No wallet transaction is
              submitted and no blockchain state is modified.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}