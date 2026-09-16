import { Contract, type Provider } from "ethers";

import {
  CurrencyAmount,
  Token,
  type BigintIsh,
} from "@uniswap/sdk-core";

import {
  FeeAmount,
  Pool,
  type TickDataProvider,
} from "@uniswap/v3-sdk";

const UNISWAP_V3_POOL_TICK_ABI = [
  "function tickBitmap(int16 wordPosition) view returns (uint256)",
  "function ticks(int24 tick) view returns (" +
    "uint128 liquidityGross," +
    "int128 liquidityNet," +
    "uint256 feeGrowthOutside0X128," +
    "uint256 feeGrowthOutside1X128," +
    "int56 tickCumulativeOutside," +
    "uint160 secondsPerLiquidityOutsideX128," +
    "uint32 secondsOutside," +
    "bool initialized" +
  ")",
];

const ZERO = 0n;
const ONE = 1n;
const WORD_SIZE = 256;

function floorDiv(
  numerator: number,
  denominator: number,
): number {
  return Math.floor(numerator / denominator);
}

function compressTick(
  tick: number,
  tickSpacing: number,
): number {
  return floorDiv(tick, tickSpacing);
}

function getWordPosition(
  compressed: number,
): number {
  return floorDiv(compressed, WORD_SIZE);
}

function getBitPosition(
  compressed: number,
): number {
  return ((compressed % WORD_SIZE) + WORD_SIZE) % WORD_SIZE;
}

function findMostSignificantBit(
  value: bigint,
): number {
  if (value <= ZERO) {
    throw new Error(
      "Cannot find most significant bit of zero.",
    );
  }

  let bit = 0;
  let current = value;

  while (current > ONE) {
    current >>= ONE;
    bit++;
  }

  return bit;
}

function findLeastSignificantBit(
  value: bigint,
): number {
  if (value <= ZERO) {
    throw new Error(
      "Cannot find least significant bit of zero.",
    );
  }

  let bit = 0;
  let current = value;

  while ((current & ONE) === ZERO) {
    current >>= ONE;
    bit++;
  }

  return bit;
}

export class V3OnChainTickDataProvider
  implements TickDataProvider
{
  private readonly pool: Contract;
  private readonly tickSpacing: number;

  private readonly bitmapCache =
    new Map<number, bigint>();

  private readonly tickCache =
    new Map<
      number,
      {
        liquidityGross: bigint;
        liquidityNet: bigint;
        initialized: boolean;
      }
    >();

  constructor(
    provider: Provider,
    poolAddress: string,
    tickSpacing: number,
  ) {
    if (!poolAddress) {
      throw new Error(
        "V3 tick provider requires a pool address.",
      );
    }

    if (
      !Number.isInteger(tickSpacing) ||
      tickSpacing <= 0
    ) {
      throw new Error(
        `Invalid V3 tick spacing: ${tickSpacing}`,
      );
    }

    this.pool = new Contract(
      poolAddress,
      UNISWAP_V3_POOL_TICK_ABI,
      provider,
    );

    this.tickSpacing = tickSpacing;
  }

  async getTick(
    tick: number,
  ): Promise<{
    liquidityNet: BigintIsh;
  }> {
    if (!Number.isInteger(tick)) {
      throw new Error(
        `Invalid V3 tick: ${tick}`,
      );
    }

    const cached = this.tickCache.get(tick);

    if (cached) {
      if (!cached.initialized) {
        throw new Error(
          `Requested uninitialized V3 tick: ${tick}`,
        );
      }

      return {
        liquidityNet:
            cached.liquidityNet.toString(),
        };
    }

    const result =
      await this.pool.ticks(tick);

    const tickState = {
      liquidityGross: BigInt(
        result[0].toString(),
      ),
      liquidityNet: BigInt(
        result[1].toString(),
      ),
      initialized: Boolean(result[7]),
    };

    this.tickCache.set(
      tick,
      tickState,
    );

    if (!tickState.initialized) {
      throw new Error(
        `Requested uninitialized V3 tick: ${tick}`,
      );
    }

    return {
    liquidityNet:
        tickState.liquidityNet.toString(),
    };
  }

  async nextInitializedTickWithinOneWord(
    tick: number,
    lte: boolean,
    tickSpacing: number,
  ): Promise<[number, boolean]> {
    if (
      tickSpacing !== this.tickSpacing
    ) {
      throw new Error(
        `Tick spacing mismatch: provider=${this.tickSpacing}, requested=${tickSpacing}`,
      );
    }

    if (!Number.isInteger(tick)) {
      throw new Error(
        `Invalid V3 tick: ${tick}`,
      );
    }

    const compressed =
      compressTick(
        tick,
        tickSpacing,
      );

    if (lte) {
      const wordPosition =
        getWordPosition(compressed);

      const bitPosition =
        getBitPosition(compressed);

      const bitmap =
        await this.getBitmap(
          wordPosition,
        );

      const mask =
        (ONE << BigInt(bitPosition + 1)) -
        ONE;

      const masked =
        bitmap & mask;

      if (masked !== ZERO) {
        const mostSignificantBit =
          findMostSignificantBit(
            masked,
          );

        const nextCompressed =
          compressed -
          bitPosition +
          mostSignificantBit;

        return [
          nextCompressed * tickSpacing,
          true,
        ];
      }

      const minimumCompressed =
        wordPosition * WORD_SIZE;

      return [
        minimumCompressed *
          tickSpacing,
        false,
      ];
    }

    const compressedNext =
      compressed + 1;

    const wordPosition =
      getWordPosition(
        compressedNext,
      );

    const bitPosition =
      getBitPosition(
        compressedNext,
      );

    const bitmap =
      await this.getBitmap(
        wordPosition,
      );

    const shifted =
      bitmap >>
      BigInt(bitPosition);

    if (shifted !== ZERO) {
      const leastSignificantBit =
        findLeastSignificantBit(
          shifted,
        );

      const nextCompressed =
        compressedNext +
        leastSignificantBit;

      return [
        nextCompressed * tickSpacing,
        true,
      ];
    }

    const maximumCompressed =
      ((wordPosition + 1) *
        WORD_SIZE) -
      1;

    return [
      maximumCompressed *
        tickSpacing,
      false,
    ];
  }

  private async getBitmap(
    wordPosition: number,
  ): Promise<bigint> {
    const cached =
      this.bitmapCache.get(
        wordPosition,
      );

    if (cached !== undefined) {
      return cached;
    }

    const result =
      await this.pool.tickBitmap(
        wordPosition,
      );

    const bitmap = BigInt(
      result.toString(),
    );

    this.bitmapCache.set(
      wordPosition,
      bitmap,
    );

    return bitmap;
  }
}

