function TransactionsPage() {
  const transactions = [
    {
      hash: '0x8f3a...c921',
      status: 'SUCCESS',
      pair: 'USDC → WETH → USDC',
      amount: '100 USDC',
      grossProfit: '$1.18',
      netProfit: '$0.38',
      gas: '$0.20',
      time: 'Today, 08:42 PM',
    },
    {
      hash: '0x71bc...a442',
      status: 'SUCCESS',
      pair: 'USDC → WETH → USDC',
      amount: '250 USDC',
      grossProfit: '$2.95',
      netProfit: '$1.72',
      gas: '$0.24',
      time: 'Today, 07:18 PM',
    },
  ]

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">

      {/* Page Header */}
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-emerald-400">
          FLASH LOAN ARBITRAGE
        </p>

        <h1 className="text-4xl font-bold text-white">
          Transactions
        </h1>

        <p className="mt-3 text-slate-400">
          View previous arbitrage transactions and execution history.
        </p>
      </div>

      {/* Summary */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Total Transactions
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            2
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Successful
          </p>
          <p className="mt-2 text-2xl font-semibold text-emerald-400">
            2
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Total Net Profit
          </p>
          <p className="mt-2 text-2xl font-semibold text-emerald-400">
            $2.10
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Network
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            Ethereum Sepolia
          </p>
        </div>

      </div>

      {/* Transaction History */}
      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">

        <div className="border-b border-slate-800 px-6 py-5">
          <h2 className="text-lg font-semibold text-white">
            Transaction History
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Previous flash-loan arbitrage execution results.
          </p>
        </div>

        {/* Desktop Table */}
        <div className="hidden overflow-x-auto md:block">

          <table className="w-full text-left">

            <thead className="border-b border-slate-800 bg-slate-900/40">
              <tr>
                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Transaction
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Pair
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Amount
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Gross Profit
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Net Profit
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Gas
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Status
                </th>

                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Time
                </th>
              </tr>
            </thead>

            <tbody>
              {transactions.map((transaction) => (
                <tr
                  key={transaction.hash}
                  className="border-b border-slate-800/70 last:border-0 hover:bg-slate-900/30"
                >

                  <td className="px-6 py-5">
                    <button
                      type="button"
                      className="font-mono text-sm text-emerald-400 hover:text-emerald-300"
                    >
                      {transaction.hash}
                    </button>
                  </td>

                  <td className="px-6 py-5 text-sm text-white">
                    {transaction.pair}
                  </td>

                  <td className="px-6 py-5 text-sm text-white">
                    {transaction.amount}
                  </td>

                  <td className="px-6 py-5 text-sm font-semibold text-white">
                    {transaction.grossProfit}
                  </td>

                  <td className="px-6 py-5 text-sm font-semibold text-emerald-400">
                    {transaction.netProfit}
                  </td>

                  <td className="px-6 py-5 text-sm text-white">
                    {transaction.gas}
                  </td>

                  <td className="px-6 py-5">
                    <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                      {transaction.status}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-6 py-5 text-sm text-slate-300">
                    {transaction.time}
                  </td>

                </tr>
              ))}
            </tbody>

          </table>

        </div>

        {/* Mobile Cards */}
        <div className="space-y-4 p-4 md:hidden">

          {transactions.map((transaction) => (
            <div
              key={transaction.hash}
              className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"
            >

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="font-mono text-sm text-emerald-400"
                >
                  {transaction.hash}
                </button>

                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
                  {transaction.status}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">

                <div>
                  <p className="text-xs text-slate-400">
                    Pair
                  </p>
                  <p className="mt-1 text-white">
                    {transaction.pair}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Amount
                  </p>
                  <p className="mt-1 text-white">
                    {transaction.amount}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Gross Profit
                  </p>
                  <p className="mt-1 text-white">
                    {transaction.grossProfit}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Net Profit
                  </p>
                  <p className="mt-1 font-semibold text-emerald-400">
                    {transaction.netProfit}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Gas
                  </p>
                  <p className="mt-1 text-white">
                    {transaction.gas}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Time
                  </p>
                  <p className="mt-1 text-slate-300">
                    {transaction.time}
                  </p>
                </div>

              </div>

            </div>
          ))}

        </div>

      </section>

    </main>
  )
}

export default TransactionsPage