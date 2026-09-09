import { Contract } from "ethers";
import type { Provider } from "ethers";

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol?: string;
}

export interface QuoteRequest {
  router: string;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: bigint;
  fee?: number;
}

export interface QuoteResult {
  success: boolean;
  amountIn: bigint;
  amountOut: bigint;
  router: string;
  tokenIn: string;
  tokenOut: string;
  fee?: number;
  error?: string;
}

/**
 * Minimal Uniswap V3 Quoter interface.
 *
 * This service only performs quote reads.
 * It does NOT execute swaps.
 */
const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "tokenIn",
            type: "address",
          },
          {
            internalType: "address",
            name: "tokenOut",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "amountIn",
            type: "uint256",
          },
          {
            internalType: "uint24",
            name: "fee",
            type: "uint24",
          },
          {
            internalType: "uint160",
            name: "sqrtPriceLimitX96",
            type: "uint160",
          },
        ],
        internalType:
          "struct IQuoterV2.QuoteExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256",
      },
      {
        internalType: "uint160",
        name: "sqrtPriceX96After",
        type: "uint160",
      },
      {
        internalType: "uint32",
        name: "initializedTicksCrossed",
        type: "uint32",
      },
      {
        internalType: "uint256",
        name: "gasEstimate",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];

/**
 * Get a Uniswap V3 quote.
 *
 * This function is intentionally isolated from the existing
 * Phase 1 services so Phase 2 can evolve independently.
 */
export async function getUniswapV3Quote(
  provider: Provider,
  quoterAddress: string,
  request: QuoteRequest,
): Promise<QuoteResult> {
  try {
    if (!quoterAddress) {
      throw new Error("Quoter address is required");
    }

    if (!request.router) {
      throw new Error("Router address is required");
    }

    if (request.amountIn <= 0n) {
      throw new Error("amountIn must be greater than zero");
    }

    if (request.fee === undefined) {
      throw new Error("Uniswap V3 pool fee is required");
    }

    const quoter = new Contract(
      quoterAddress,
      QUOTER_V2_ABI,
      provider,
    );

    const result = await quoter.quoteExactInputSingle({
      tokenIn: request.tokenIn.address,
      tokenOut: request.tokenOut.address,
      amountIn: request.amountIn,
      fee: request.fee,
      sqrtPriceLimitX96: 0n,
    });

    return {
      success: true,
      amountIn: request.amountIn,
      amountOut: result[0],
      router: request.router,
      tokenIn: request.tokenIn.address,
      tokenOut: request.tokenOut.address,
      fee: request.fee,
    };
  } catch (error) {
    return {
      success: false,
      amountIn: request.amountIn,
      amountOut: 0n,
      router: request.router,
      tokenIn: request.tokenIn.address,
      tokenOut: request.tokenOut.address,
      fee: request.fee,
      error:
        error instanceof Error
          ? error.message
          : "Unknown quote error",
    };
  }
}