if (import.meta.env.DEV) {
  (window as any).testV3OnChainTickDataProvider =
    async () => {
      console.log(
        "[V3 TICK PROVIDER TEST] START",
      );

      const { getProvider } =
        await import("../blockchain");

      const provider =
        await getProvider();

      const factory =
        new Contract(
          "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
          [
            "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)",
          ],
          provider,
        );

      const tokenIn =
        "0x94a9d9ac8a22534e3fac a9f4e7f2e2cf85d5e4c8"
          .replace(" ", "");

      const tokenOut =
        "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";

      const fee = 3000;
      const tickSpacing = 60;

      const poolAddress =
        await factory.getPool(
          tokenIn,
          tokenOut,
          fee,
        );

      console.log(
        "[V3 TICK PROVIDER TEST] Pool:",
        poolAddress,
      );

      if (
        !poolAddress ||
        poolAddress.toLowerCase() ===
          "0x0000000000000000000000000000000000000000"
      ) {
        throw new Error(
          "No Sepolia V3 USDC/WETH 0.3% pool found.",
        );
      }

      const tickProvider =
        new V3OnChainTickDataProvider(
          provider,
          poolAddress,
          tickSpacing,
        );

      const poolRead =
        new Contract(
          poolAddress,
          [
            "function slot0() view returns (" +
              "uint160 sqrtPriceX96," +
              "int24 tick," +
              "uint16 observationIndex," +
              "uint16 observationCardinality," +
              "uint16 observationCardinalityNext," +
              "uint8 feeProtocol," +
              "bool unlocked" +
            ")",
          ],
          provider,
        );

      const slot0 =
        await poolRead.slot0();

      const currentTick =
        Number(slot0[1]);

      console.log(
        "[V3 TICK PROVIDER TEST] Current tick:",
        currentTick,
      );

      const [
        nextTick,
        initialized,
      ] =
        await tickProvider
          .nextInitializedTickWithinOneWord(
            currentTick,
            currentTick >= 0,
            tickSpacing,
          );

      console.log(
        "[V3 TICK PROVIDER TEST] Next tick:",
        nextTick,
      );

      console.log(
        "[V3 TICK PROVIDER TEST] Initialized:",
        initialized,
      );

      if (initialized) {
        const tick =
          await tickProvider.getTick(
            nextTick,
          );

        console.log(
          "[V3 TICK PROVIDER TEST] liquidityNet:",
          tick.liquidityNet,
        );
      }

      console.log(
        "[V3 TICK PROVIDER TEST] PASS",
      );

      return {
        poolAddress,
        currentTick,
        nextTick,
        initialized,
      };
    };
}

