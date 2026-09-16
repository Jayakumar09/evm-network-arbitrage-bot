import {
  Contract,
  type Provider,
} from "ethers";

import {
  CurrencyAmount,
  Token,
} from "@uniswap/sdk-core";

import {
  FeeAmount,
  Pool,
  TICK_SPACINGS,
} from "@uniswap/v3-sdk";

import {
  V3OnChainTickDataProvider,
} from "./v3TickDataProvider";

// ======================================================
// UNISWAP V3 POOL STATE ABI
// ======================================================
//
// Read-only pool state required by the V3 SDK.
//
// No transaction is sent.
// No wallet signing.
// No blockchain state modification.
// ======================================================

const UNISWAP_V3_POOL_STATE_ABI = [
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (" +
    "uint160 sqrtPriceX96," +
    "int24 tick," +
    "uint16 observationIndex," +
    "uint16 observationCardinality," +
    "uint16 observationCardinalityNext," +
    "uint8 feeProtocol," +
    "bool unlocked" +
  ")",
];

// ======================================================
// UNISWAP V3 FACTORY ABI
// ======================================================

const UNISWAP_V3_FACTORY_ABI = [
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address)",
];

// ======================================================
// SEPOLIA UNISWAP V3 FACTORY
// ======================================================

const UNISWAP_V3_FACTORY_ADDRESS =
  "0x0227628f3F023bb0B980b67D528571c95c6DaC1c";

// ======================================================
// ZERO ADDRESS
// ======================================================

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000";

// ======================================================
// V3 SWAP SIMULATION RESULT
// ======================================================

export interface V3SwapSimulationResult {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  poolAddress: string;
  fee: number;
  currentTick: number;
  newTick: number;

  // Updated SDK pool state after the simulated swap.
  //
  // This is required when a second V3 leg uses the same
  // V3 pool, so the second simulation starts from the
  // post-first-leg state instead of rebuilding stale state.
  updatedPool: Pool;
}

// ======================================================
// CREATE V3 SDK TOKEN
// ======================================================
//
// Creates an SDK Token object for Ethereum Sepolia.
//
// This is an SDK representation only.
// It does not interact with the blockchain.
// ======================================================

function createV3Token(
  chainId: number,
  address: string,
  decimals: number,
  symbol: string,
): Token {
  return new Token(
    chainId,
    address,
    decimals,
    symbol,
    symbol,
  );
}

// ======================================================
// GET UNISWAP V3 SDK POOL
// ======================================================
//
// Reads the current on-chain V3 pool state and builds
// a Uniswap V3 SDK Pool.
//
// Tick state is supplied by the project-specific
// V3OnChainTickDataProvider.
//
// READ-ONLY:
// - No transaction
// - No wallet
// - No state modification
// ======================================================

export async function getV3SdkPool(
  provider: Provider,
  tokenA: Token,
  tokenB: Token,
  fee: number,
): Promise<{
  pool: Pool;
  poolAddress: string;
}> {
  const tickSpacing =
    TICK_SPACINGS[
      fee as keyof typeof TICK_SPACINGS
    ];

  if (!tickSpacing) {
    throw new Error(
      "[V3 STATE SIMULATOR] Unsupported V3 fee tier.",
    );
  }

  const factory =
    new Contract(
      UNISWAP_V3_FACTORY_ADDRESS,
      UNISWAP_V3_FACTORY_ABI,
      provider,
    );

  const poolAddress =
    await factory.getPool(
      tokenA.address,
      tokenB.address,
      fee,
    );

  if (
    !poolAddress ||
    poolAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
  ) {
    throw new Error(
      "[V3 STATE SIMULATOR] V3 pool does not exist.",
    );
  }

  const poolContract =
    new Contract(
      poolAddress,
      UNISWAP_V3_POOL_STATE_ABI,
      provider,
    );

  const [
    liquidity,
    slot0,
  ] =
    await Promise.all([
      poolContract.liquidity(),
      poolContract.slot0(),
    ]);

  const sqrtPriceX96 =
    slot0[0];

  const tickCurrent =
    Number(slot0[1]);

  const tickDataProvider =
    new V3OnChainTickDataProvider(
      provider,
      poolAddress,
      tickSpacing,
    );

  const pool =
    new Pool(
      tokenA,
      tokenB,
      fee as FeeAmount,
      sqrtPriceX96.toString(),
      liquidity.toString(),
      tickCurrent,
      tickDataProvider,
    );

  return {
    pool,
    poolAddress,
  };
}

