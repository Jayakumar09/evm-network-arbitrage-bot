import type {
  PaperExecutionPlan,
} from "../../types/mev";

type PaperExecutionStoreListener =
  () => void;

// ======================================================
// PAPER EXECUTION STORE
// ======================================================
//
// Phase 2 MEV development only.
//
// IMPORTANT:
//
// This store is:
// - in-memory only
// - read-only with respect to the blockchain
// - for paper execution plans only
//
// It NEVER:
// - connects a wallet
// - requests a signature
// - sends a transaction
// - calls a write contract method
// - modifies blockchain state
//
// The store only keeps successful paper execution
// plans for the current browser session.
// ======================================================

export class PaperExecutionStore {
  private plans: PaperExecutionPlan[] = [];

  private listeners:
    PaperExecutionStoreListener[] = [];

    // ====================================================
    // ADD PAPER EXECUTION PLAN
    // ====================================================

    add(
      plan: PaperExecutionPlan,
    ): void {
      if (!plan.paperOnly) {
        throw new Error(
          "Paper execution store accepts paper-only plans.",
        );
      }

      const recordedPlan: PaperExecutionPlan = {
        ...plan,
        state:
          "PAPER_RECORDED",
      };

      this.plans.push(
        recordedPlan,
      );

      console.log(
        "[MEV PAPER EXECUTION STORE] " +
          "Paper execution plan stored:",
        recordedPlan,
      );

      this.notifyListeners();
    }

  // ====================================================
  // GET ALL PAPER EXECUTION PLANS
  // ====================================================

  getAll(): PaperExecutionPlan[] {
    return [
      ...this.plans,
    ];
  }

  // ====================================================
  // GET LATEST PAPER EXECUTION PLAN
  // ====================================================

  getLatest():
    PaperExecutionPlan | null {
    if (
      this.plans.length === 0
    ) {
      return null;
    }

    return this.plans[
      this.plans.length - 1
    ];
  }

  // ====================================================
  // GET PAPER EXECUTION COUNT
  // ====================================================

  getCount(): number {
    return this.plans.length;
  }

  // ====================================================
  // SUBSCRIBE TO PAPER EXECUTION UPDATES
  // ====================================================

  subscribe(
    listener: PaperExecutionStoreListener,
  ): () => void {
    this.listeners.push(
      listener,
    );

    return () => {
      this.listeners =
        this.listeners.filter(
          (currentListener) =>
            currentListener !== listener,
        );
    };
  }

  // ====================================================
  // NOTIFY PAPER EXECUTION LISTENERS
  // ====================================================

  private notifyListeners(): void {
    for (
      const listener of this.listeners
    ) {
      listener();
    }
  }

  // ====================================================
  // CLEAR PAPER EXECUTION HISTORY
  // ====================================================

  clear(): void {
    this.plans = [];

    console.log(
      "[MEV PAPER EXECUTION STORE] " +
        "Paper execution history cleared.",
    );

    this.notifyListeners();
  }
}

// ======================================================
// SHARED PAPER EXECUTION STORE
// ======================================================
//
// A single in-memory store is shared by the Paper
// Execution service and Paper Execution UI during the
// current browser session.
//
// This does NOT persist data to localStorage and does
// NOT interact with the blockchain.
// ======================================================

export const paperExecutionStore =
  new PaperExecutionStore();