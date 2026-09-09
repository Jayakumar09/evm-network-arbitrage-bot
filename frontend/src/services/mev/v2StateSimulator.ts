import type { V2PairState } from "./v2PairState";

export interface V2SwapSimulationResult {
  tokenIn: string;
  tokenOut: string;

  amountIn: bigint;
  amountOut: bigint;

  newReserve0: bigint;
  newReserve1: bigint;
}

function calculateAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): bigint {
  if (amountIn <= 0n) {
    throw new Error(
      "amountIn must be greater than zero",
    );
  }

  if (
    reserveIn <= 0n ||
    reserveOut <= 0n
  ) {
    throw new Error(
      "V2 reserves must be greater than zero",
    );
  }

  const amountInWithFee =
    amountIn * 997n;

  const numerator =
    amountInWithFee * reserveOut;

  const denominator =
    reserveIn * 1000n +
    amountInWithFee;

  if (denominator <= 0n) {
    throw new Error(
      "Invalid V2 swap denominator",
    );
  }

  const amountOut =
    numerator / denominator;

  if (amountOut <= 0n) {
    throw new Error(
      "V2 swap amountOut is zero",
    );
  }

  if (amountOut >= reserveOut) {
    throw new Error(
      "V2 swap amountOut exceeds available liquidity",
    );
  }

  return amountOut;
}

/**
 * Validate that the supplied pair state has a
 * consistent token0/token1/reserve configuration.
 */
function validatePairState(
  pairState: V2PairState,
): void {
  if (!pairState.token0) {
    throw new Error(
      "V2 pair token0 is required",
    );
  }

  if (!pairState.token1) {
    throw new Error(
      "V2 pair token1 is required",
    );
  }

  if (
    pairState.token0.toLowerCase() ===
    pairState.token1.toLowerCase()
  ) {
    throw new Error(
      "V2 pair token0 and token1 must be different",
    );
  }

  if (
    pairState.reserve0 <= 0n ||
    pairState.reserve1 <= 0n
  ) {
    throw new Error(
      "V2 pair reserves must be greater than zero",
    );
  }
}

/**
 * Simulate a single V2 swap against a supplied
 * pair state.
 *
 * READ-ONLY mathematical simulation:
 * no RPC transaction and no blockchain state change.
 */
export function simulateV2Swap(
  pairState: V2PairState,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): V2SwapSimulationResult {
  if (!tokenIn || !tokenOut) {
    throw new Error(
      "tokenIn and tokenOut are required",
    );
  }

  if (
    tokenIn.toLowerCase() ===
    tokenOut.toLowerCase()
  ) {
    throw new Error(
      "tokenIn and tokenOut must be different",
    );
  }

  if (amountIn <= 0n) {
    throw new Error(
      "amountIn must be greater than zero",
    );
  }

  validatePairState(pairState);

  const normalizedTokenIn =
    tokenIn.toLowerCase();

  const normalizedTokenOut =
    tokenOut.toLowerCase();

  const normalizedToken0 =
    pairState.token0.toLowerCase();

  const normalizedToken1 =
    pairState.token1.toLowerCase();

  const tokenInIsToken0 =
    normalizedTokenIn ===
    normalizedToken0;

  const tokenInIsToken1 =
    normalizedTokenIn ===
    normalizedToken1;

  const tokenOutIsToken0 =
    normalizedTokenOut ===
    normalizedToken0;

  const tokenOutIsToken1 =
    normalizedTokenOut ===
    normalizedToken1;

  let reserveIn: bigint;
  let reserveOut: bigint;

  if (
    tokenInIsToken0 &&
    tokenOutIsToken1
  ) {
    reserveIn =
      pairState.reserve0;

    reserveOut =
      pairState.reserve1;
  } else if (
    tokenInIsToken1 &&
    tokenOutIsToken0
  ) {
    reserveIn =
      pairState.reserve1;

    reserveOut =
      pairState.reserve0;
  } else {
    throw new Error(
      "tokenIn/tokenOut do not match the V2 pair",
    );
  }

  const amountOut =
    calculateAmountOut(
      amountIn,
      reserveIn,
      reserveOut,
    );

  let newReserve0: bigint;
  let newReserve1: bigint;

  if (tokenInIsToken0) {
    newReserve0 =
      pairState.reserve0 +
      amountIn;

    newReserve1 =
      pairState.reserve1 -
      amountOut;
  } else {
    newReserve0 =
      pairState.reserve0 -
      amountOut;

    newReserve1 =
      pairState.reserve1 +
      amountIn;
  }

  if (
    newReserve0 <= 0n ||
    newReserve1 <= 0n
  ) {
    throw new Error(
      "Simulated V2 reserves became invalid",
    );
  }

  return {
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    newReserve0,
    newReserve1,
  };
}

/**
 * DEV tests against the known Sepolia
 * USDC/WETH V2 pair.
 */
