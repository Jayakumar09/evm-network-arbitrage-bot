import type {
  BackrunCandidate,
  BackrunSimulationResult,
} from "../../types/mev";


// ======================================================
// MEV OPPORTUNITY SNAPSHOT
// ======================================================
//
// Represents the latest candidate + simulation pair
// published by the Phase 2 MEV pipeline.
//
// IMPORTANT:
//
// This store is:
// - in-memory only
// - browser-session only
// - read-only with respect to blockchain state
// - NOT an execution engine
//
// No wallet interaction.
// No transaction submission.
// ======================================================

export type MevOpportunityFreshness =
  "FRESH" | "STALE";

export interface MevOpportunitySnapshot {
  candidate: BackrunCandidate;
  simulation: BackrunSimulationResult;
  updatedAt: number;
  freshness: MevOpportunityFreshness;
}

// ======================================================
// MEV OPPORTUNITY STATE
// ======================================================
//
// Compatibility alias used by the Phase 2 opportunity UI.
// The store snapshot is the current opportunity state.
// ======================================================

export type MevOpportunityState =
  MevOpportunitySnapshot;

// ======================================================
// STORE LISTENER
// ======================================================

type MevOpportunityStoreListener =
  () => void;

// ======================================================
// MEV OPPORTUNITY STORE
// ======================================================

export class MevOpportunityStore {
  private snapshot:
    MevOpportunitySnapshot | null = null;

  private listeners:
    MevOpportunityStoreListener[] = [];

  // ====================================================
  // SET LATEST OPPORTUNITY
  // ====================================================

  setOpportunity(
      candidate: BackrunCandidate,
      simulation: BackrunSimulationResult,
    ): void {
      this.snapshot = {
        candidate,
        simulation,
        updatedAt: Date.now(),
        freshness: "FRESH",
      };

      console.log(
        "[MEV OPPORTUNITY STORE] " +
          "Latest opportunity updated:",
        this.snapshot,
      );

      this.notifyListeners();
    }

  // ====================================================
  // MARK CURRENT OPPORTUNITY STALE
  // ====================================================
  //
  // An opportunity is tied to the block in which its
  // trigger transaction was observed. Once a newer block
  // arrives, the existing opportunity is no longer fresh.
  //
  // This does not clear the opportunity and does not
  // re-simulate it.
  // ====================================================

  markStale(
    newerBlockNumber: number,
  ): void {
    if (!this.snapshot) {
      return;
    }

    if (
      newerBlockNumber <=
      this.snapshot.candidate.blockNumber
    ) {
      return;
    }

    if (
      this.snapshot.freshness ===
      "STALE"
    ) {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      freshness: "STALE",
    };

    console.log(
      "[MEV OPPORTUNITY STORE] " +
        "Latest opportunity marked stale:",
      {
        opportunityBlock:
          this.snapshot.candidate.blockNumber,
        newerBlockNumber,
        triggerTransactionHash:
          this.snapshot.candidate
            .triggerTransactionHash,
      },
    );

    this.notifyListeners();
  }

  // ====================================================
  // GET CURRENT OPPORTUNITY STATE
  // ====================================================

  getState():
    MevOpportunityState | null {
    return this.snapshot;
  }

  // ====================================================
  // GET LATEST OPPORTUNITY
  // ====================================================

  getLatest():
    MevOpportunitySnapshot | null {
    return this.snapshot;
  }

  // ====================================================
  // CLEAR LATEST OPPORTUNITY
  // ====================================================

  clear(): void {
    this.snapshot = null;

    console.log(
      "[MEV OPPORTUNITY STORE] " +
        "Latest opportunity cleared.",
    );

    this.notifyListeners();
  }

  // ====================================================
  // SUBSCRIBE
  // ====================================================

  subscribe(
    listener: MevOpportunityStoreListener,
  ): () => void {
    this.listeners.push(listener);

    return () => {
      this.listeners =
        this.listeners.filter(
          (currentListener) =>
            currentListener !== listener,
        );
    };
  }

  // ====================================================
  // NOTIFY LISTENERS
  // ====================================================

  private notifyListeners(): void {
    for (
      const listener of this.listeners
    ) {
      listener();
    }
  }
}

// ======================================================
// SHARED STORE INSTANCE
// ======================================================

export const mevOpportunityStore =
  new MevOpportunityStore();