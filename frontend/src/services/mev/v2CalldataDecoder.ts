import { AbiCoder, getAddress } from "ethers";

export interface V2SwapDecoded {
  functionSelector: string;
  functionName: "swapExactTokensForTokens";
  amountIn: bigint;
  amountOutMin: bigint;
  path: string[];
  tokenIn: string;
  tokenOut: string;
  to: string;
  deadline: bigint;
}

const SWAP_EXACT_TOKENS_FOR_TOKENS_SELECTOR =
  "0x38ed1739";

const abiCoder = AbiCoder.defaultAbiCoder();

export function decodeV2SwapCalldata(
  data: string,
): V2SwapDecoded | null {
  try {
    if (
      !data ||
      data.length < 10 ||
      data.slice(0, 10).toLowerCase() !==
        SWAP_EXACT_TOKENS_FOR_TOKENS_SELECTOR
    ) {
      return null;
    }

    const encodedParameters =
      `0x${data.slice(10)}`;

    const [
      amountIn,
      amountOutMin,
      path,
      to,
      deadline,
    ] = abiCoder.decode(
      [
        "uint256",
        "uint256",
        "address[]",
        "address",
        "uint256",
      ],
      encodedParameters,
    );

    const decodedPath = Array.from(
      path as string[],
      (address) => getAddress(address),
    );

    if (decodedPath.length < 2) {
      return null;
    }

    return {
      functionSelector:
        SWAP_EXACT_TOKENS_FOR_TOKENS_SELECTOR,

      functionName:
        "swapExactTokensForTokens",

      amountIn:
        BigInt(amountIn.toString()),

      amountOutMin:
        BigInt(amountOutMin.toString()),

      path:
        decodedPath,

      tokenIn:
        decodedPath[0],

      tokenOut:
        decodedPath[decodedPath.length - 1],

      to:
        getAddress(to),

      deadline:
        BigInt(deadline.toString()),
    };
  } catch (error) {
    console.error(
      "[V2 CALLDATA DECODER] Decode failed:",
      error,
    );

    return null;
  }
}

if (import.meta.env.DEV) {
  (window as any).testV2CalldataDecoder =
    (): void => {
      console.log(
        "[V2 CALLDATA DECODER TEST] Starting",
      );

      const tokenIn =
        "0x1111111111111111111111111111111111111111";

      const tokenOut =
        "0x2222222222222222222222222222222222222222";

      const recipient =
        "0x3333333333333333333333333333333333333333";

      const amountIn =
        1000000n;

      const amountOutMin =
        950000n;

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
              tokenIn,
              tokenOut,
            ],
            recipient,
            deadline,
          ],
        );

      const calldata =
        SWAP_EXACT_TOKENS_FOR_TOKENS_SELECTOR +
        encodedParameters.slice(2);

      console.log(
        "[V2 CALLDATA DECODER TEST] " +
          "Synthetic calldata:",
        calldata,
      );

      const decoded =
        decodeV2SwapCalldata(
          calldata,
        );

      console.log(
        "[V2 CALLDATA DECODER TEST] " +
          "Decoded result:",
        decoded,
      );

      if (!decoded) {
        console.error(
          "[V2 CALLDATA DECODER TEST] FAILED: " +
            "Decoder returned null.",
        );
        return;
      }

      const passed =
        decoded.amountIn === amountIn &&
        decoded.amountOutMin === amountOutMin &&
        decoded.tokenIn.toLowerCase() ===
          tokenIn.toLowerCase() &&
        decoded.tokenOut.toLowerCase() ===
          tokenOut.toLowerCase() &&
        decoded.to.toLowerCase() ===
          recipient.toLowerCase() &&
        decoded.deadline === deadline &&
        decoded.path.length === 2;

      if (!passed) {
        console.error(
          "[V2 CALLDATA DECODER TEST] FAILED: " +
            "Decoded values do not match.",
        );
        return;
      }

      const rejected =
        decodeV2SwapCalldata(
          "0xdeadbeef" +
            encodedParameters.slice(2),
        );

      if (rejected !== null) {
        console.error(
          "[V2 CALLDATA DECODER TEST] FAILED: " +
            "Invalid selector was accepted.",
        );
        return;
      }

      console.log(
        "[V2 CALLDATA DECODER TEST] PASSED",
      );
    };
}