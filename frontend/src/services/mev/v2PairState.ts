import {
  Contract,
  getAddress,
  type Provider,
} from "ethers";

const V2_FACTORY_ADDRESS =
  "0x7E0987E5b3a30e3f2828572Bb659A548460a3003";

const V2_PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
];

const V2_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
];

export interface V2PairState {
  pairAddress: string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  blockTimestampLast: number;
}

function normalizeAddress(address: string): string {
  return getAddress(address);
}

/**
 * Read the current V2 pair state.
 *
 * READ-ONLY:
 * - No transaction is sent.
 * - No blockchain state is changed.
 */
export async function getV2PairState(
  provider: Provider,
  tokenA: string,
  tokenB: string,
): Promise<V2PairState> {
  if (!tokenA || !tokenB) {
    throw new Error(
      "Both tokenA and tokenB are required",
    );
  }

  const normalizedTokenA =
    normalizeAddress(tokenA);

  const normalizedTokenB =
    normalizeAddress(tokenB);

  if (
    normalizedTokenA ===
    normalizedTokenB
  ) {
    throw new Error(
      "tokenA and tokenB must be different",
    );
  }

  const factory = new Contract(
    V2_FACTORY_ADDRESS,
    V2_FACTORY_ABI,
    provider,
  );

  const pairAddress =
    await factory.getPair(
      normalizedTokenA,
      normalizedTokenB,
    );

  if (
    !pairAddress ||
    pairAddress ===
      "0x0000000000000000000000000000000000000000"
  ) {
    throw new Error(
      `No V2 pair found for ${normalizedTokenA} / ${normalizedTokenB}`,
    );
  }

  const pair = new Contract(
    pairAddress,
    V2_PAIR_ABI,
    provider,
  );

  const [
    token0,
    token1,
    reserves,
  ] = await Promise.all([
    pair.token0(),
    pair.token1(),
    pair.getReserves(),
  ]);

  return {
    pairAddress:
      normalizeAddress(pairAddress),

    token0:
      normalizeAddress(token0),

    token1:
      normalizeAddress(token1),

    reserve0:
      BigInt(reserves.reserve0),

    reserve1:
      BigInt(reserves.reserve1),

    blockTimestampLast:
      Number(reserves.blockTimestampLast),
  };
}

if (import.meta.env.DEV) {
  (window as any).testMevV2PairState =
    async () => {
      console.log(
        "[MEV V2 PAIR STATE TEST] Starting",
      );

      const { getProvider } =
        await import("../blockchain");

      const provider =
        await getProvider();

      const usdc =
        "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

      const weth =
        "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";

      const state =
        await getV2PairState(
          provider,
          usdc,
          weth,
        );

      console.log(
        "[MEV V2 PAIR STATE TEST] Pair:",
        state.pairAddress,
      );

      console.log(
        "[MEV V2 PAIR STATE TEST] Token0:",
        state.token0,
      );

      console.log(
        "[MEV V2 PAIR STATE TEST] Token1:",
        state.token1,
      );

      console.log(
        "[MEV V2 PAIR STATE TEST] Reserve0:",
        state.reserve0.toString(),
      );

      console.log(
        "[MEV V2 PAIR STATE TEST] Reserve1:",
        state.reserve1.toString(),
      );

      if (
        state.reserve0 <= 0n ||
        state.reserve1 <= 0n
      ) {
        throw new Error(
          "V2 pair reserves must be greater than zero",
        );
      }

      console.log(
        "[MEV V2 PAIR STATE TEST] PASSED",
      );

      return state;
    };
}