// ======================================================
// SIMULATE V3 SWAP
// ======================================================
//
// Simulates an exact-input Uniswap V3 swap using:
//
//   current on-chain pool state
//             â†“
//   V3 SDK Pool
//             â†“
//   on-chain initialized ticks
//             â†“
//   SDK swap calculation
//
// IMPORTANT:
//
// This function:
// - DOES NOT send a transaction
// - DOES NOT request a wallet signature
// - DOES NOT call a router
// - DOES NOT modify blockchain state
//
// It only calculates the expected result.
// ======================================================

export async function simulateV3SwapWithPool(
  pool: Pool,
  poolAddress: string,
  tokenInAddress: string,
  tokenOutAddress: string,
  amountIn: bigint,
): Promise<V3SwapSimulationResult> {
  if (amountIn <= 0n) {
    throw new Error(
      "[V3 STATE SIMULATOR] Amount in must be greater than zero.",
    );
  }

  if (
    !tokenInAddress ||
    !tokenOutAddress
  ) {
    throw new Error(
      "[V3 STATE SIMULATOR] Token addresses are required.",
    );
  }

  if (
    tokenInAddress.toLowerCase() ===
    tokenOutAddress.toLowerCase()
  ) {
    throw new Error(
      "[V3 STATE SIMULATOR] Token addresses must be different.",
    );
  }

  const tokenIn =
    pool.token0.address.toLowerCase() ===
    tokenInAddress.toLowerCase()
      ? pool.token0
      : pool.token1;

  const tokenOut =
    pool.token0.address.toLowerCase() ===
    tokenOutAddress.toLowerCase()
      ? pool.token0
      : pool.token1;

  if (
    tokenIn.address.toLowerCase() !==
    tokenInAddress.toLowerCase()
  ) {
    throw new Error(
      "[V3 STATE SIMULATOR] tokenIn does not belong to the supplied pool.",
    );
  }

  if (
    tokenOut.address.toLowerCase() !==
    tokenOutAddress.toLowerCase()
  ) {
    throw new Error(
      "[V3 STATE SIMULATOR] tokenOut does not belong to the supplied pool.",
    );
  }

  const inputAmount =
    CurrencyAmount.fromRawAmount(
      tokenIn,
      amountIn.toString(),
    );

  const [
    outputAmount,
    updatedPool,
  ] =
    await pool.getOutputAmount(
      inputAmount,
    );

  const amountOut =
    BigInt(
      outputAmount.quotient.toString(),
    );

  if (amountOut <= 0n) {
    throw new Error(
      "[V3 STATE SIMULATOR] Simulated amountOut is zero.",
    );
  }

  return {
    tokenIn:
      tokenInAddress,

    tokenOut:
      tokenOutAddress,

    amountIn,

    amountOut,

    poolAddress,

    fee:
      pool.fee,

    currentTick:
      pool.tickCurrent,

    newTick:
      updatedPool.tickCurrent,

    updatedPool,
  };
}

// ======================================================
// SIMULATE V3 SWAP
// ======================================================
//
// Builds the current on-chain V3 pool and then delegates
// to simulateV3SwapWithPool().
//
// Existing callers keep this API unchanged.
// ======================================================

export async function simulateV3Swap(
  provider: Provider,
  tokenInAddress: string,
  tokenOutAddress: string,
  tokenInDecimals: number,
  tokenOutDecimals: number,
  amountIn: bigint,
  fee: number,
): Promise<V3SwapSimulationResult> {
  if (amountIn <= 0n) {
    throw new Error(
      "[V3 STATE SIMULATOR] Amount in must be greater than zero.",
    );
  }

  if (
    !tokenInAddress ||
    !tokenOutAddress
  ) {
    throw new Error(
      "[V3 STATE SIMULATOR] Token addresses are required.",
    );
  }

  if (
    tokenInAddress.toLowerCase() ===
    tokenOutAddress.toLowerCase()
  ) {
    throw new Error(
      "[V3 STATE SIMULATOR] Token addresses must be different.",
    );
  }

  if (
    !Number.isInteger(tokenInDecimals) ||
    tokenInDecimals < 0
  ) {
    throw new Error(
      "[V3 STATE SIMULATOR] Invalid tokenIn decimals.",
    );
  }

  if (
    !Number.isInteger(tokenOutDecimals) ||
    tokenOutDecimals < 0
  ) {
    throw new Error(
      "[V3 STATE SIMULATOR] Invalid tokenOut decimals.",
    );
  }

  if (
    !Number.isInteger(fee) ||
    fee <= 0
  ) {
    throw new Error(
      "[V3 STATE SIMULATOR] Invalid V3 fee tier.",
    );
  }

  const tokenIn =
    createV3Token(
      11155111,
      tokenInAddress,
      tokenInDecimals,
      "TOKEN_IN",
    );

  const tokenOut =
    createV3Token(
      11155111,
      tokenOutAddress,
      tokenOutDecimals,
      "TOKEN_OUT",
    );

  const {
    pool,
    poolAddress,
  } =
    await getV3SdkPool(
      provider,
      tokenIn,
      tokenOut,
      fee,
    );

  return simulateV3SwapWithPool(
    pool,
    poolAddress,
    tokenInAddress,
    tokenOutAddress,
    amountIn,
  );
}

