/**
 * StockSense — Shared API types used by both API routes and frontend.
 */

import type { Quote, Bar, IndexQuote, SectorPerf, MarketBreadth, MarketSentiment } from './market/engine'

export type { Quote, Bar, IndexQuote, SectorPerf, MarketBreadth, MarketSentiment }

export interface StockDetail {
  quote: Quote
  profile: {
    symbol: string
    name: string
    sector: string
    exchange: string
    description: string
    ceo: string
    hq: string
    employees: number
    website: string
    founded: string
  }
  peers: Quote[]
}

export interface MarketOverview {
  serverTime: string
  indices: IndexQuote[]
  breadth: MarketBreadth
  sentiment: MarketSentiment
  movers: {
    gainers: Quote[]
    losers: Quote[]
    mostActive: Quote[]
  }
  sectors: SectorPerf[]
}

export interface NewsDTO {
  id: number
  symbol: string | null
  symbolName: string | null
  headline: string
  summary: string
  source: string
  sentiment: number
  sentimentLabel: string
  impact: string
  publishedAt: string
  aiSummary: string | null
}

export interface WatchItemDTO {
  symbol: string
  note: string | null
  alertAbove: number | null
  alertBelow: number | null
  quote: Quote
}

export interface HoldingDTO {
  symbol: string
  name: string
  quantity: number
  avgCost: number
  costBasis: number
  marketValue: number
  dayChange: number
  dayChangePct: number
  pnl: number
  pnlPct: number
  allocation: number // 0-100
  quote: Quote
}

export interface TransactionDTO {
  id: number
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  fee: number
  note: string | null
  executedAt: string
}

export interface PortfolioSummary {
  cash: number
  totalValue: number // cash + positions market value
  positionsValue: number
  totalCost: number
  dayChange: number
  dayChangePct: number
  totalPnl: number // unrealized + realized vs seed capital
  totalPnlPct: number
  seedCapital: number
  positionsCount: number
  best: { symbol: string; pnlPct: number } | null
  worst: { symbol: string; pnlPct: number } | null
}

export interface PortfolioDTO {
  summary: PortfolioSummary
  holdings: HoldingDTO[]
  transactions: TransactionDTO[]
}

export interface AnalysisReportDTO {
  id: number
  symbol: string
  rating: string
  score: number
  targetLow: number | null
  targetHigh: number | null
  content: string
  createdAt: string
}

export interface ChatMessageDTO {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface SearchResultDTO {
  symbol: string
  name: string
  sector: string
  price: number
  changePct: number
}

export const CASH_SEED = 100000
export const ANALYSIS_TTL_MS = 45 * 60 * 1000