if (import.meta.env.DEV) {
  (window as any).testV3SdkPoolSimulation =
    async () => {
      console.log(
        "[V3 SDK POOL TEST] START",
      );

      const { getProvider } =
        await import("../blockchain");

      const provider =
        await getProvider();

      const token0 =
        new Token(
          11155111,
          "0x94a9d9ac8a22534e3fac a9f4e7f2e2cf85d5e4c8".replace(
            " ",
            "",
          ),
          6,
          "USDC",
        );

      const token1 =
        new Token(
          11155111,
          "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
          18,
          "WETH",
        );

      const factory =
        new Contract(
          "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
          [
            "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)",
          ],
          provider,
        );

      const fee =
        FeeAmount.MEDIUM;

      const poolAddress =
        await factory.getPool(
          token0.address,
          token1.address,
          fee,
        );

      if (
        !poolAddress ||
        poolAddress.toLowerCase() ===
          "0x0000000000000000000000000000000000000000"
      ) {
        throw new Error(
          "Sepolia USDC/WETH V3 0.3% pool not found.",
        );
      }

      const poolRead =
        new Contract(
          poolAddress,
          [
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
          ],
          provider,
        );

      const [
        liquidity,
        slot0,
      ] =
        await Promise.all([
          poolRead.liquidity(),
          poolRead.slot0(),
        ]);

      const currentTick =
        Number(slot0[1]);

      const tickProvider:
        TickDataProvider =
        new V3OnChainTickDataProvider(
          provider,
          poolAddress,
          60,
        );

      const sdkPool =
        new Pool(
          token0,
          token1,
          fee,
          slot0[0].toString(),
          liquidity.toString(),
          currentTick,
          tickProvider,
        );

      const usdcAmountIn =
        CurrencyAmount.fromRawAmount(
          token0,
          1_000_000,
        );

      const [
        usdcToWethOutput,
        usdcToWethUpdatedPool,
      ] =
        await sdkPool.getOutputAmount(
          usdcAmountIn,
        );

      const wethAmountIn =
        CurrencyAmount.fromRawAmount(
          token1,
          "1000000000000000",
        );

      const [
        wethToUsdcOutput,
        wethToUsdcUpdatedPool,
      ] =
        await sdkPool.getOutputAmount(
          wethAmountIn,
        );

      console.log(
        "[V3 SDK POOL TEST] Pool:",
        poolAddress,
      );

      console.log(
        "[V3 SDK POOL TEST] Current tick:",
        currentTick,
      );

      console.log(
        "[V3 SDK POOL TEST] USDC -> WETH input:",
        usdcAmountIn.quotient.toString(),
      );

      console.log(
        "[V3 SDK POOL TEST] USDC -> WETH output:",
        usdcToWethOutput.quotient.toString(),
      );

      console.log(
        "[V3 SDK POOL TEST] USDC -> WETH updated tick:",
        usdcToWethUpdatedPool.tickCurrent,
      );

      console.log(
        "[V3 SDK POOL TEST] WETH -> USDC input:",
        wethAmountIn.quotient.toString(),
      );

      console.log(
        "[V3 SDK POOL TEST] WETH -> USDC output:",
        wethToUsdcOutput.quotient.toString(),
      );

      console.log(
        "[V3 SDK POOL TEST] WETH -> USDC updated tick:",
        wethToUsdcUpdatedPool.tickCurrent,
      );

      console.log(
        "[V3 SDK POOL TEST] PASS",
      );

      return {
        poolAddress,
        currentTick,

        usdcToWeth: {
          input:
            usdcAmountIn.quotient.toString(),
          output:
            usdcToWethOutput.quotient.toString(),
          updatedTick:
            usdcToWethUpdatedPool.tickCurrent,
        },

        wethToUsdc: {
          input:
            wethAmountIn.quotient.toString(),
          output:
            wethToUsdcOutput.quotient.toString(),
          updatedTick:
            wethToUsdcUpdatedPool.tickCurrent,
        },
      };
    };
}
