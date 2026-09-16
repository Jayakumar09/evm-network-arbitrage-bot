import {
  Pool,
  Tick,
  TickListDataProvider,
  TickMath,
  SqrtPriceMath,
  SwapMath,
} from "@uniswap/v3-sdk";

import {
  CurrencyAmount,
  Token,
  Percent,
  Price,
} from "@uniswap/sdk-core";

export function testV3SdkImports(): void {
  console.log("[V3 SDK IMPORT TEST] PASS", {
    Pool: typeof Pool,
    Tick: typeof Tick,
    TickListDataProvider: typeof TickListDataProvider,
    TickMath: typeof TickMath,
    SqrtPriceMath: typeof SqrtPriceMath,
    SwapMath: typeof SwapMath,
    CurrencyAmount: typeof CurrencyAmount,
    Token: typeof Token,
    Percent: typeof Percent,
    Price: typeof Price,
  });
}

if (import.meta.env.DEV) {
  (window as any).testV3SdkImports = testV3SdkImports;
}