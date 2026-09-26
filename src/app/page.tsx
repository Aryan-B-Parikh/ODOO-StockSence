'use client'

import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '@/stores/ui-store'
import { AppHeader, MobileNav } from '@/components/shell/header'
import { TickerTape } from '@/components/shell/ticker-tape'
import { AppFooter } from '@/components/shell/footer'
import { SearchPalette } from '@/components/shell/search-palette'
import { ViewSkeleton } from '@/components/shared/skeletons'

const loading = () => <ViewSkeleton />

const DashboardView = dynamic(() => import('@/components/views/dashboard-view'), { loading, ssr: false })
const MarketsView = dynamic(() => import('@/components/views/markets-view'), { loading, ssr: false })
const NewsView = dynamic(() => import('@/components/views/news-view'), { loading, ssr: false })
const PortfolioView = dynamic(() => import('@/components/views/portfolio-view'), { loading, ssr: false })
const WatchlistView = dynamic(() => import('@/components/views/watchlist-view'), { loading, ssr: false })
const AnalystView = dynamic(() => import('@/components/views/analyst-view'), { loading, ssr: false })

const StockDetailDialog = dynamic(() => import('@/components/stock/stock-detail-dialog'), { ssr: false })
const TradeDialog = dynamic(() => import('@/components/stock/trade-dialog'), { ssr: false })

export default function StockSensePage() {
  const activeView = useUIStore((s) => s.activeView)

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <TickerTape />

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-5 lg:pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {activeView === 'dashboard' && <DashboardView />}
            {activeView === 'markets' && <MarketsView />}
            {activeView === 'news' && <NewsView />}
            {activeView === 'portfolio' && <PortfolioView />}
            {activeView === 'watchlist' && <WatchlistView />}
            {activeView === 'analyst' && <AnalystView />}
          </motion.div>
        </AnimatePresence>
      </main>

      <AppFooter />
      <MobileNav />

      {/* Global overlays */}
      <SearchPalette />
      <StockDetailDialog />
      <TradeDialog />
    </div>
  )
}
