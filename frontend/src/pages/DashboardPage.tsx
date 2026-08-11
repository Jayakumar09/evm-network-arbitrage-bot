import { Link } from 'react-router-dom'

function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">

      {/* Page Header */}
      <section>
        <p className="text-sm font-medium text-emerald-400">
          FLASH LOAN ARBITRAGE
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Dashboard
        </h1>

        <p className="mt-3 max-w-2xl text-slate-400">
          Monitor arbitrage opportunities, execution status,
          transactions, and your Executor contract.
        </p>
      </section>

      {/* Dashboard Cards */}
      <section className="mt-8 grid gap-5 md:grid-cols-3">

        {/* Scanner */}
        <Link
          to="/scanner"
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-emerald-500/40 hover:bg-slate-900"
        >
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Arbitrage
          </p>

          <h2 className="mt-2 text-xl font-semibold text-white">
            Opportunity Scanner
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Scan DEX routes and find potential profitable
            flash-loan opportunities.
          </p>

          <span className="mt-5 inline-block text-sm font-semibold text-emerald-400">
            Open Scanner →
          </span>
        </Link>

        {/* Execution */}
        <Link
          to="/execution"
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-emerald-500/40 hover:bg-slate-900"
        >
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Trading
          </p>

          <h2 className="mt-2 text-xl font-semibold text-white">
            Execution
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Review and confirm a prepared arbitrage
            transaction.
          </p>

          <span className="mt-5 inline-block text-sm font-semibold text-emerald-400">
            Open Execution →
          </span>
        </Link>

        {/* Transactions */}
        <Link
          to="/transactions"
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-emerald-500/40 hover:bg-slate-900"
        >
          <p className="text-xs uppercase tracking-wider text-slate-500">
            History
          </p>

          <h2 className="mt-2 text-xl font-semibold text-white">
            Transactions
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            View previous arbitrage transaction results
            and execution history.
          </p>

          <span className="mt-5 inline-block text-sm font-semibold text-emerald-400">
            View Transactions →
          </span>
        </Link>

      </section>

      {/* System Status */}
      <section className="mt-6 grid gap-5 md:grid-cols-2">

        <Link
          to="/contract"
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-emerald-500/40 hover:bg-slate-900"
        >
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Smart Contract
          </p>

          <h2 className="mt-2 text-xl font-semibold text-white">
            Contract Status
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            View Executor contract status, network,
            pause state, and operational information.
          </p>

          <span className="mt-5 inline-block text-sm font-semibold text-emerald-400">
            View Contract →
          </span>
        </Link>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">

          <p className="text-xs uppercase tracking-wider text-slate-500">
            Current Mode
          </p>

          <div className="mt-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />

            <span className="font-semibold text-amber-400">
              MOCK QUOTE MODE
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-400">
            Live DEX quotes and blockchain execution will be
            connected in later stages.
          </p>

        </div>

      </section>

    </div>
  )
}

export default DashboardPage