if (import.meta.env.DEV) {
  (window as any).testMevV2StateSimulator =
    async () => {
      console.log(
        "[MEV V2 STATE SIMULATOR TEST] Starting",
      );

      const {
        getProvider,
      } = await import("../blockchain");

      const {
        getV2PairState,
      } = await import("./v2PairState");

      const provider =
        await getProvider();

      const usdc =
        "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

      const weth =
        "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";

      const pairState =
        await getV2PairState(
          provider,
          usdc,
          weth,
        );

      console.log(
        "[MEV V2 STATE SIMULATOR TEST] Current reserves:",
        {
          reserve0:
            pairState.reserve0.toString(),

          reserve1:
            pairState.reserve1.toString(),
        },
      );

      /*
       * --------------------------------------------------
       * TEST 1
       *
       * USDC -> WETH
       * --------------------------------------------------
       */
      const usdcAmountIn =
        1000000n;

      const usdcToWeth =
        simulateV2Swap(
          pairState,
          usdc,
          weth,
          usdcAmountIn,
        );

      console.log(
        "[MEV V2 STATE SIMULATOR TEST] USDC -> WETH:",
        {
          amountIn:
            usdcToWeth.amountIn.toString(),

          amountOut:
            usdcToWeth.amountOut.toString(),

          newReserve0:
            usdcToWeth.newReserve0.toString(),

          newReserve1:
            usdcToWeth.newReserve1.toString(),
        },
      );

      if (
        usdcToWeth.amountOut <= 0n
      ) {
        throw new Error(
          "USDC -> WETH amountOut must be greater than zero",
        );
      }

      if (
        usdcToWeth.newReserve0 !==
        pairState.reserve0 +
          usdcAmountIn
      ) {
        throw new Error(
          "USDC -> WETH reserve0 transition is incorrect",
        );
      }

      if (
        usdcToWeth.newReserve1 !==
        pairState.reserve1 -
          usdcToWeth.amountOut
      ) {
        throw new Error(
          "USDC -> WETH reserve1 transition is incorrect",
        );
      }

      /*
       * --------------------------------------------------
       * TEST 2
       *
       * WETH -> USDC
       *
       * This validates the opposite reserve direction.
       * --------------------------------------------------
       */
      const wethAmountIn =
        1000000000n;

      const wethToUsdc =
        simulateV2Swap(
          pairState,
          weth,
          usdc,
          wethAmountIn,
        );

      console.log(
        "[MEV V2 STATE SIMULATOR TEST] WETH -> USDC:",
        {
          amountIn:
            wethToUsdc.amountIn.toString(),

          amountOut:
            wethToUsdc.amountOut.toString(),

          newReserve0:
            wethToUsdc.newReserve0.toString(),

          newReserve1:
            wethToUsdc.newReserve1.toString(),
        },
      );

      if (
        wethToUsdc.amountOut <= 0n
      ) {
        throw new Error(
          "WETH -> USDC amountOut must be greater than zero",
        );
      }

      if (
        wethToUsdc.newReserve0 !==
        pairState.reserve0 -
          wethToUsdc.amountOut
      ) {
        throw new Error(
          "WETH -> USDC reserve0 transition is incorrect",
        );
      }

      if (
        wethToUsdc.newReserve1 !==
        pairState.reserve1 +
          wethAmountIn
      ) {
        throw new Error(
          "WETH -> USDC reserve1 transition is incorrect",
        );
      }

      /*
       * --------------------------------------------------
       * TEST 3
       *
       * Invalid token pair must be rejected.
       * --------------------------------------------------
       */
      let invalidPairRejected =
        false;

      try {
        simulateV2Swap(
          pairState,
          "0x1111111111111111111111111111111111111111",
          weth,
          1000000n,
        );
      } catch {
        invalidPairRejected = true;
      }

      if (!invalidPairRejected) {
        throw new Error(
          "Invalid token pair was not rejected",
        );
      }

      console.log(
        "[MEV V2 STATE SIMULATOR TEST] Invalid pair rejection PASSED",
      );

      /*
       * --------------------------------------------------
       * TEST 4
       *
       * Zero input must be rejected.
       * --------------------------------------------------
       */
      let zeroAmountRejected =
        false;

      try {
        simulateV2Swap(
          pairState,
          usdc,
          weth,
          0n,
        );
      } catch {
        zeroAmountRejected = true;
      }

      if (!zeroAmountRejected) {
        throw new Error(
          "Zero amount was not rejected",
        );
      }

      console.log(
        "[MEV V2 STATE SIMULATOR TEST] Zero amount rejection PASSED",
      );

      console.log(
        "[MEV V2 STATE SIMULATOR TEST] PASSED",
      );

      return {
        pairState,
        usdcToWeth,
        wethToUsdc,
      };
    };
}