import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react'

import type {
  ArbitrageOpportunity,
} from '../types/arbitrage'

interface ArbitrageContextValue {
  opportunity: ArbitrageOpportunity | null

  setOpportunity: (
    opportunity: ArbitrageOpportunity | null,
  ) => void

  clearOpportunity: () => void
}

const ArbitrageContext =
  createContext<ArbitrageContextValue | undefined>(
    undefined,
  )

interface ArbitrageProviderProps {
  children: ReactNode
}

export function ArbitrageProvider({
  children,
}: ArbitrageProviderProps) {
  const [opportunity, setOpportunity] =
    useState<ArbitrageOpportunity | null>(null)

  const clearOpportunity = () => {
    setOpportunity(null)
  }

  return (
    <ArbitrageContext.Provider
      value={{
        opportunity,
        setOpportunity,
        clearOpportunity,
      }}
    >
      {children}
    </ArbitrageContext.Provider>
  )
}

export function useArbitrage() {
  const context = useContext(ArbitrageContext)

  if (!context) {
    throw new Error(
      'useArbitrage must be used inside ArbitrageProvider',
    )
  }

  return context
}