// ======================================================
// DEV: V3 STATE SIMULATOR RUNTIME TEST
// ======================================================
//
// Tests against the known Sepolia USDC/WETH V3 pool.
//
// READ-ONLY ONLY.
// ======================================================

if (import.meta.env.DEV) {
  (
    window as any
  ).testV3StateSimulator =
    async () => {
      console.log(
        "[V3 STATE SIMULATOR TEST] START",
      );

      const {
        getProvider,
      } =
        await import("../blockchain");

      const provider =
        await getProvider();

      const usdc =
        "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

      const weth =
        "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";

      // ==================================================
      // TEST 1
      //
      // USDC -> WETH
      // ==================================================

      const usdcAmountIn =
        1000000n;

      const usdcToWeth =
        await simulateV3Swap(
          provider,
          usdc,
          weth,
          6,
          18,
          usdcAmountIn,
          3000,
        );

      console.log(
        "[V3 STATE SIMULATOR TEST] USDC -> WETH:",
        {
          amountIn:
            usdcToWeth.amountIn.toString(),

          amountOut:
            usdcToWeth.amountOut.toString(),

          pool:
            usdcToWeth.poolAddress,

          fee:
            usdcToWeth.fee,

          currentTick:
            usdcToWeth.currentTick,

          newTick:
            usdcToWeth.newTick,
        },
      );

      if (
        usdcToWeth.amountOut <= 0n
      ) {
        throw new Error(
          "[V3 STATE SIMULATOR TEST] USDC -> WETH amountOut is invalid.",
        );
      }

      // ==================================================
      // TEST 2
      //
      // WETH -> USDC
      //
      // This validates the opposite direction.
      // ==================================================

      const wethAmountIn =
        1000000000000000n;

      const wethToUsdc =
        await simulateV3Swap(
          provider,
          weth,
          usdc,
          18,
          6,
          wethAmountIn,
          3000,
        );

      console.log(
        "[V3 STATE SIMULATOR TEST] WETH -> USDC:",
        {
          amountIn:
            wethToUsdc.amountIn.toString(),

          amountOut:
            wethToUsdc.amountOut.toString(),

          pool:
            wethToUsdc.poolAddress,

          fee:
            wethToUsdc.fee,

          currentTick:
            wethToUsdc.currentTick,

          newTick:
            wethToUsdc.newTick,
        },
      );

      if (
        wethToUsdc.amountOut <= 0n
      ) {
        throw new Error(
          "[V3 STATE SIMULATOR TEST] WETH -> USDC amountOut is invalid.",
        );
      }

      // ==================================================
      // TEST 3
      //
      // Verify both directions use the same V3 pool.
      // ==================================================

      if (
        usdcToWeth.poolAddress.toLowerCase() !==
        wethToUsdc.poolAddress.toLowerCase()
      ) {
        throw new Error(
          "[V3 STATE SIMULATOR TEST] Pool address mismatch.",
        );
      }

      // ==================================================
      // TEST 4
      //
      // Verify pool state is actually being simulated.
      // ==================================================

      if (
        usdcToWeth.currentTick ===
        undefined ||
        usdcToWeth.newTick ===
        undefined
      ) {
        throw new Error(
          "[V3 STATE SIMULATOR TEST] Tick state is invalid.",
        );
      }

      console.log(
        "[V3 STATE SIMULATOR TEST] PASS",
      );

      return {
        usdcToWeth,
        wethToUsdc,
      };
    };
}