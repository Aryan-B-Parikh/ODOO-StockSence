# StockSense — Worklog & Handover Document

**Project**: StockSense — AI-Powered Stock Market Intelligence Platform
**Stack**: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma+SQLite · Zustand · TanStack Query · Recharts · socket.io · z-ai-web-dev-sdk (backend AI)
**Route**: single user-visible route `/` (client-side tab switching)

## IMPORTANT NOTES FOR ALL AGENTS
- Market data is 100% SIMULATED by a deterministic engine (`src/lib/market/engine.ts`). Prices move every minute + sub-minute jitter, 24/7. Deterministic = the Next.js API process and the WebSocket service produce IDENTICAL prices at the same wall-clock time.
- `z-ai-web-dev-sdk` MUST only be used in backend/API routes (server side). NEVER in client components.
- All API requests from the client use RELATIVE paths. For the WebSocket service use `io('/?XTransformPort=3003')` (never a port in the host).
- Do NOT run `bun run dev` (system runs it on port 3000). Check `/home/z/my-project/dev.log` for errors.
- Run `bun run lint` before finishing. Do NOT write test files.
- UI rules: NO blue/indigo colors. Up = emerald/green, down = red/rose. Sticky footer (min-h-screen flex flex-col + footer mt-auto). Responsive mobile-first. Use existing shadcn/ui components in src/components/ui.
- After finishing your task you MUST append your work record to this file (append, never overwrite).

---
Task ID: 0
Agent: main (Z.ai Code)
Task: Foundation — Prisma schema, deterministic market engine, news generator, shared types, seed

Work Log:
- Created `prisma/schema.prisma` — models: Stock, NewsItem (unique dateKey+slot), WatchItem, Transaction, AnalysisReport, ChatMessage. Ran `bun run db:push`.
- Created `src/lib/market/universe.ts` — 46 US large-cap stocks with meta (sector, marketCap, pe, eps, div yield, beta, vol, ceo, hq, description…) + 3 index defs (SPX/NDX/DJI).
- Created `src/lib/market/engine.ts` — deterministic engine (details below).
- Created `src/lib/market/news.ts` — deterministic news generator (23 items/day, sentiment biased to the stock's daily move).
- Created `src/lib/types.ts` — shared DTOs for API + frontend.
- Created & ran `prisma/seed.ts` — seeded 46 stock profiles, 28 news items (today+yesterday), watchlist (AAPL, NVDA, TSLA, MSFT, AMZN), 8 demo transactions (paper portfolio).

Stage Summary:
- DB: SQLite at db/custom.db, seeded and ready.
- Engine verified: realistic quotes (±0-3% daily moves), 1D/5D/1M/1Y candles, indices, sentiment, movers, sectors, search, live ticks; determinism verified.

## ENGINE API (import from '@/lib/market/engine' in Next.js; mini-service imports it via RELATIVE path '../../src/lib/market/engine')
- `getQuote(symbol): Quote | null` — price, prevClose, change, changePct, dayOpen/High/Low, volume, marketCap(B), peRatio, dividendYield, beta, eps, week52High/Low, spark (27 pts)
- `getQuotes(): Quote[]` (all 46)
- `getLiveTicks(): {symbol,p,c,v}[]` — compact ticks for WS broadcast
- `getCandles(symbol, range: '1D'|'5D'|'1M'|'3M'|'6M'|'1Y'|'2Y'): Bar[]` — Bar {t(epoch ms),o,h,l,c,v}
- `getIndices(): IndexQuote[]` — SPX/NDX/DJI/VIX with `points` sparkline (40)
- `getMovers(): {gainers,losers,mostActive}` — Quote[] top 6 each
- `getSectorPerformance(): {sector,changePct,count,leaders,laggards}[]`
- `getBreadth(): {advancing,declining,unchanged,total}`
- `getSentiment(): {score(0-100),label,components:{breadth,momentum,volatility,demand},prevScore}`
- `searchStocks(q, limit=8): {symbol,name,sector,price,changePct}[]`
- `getStockProfile(symbol)`, `getAllProfiles()`, `getPeers(symbol): Quote[]`
- `getCloseOn(symbol, dateKey)`, `getDayChange(symbol, dateKey)`
- `utcDateKey(date), addDays(key, n)`

## NEWS GENERATOR (import from '@/lib/market/news')
- `generateRecentNews(): GeneratedNews[]` — today + yesterday, filtered to publishedAt <= now
- `generateNewsForDate(dateKey)` — deterministic per date
- API layer persists via upsert on (dateKey, slot) — call ensureNews() pattern (see Task 1-a)

## SHARED TYPES (src/lib/types.ts)
Quote, Bar, IndexQuote, SectorPerf, MarketBreadth, MarketSentiment, StockDetail, MarketOverview, NewsDTO, WatchItemDTO, HoldingDTO, TransactionDTO, PortfolioSummary, PortfolioDTO, AnalysisReportDTO, ChatMessageDTO, SearchResultDTO, CASH_SEED=100000, ANALYSIS_TTL_MS=45min

## DB access
`import { db } from '@/lib/db'` (PrismaClient). Models: Stock, NewsItem, WatchItem, Transaction, AnalysisReport, ChatMessage.

=====================================================================
REMAINING TASKS + CONTRACTS (for subagents)
=====================================================================

## Task 1-a — Next.js API routes (backend agent)
Files: everything under `src/app/api/**` (you own this tree), plus `src/lib/portfolio.ts` if needed for shared logic.
Use `export const dynamic = 'force-dynamic'` on routes reading live data.

Endpoints (all JSON):
1. `GET /api/market/overview` → MarketOverview { serverTime, indices, breadth, sentiment, movers{gainers,losers,mostActive}, sectors }
2. `GET /api/stocks?search=&sector=&sort=&order=asc|desc&limit=` → { stocks: Quote[] } — sort keys: symbol,name,price,changePct,volume,marketCap,peRatio,dividendYield — default sort marketCap desc. search matches symbol/name case-insensitive.
3. `GET /api/stocks/[symbol]` → StockDetail { quote, profile (from getStockProfile + description etc), peers: Quote[] } — 404 if unknown
4. `GET /api/stocks/[symbol]/candles?range=` → { symbol, range, bars: Bar[] } (validate range in list, default 1D)
5. `GET /api/news?symbol=&limit=30&offset=0` → { news: NewsDTO[] } — FIRST call `ensureNews()` (see below), then query NewsItem where publishedAt <= now, optional symbol filter (symbol null items are macro news), order by publishedAt desc. Join symbolName via universe (STOCK_BY_SYMBOL). NewsDTO includes id, symbol, symbolName, headline, summary, source, sentiment(number), sentimentLabel, impact, publishedAt(ISO), aiSummary.
   - `ensureNews()`: for dateKeys [today, yesterday] (UTC) call generateNewsForDate, upsert each item into NewsItem (unique dateKey_slot). Skip upsert if count for dateKey exists. Wrap in try/catch.
6. `POST /api/news/[id]/ai-summary` → uses z-ai-web-dev-sdk LLM: system prompt "You are a financial news analyst. Given a headline and summary, produce: (1) a 2-3 sentence crisp AI summary, (2) sentiment score between -1 and 1, (3) impact for the stock (HIGH/MEDIUM/LOW). Reply with STRICT JSON {\"summary\":string,\"sentiment\":number,\"impact\":string}" — parse JSON safely (strip markdown fences). Cache result in NewsItem.aiSummary (string, store as the summary text). GET returns cached. Response: { summary, sentiment, impact }. If LLM fails, fall back to a locally computed summary (use existing summary text) with 200 + { fallback: true }.
7. `GET /api/watchlist` → { items: WatchItemDTO[] } — quote from engine + alert triggered flags computed: alertAboveHit = alertAbove != null && quote.price >= alertAbove, alertBelowHit similarly.
8. `POST /api/watchlist` body {symbol, note?} → validate symbol exists → upsert (unique symbol). `PATCH /api/watchlist/[symbol]` body {note?, alertAbove?, alertBelow?} (null clears). `DELETE /api/watchlist/[symbol]`.
9. `GET /api/portfolio` → PortfolioDTO. Compute from ALL transactions chronologically:
   - cash = CASH_SEED + Σ(sell proceeds - fees) - Σ(buy costs + fees)
   - per symbol net quantity>0 → holdings with avgCost (weighted), costBasis, marketValue=qty*livePrice, dayChange=qty*(price-prevClose), pnl=marketValue-costBasis, pnlPct, allocation=marketValue/positionsValue*100, quote
   - summary: cash, positionsValue, totalValue, totalCost, dayChange (Σ), dayChangePct, totalPnl = (totalValue - CASH_SEED) + realizedNote... simpler: totalPnl = totalValue - (CASH_SEED + netDeposits(=0)) → totalValue - CASH_SEED (includes realized+unrealized). totalPnlPct relative to CASH_SEED. best/worst by pnlPct among holdings.
   - transactions: latest 50 desc, mapped to TransactionDTO.
10. `POST /api/portfolio/trade` body {symbol, side:'BUY'|'SELL', quantity>0, price?} → validate symbol; price = provided or live getQuote price; fee=0.99. BUY: cost=qty*price+fee must be <= cash else 400 {error}. SELL: qty <= owned qty else 400 {error}. Insert Transaction, return updated PortfolioDTO.
11. `DELETE /api/portfolio/transaction/[id]` → delete + return updated PortfolioDTO.
12. `GET /api/portfolio/history?days=30` → { points: {t: epochMs, value:number}[] } — portfolio total value per day for past N days: for each dateKey, cash(t) = CASH_SEED + Σ trades executed <= endOfDay(t) (sells minus buys incl fees), positions value = Σ symbols net qty at t × getCloseOn(symbol, dateKey). Plus final live point (now).
13. `POST /api/analysis/[symbol]` → if AnalysisReport exists for symbol with createdAt > now-ANALYSIS_TTL_MS, return it. Else generate via LLM (z-ai-web-dev-sdk):
    - Context: quote, profile, fundamentals (pe, eps, divYield, beta, marketCap, week52 range), 30-day trend from getCandles(symbol,'1M') (compute % change, volatility, high/low), sector performance, 3 latest news headlines for the symbol (from DB).
    - System: "You are StockSense AI, an expert equity analyst. Produce a concise but insightful markdown research note. Use these EXACT sections: ## Executive Summary, ## Bull Case, ## Bear Case, ## Key Risks, ## Technical View, ## Verdict. In Verdict include on separate lines: `Rating: BUY|HOLD|SELL`, `Score: X/10`, `Price Target: $LOW - $HIGH`. Be specific, reference the numbers provided. 350-500 words."
    - Parse rating/score/targets with regex from content. Store in AnalysisReport. Return { report: AnalysisReportDTO }.
    - `GET /api/analysis/[symbol]` → latest report or { report: null }.
    - On LLM failure → 503 { error: 'AI service unavailable, please retry' }.
14. `POST /api/chat` body { sessionId, message } → save user ChatMessage; build context block: current top movers (3 gainers/3 losers with %), user watchlist symbols with prices, portfolio holdings summary, and if message mentions any known symbol (match against universe symbols/names) include that stock's quote+fundamentals. System prompt: "You are StockSense AI Analyst, a helpful market assistant for the StockSense platform. Data provided is SIMULATED market data. Be concise (under 200 words), use markdown formatting, reference the provided live context when relevant. Never guarantee returns; include a light disclaimer when giving anything resembling advice." Multi-turn: load last 10 messages of session for history. Save assistant reply. Return { reply }. On LLM failure return 503 with friendly error.
15. `GET /api/chat?sessionId=` → { messages: ChatMessageDTO[] } (last 50 asc).
16. `GET /api/search?q=` → { results: SearchResultDTO[] } via searchStocks.
17. `GET /api/health` → { ok: true, time }.

LLM usage pattern (backend only):
```ts
import ZAI from 'z-ai-web-dev-sdk'
const zai = await ZAI.create()
const completion = await zai.chat.completions.create({
  messages: [{ role: 'assistant', content: systemPrompt }, { role: 'user', content: userPrompt }],
  thinking: { type: 'disabled' },
})
const reply = completion.choices?.[0]?.message?.content ?? ''
```
Test EVERY endpoint with curl (the dev server is on port 3000; internal fetch/curl to http://localhost:3000/api/... is fine for testing). Verify JSON shapes match this contract. Handle errors gracefully (400/404/500 with { error }).

## Task 1-b — WebSocket market-ticker mini-service
Files: `mini-services/market-ticker/{package.json,index.ts}` (you own this tree).
- package.json: name market-ticker, type module, scripts: { "dev": "bun --hot index.ts" }, dependencies: socket.io ^4.8.1 (install with bun).
- Port 3003. socket.io Server with path '/' and cors origin '*' (copy pattern from /home/z/my-project/examples/websocket/server.ts).
- Import engine RELATIVELY: `import { getLiveTicks } from '../../src/lib/market/engine'`
- On connection: emit 'snapshot' with { t: Date.now(), ticks: getLiveTicks() }.
- Every 2000ms broadcast 'tick' { t: Date.now(), ticks: getLiveTicks() }.
- Log connection count. Graceful shutdown.
- Start it: `cd mini-services/market-ticker && bun install && (nohup bun run dev > /tmp/market-ticker.log 2>&1 &)`. Verify with a small bun client script (socket.io-client from the main project's node_modules or install) that ticks arrive. Also verify the engine import works from that folder.

## Task 1-c — Frontend shell (main agent, DONE — see contract below for view agents)

## Task 2-a — Dashboard + Markets views (frontend agent)
Files you own: `src/components/views/dashboard-view.tsx`, `src/components/views/markets-view.tsx`, plus `src/components/views/dashboard/*` and `src/components/views/markets/*` subfolders if you want subcomponents. Do NOT edit any other files (imports must come from existing shared modules; if something essential is missing, add it to YOUR files only).
- Dashboard view: 4 index cards (value, change, ChangeBadge, Sparkline) + VIX; Fear & Greed sentiment gauge (custom SVG semicircle gauge with needle, score + label + 4 component mini-bars); Market breadth bar (advancing vs declining); Top Gainers / Top Losers / Most Active 3-column lists (click → open stock detail via useUIStore().openStock(symbol)); sector heatmap grid (colored tiles by changePct, tooltip with leaders/laggards); latest 3 news headlines strip (from /api/news limit 3, sentiment badge). Data: TanStack Query on ['overview'] → GET /api/market/overview (10s refetchInterval), plus live overlay from useMarketStore for displayed symbols where sensible.
- Markets view: full screener — search input, sector Select filter, sortable columns (Symbol, Name, Price, Day Change%, Day Change$, Volume, Mkt Cap, P/E, Div Yield, 7D trend Sparkline) using @tanstack/react-table + existing shadcn table components; click row → openStock(symbol); live price flash from useMarketStore ticks (green/red bg pulse). GET /api/stocks with server-side sort/filter? Client-side filtering of the fetched list is fine (fetch all once, filter client-side; refetch every 15s).
- Loading: skeleton components. Empty states. Framer-motion subtle entrance animations. Fully responsive (cards stack on mobile, table horizontally scrollable).

## Task 2-b — Stock detail dialog + trade dialog (frontend agent)
Files you own: `src/components/stock/stock-detail-dialog.tsx`, `src/components/stock/trade-dialog.tsx`, `src/components/stock/*` subcomponents.
- StockDetailDialog: controlled by useUIStore (selectedSymbol + detailOpen). Large Dialog (max-w-5xl, scrollable content):
  - Header: stock logo circle (initials), name (SYMBOL · exchange · sector), live price (from useMarketStore tick overlay with flash), ChangeBadge, watchlist star toggle (乐观 calls /api/watchlist POST/DELETE + toast), Trade button, close.
  - Range selector (1D 5D 1M 3M 6M 1Y 2Y) → GET /api/stocks/[symbol]/candles?range= (TanStack Query key ['candles', symbol, range]). Recharts AreaChart (emerald/red gradient by overall change) + volume bars (composed, secondary axis, muted). Crosshair tooltip showing OHLC + volume. Responsive.
  - Key stats grid: Open, Prev Close, Day Range (low–high bar), 52W Range (position marker), Volume, Mkt Cap, P/E, EPS, Div Yield, Beta.
  - Profile card: description, CEO, HQ, employees, founded, website link.
  - Peers row: mini cards with symbol+price+change, click switches dialog to that symbol.
  - AI Analyst section: "Generate AI Analysis" button → POST /api/analysis/[symbol] (loading state with animated shimmer), renders markdown (react-markdown) with rating badge (BUY emerald / HOLD amber / SELL red), score, target range, timestamp; cached report loads on open (GET). Disclaimer note "AI-generated, simulated data".
  - Recent news list for symbol (GET /api/news?symbol=&limit=5) with sentiment badges.
- TradeDialog: opened via useUIStore (tradeSymbol). Buy/Sell tabs, quantity input, estimated cost = qty*live price + $0.99 fee, cash / owned qty display (GET /api/portfolio), confirm → POST /api/portfolio/trade → toast success/error, invalidate ['portfolio'] queries. Small/confetti-free, professional.

## Task 2-c — News, Portfolio, Watchlist, AI Analyst views (frontend agent)
Files you own: `src/components/views/news-view.tsx`, `src/components/views/portfolio-view.tsx`, `src/components/views/watchlist-view.tsx`, `src/components/views/analyst-view.tsx` (+ per-view subfolders if needed).
- NewsView: filter chips (All / Macro only / per-sentiment: Bullish/Bearish/Neutral), symbol filter dropdown; feed of news cards (headline, summary, source, time-ago, sentiment badge colored by score, impact badge, symbol chip clickable → openStock); "AI Summary" button per card → POST /api/news/[id]/ai-summary, expandable result with shimmer loading; GET /api/news?limit=40. Refetch 60s.
- PortfolioView: summary stat cards (Total Value, Day Change $/%, Total P&L $/%, Cash available, Positions); performance chart (GET /api/portfolio/history?days=30 → Recharts AreaChart); allocation donut (Recharts PieChart with legend) by holding; holdings table (Symbol, Qty, Avg Cost, Price(live), Mkt Value, Day Change, P&L $, P&L %, allocation bar, Trade button → openTrade(symbol), click row → openStock); transactions list (GET from portfolio response) with side badge; Trade button in header. GET /api/portfolio, refetch 15s + on window focus.
- WatchlistView: grid of watch cards (live price + flash, ChangeBadge, sparkline, day H/L, volume, note, alert inputs: above/below price with save (PATCH), triggered alert shows amber badge + toast once); remove button (DELETE + optimistic update); "Add symbol" combobox (GET /api/search?q= debounced) POST /api/watchlist. GET /api/watchlist refetch 15s. Empty state with CTA to Markets.
- AnalystView: chat interface — messages list (user right/emerald, assistant left, markdown rendered via react-markdown), suggested prompt chips ("Analyze my portfolio", "What's moving the market today?", "Compare AAPL and MSFT", "Explain the Fear & Greed gauge"), input + send (POST /api/chat {sessionId from localStorage 'sns-chat-session', message}), loading dots animation, session persists via GET /api/chat?sessionId= on mount. Context chips showing what the AI sees (watchlist count, portfolio value). Clear chat (localStorage new id + local state).

## Frontend contracts (built by Task 1-c — AVAILABLE NOW)
- `src/stores/market-store.ts` (Zustand): `useMarketStore` — { quotes: Record<string, {p:number,c:number,v:number,t:number}>, connected: boolean, lastTickAt: number|null, flash: Record<string, 'up'|'down'>, applyTick(tickData) } — subscribes to WS in a provider; components read `useMarketStore(s => s.quotes['AAPL'])`.
- `src/stores/ui-store.ts`: `useUIStore` — { activeView: 'dashboard'|'markets'|'news'|'portfolio'|'watchlist'|'analyst', selectedSymbol: string|null, detailOpen: boolean, tradeSymbol: string|null, tradeOpen: boolean, setView(v), openStock(symbol) (sets selectedSymbol, detailOpen=true), closeStock(), openTrade(symbol), closeTrade() }.
- `src/components/shared/` — `ChangeBadge` ({value: number, pct?: boolean, size?}), `PriceCell` ({symbol, basePrice} live w/ flash), `Sparkline` ({data:number[], width,height, positive}), `StockAvatar` ({symbol,size}), `SentimentBadge` ({score/label}), `ImpactBadge`, `AiBadge`, `SectionHeading`, `SkeletonTable`.
- `src/lib/format.ts` — fmtUSD, fmtNum, fmtCompact, fmtPct, fmtSigned, timeAgo, priceColor(pct) ('text-emerald-600'/'text-red-600').
- `src/lib/api.ts` — typed fetch helpers: `api.get<T>(path)`, `api.post<T>(path, body)` throwing {message} on !ok.
- Page structure: `src/app/page.tsx` renders shell with view switching (AnimatePresence) + global StockDetailDialog + TradeDialog mounted at root. Views are lazy-imported via next/dynamic where sensible.
- QueryClient default staleTime 15s. Toaster (sonner) configured.

## Verification process (all agents)
- `bun run lint` must pass.
- Check `/home/z/my-project/dev.log` tail for runtime errors after touching pages.
- Backend agent: curl-test each endpoint. Frontend agents: after your files exist, ask main agent for integration check (main runs agent-browser at the end).

---
Task ID: 1-b
Agent: ws-ticker-service
Task: WebSocket market-ticker mini-service (socket.io on port 3003, broadcasting live engine ticks every 2s)

Work Log:
- Created `mini-services/market-ticker/package.json` (name market-ticker, private, type module, dev script `bun --hot index.ts`, dependency socket.io ^4.8.1) and ran `bun install` there (resolved socket.io@4.8.4, own node_modules + lockfile inside the mini-service).
- Created `mini-services/market-ticker/index.ts` modeled on `examples/websocket/server.ts`: socket.io Server with path '/', cors origin '*', methods GET/POST, pingTimeout 60000, pingInterval 25000, PORT fixed at 3003.
- Engine imported RELATIVELY: `import { getLiveTicks } from '../../src/lib/market/engine'`. Verified engine is dependency-free TS (only imports ./universe) and bun imports it fine from the mini-service folder — `bun -e` smoke test returned 46 ticks (AAPL/MSFT/NVDA with price/changePct/volume).
- On connection: emits 'snapshot' { t: Date.now(), ticks: getLiveTicks() }; `setInterval(2000)` broadcasts io.emit('tick', { t, ticks }) — payload shape { t: number, ticks: { symbol, p, c, v }[] } with p=price, c=changePct, v=volume.
- Connected-clients count logged on connect/disconnect using `io.sockets.sockets.size` (accurate at both moments; `io.engine.clientsCount` lags on client-initiated disconnects — verified in engine.io/socket.io source).
- Graceful shutdown on SIGTERM/SIGINT: clearInterval + io.close + httpServer.close + exit 0. Tested live: `kill -TERM` produced "Received SIGTERM … WebSocket server closed" and freed port 3003 cleanly.
- Started service in background: `cd mini-services/market-ticker && (nohup bun run dev > /tmp/market-ticker.log 2>&1 &)`. Startup log confirms port 3003 + engine import OK.
- Added `socket.io-client@4.8.4` to the MAIN project deps (it was missing; `cd /home/z/my-project && bun add socket.io-client`) so the throwaway test client (and later the frontend market-store) can use it.
- Wrote throwaway client `/tmp/ticker-test.ts` (socket.io-client → http://localhost:3003, direct localhost for this internal test only) and ran it with bun from the main project folder: connects, receives 'snapshot' + 2 × 'tick', prints first 3 ticks of each payload, sanity-checks field types, exits 0.

Stage Summary:
- Service RUNNING: pid 2565 (`bun --hot index.ts`), listening on *:3003, log at /tmp/market-ticker.log. Do NOT kill it.
- How to run: `cd mini-services/market-ticker && bun install && (nohup bun run dev > /tmp/market-ticker.log 2>&1 &)`.
- Verification evidence (client output): SNAPSHOT 46 ticks on connect; TICK #1 t=05:48:02.793Z, TICK #2 t=05:48:04.793Z (exactly 2000ms cadence), sanity PASS ×2, exit 0. Sample: `AAPL p=196.14 c=-2.25% v=30751536 | MSFT p=456.75 c=-0.29% | NVDA p=140.39 c=-0.7%` — symbols/prices/changePct/volume all sensible, and prices jitter between ticks (live feel confirmed).
- Log shows accurate connection accounting: "Client connected … (connected clients: 1)" → "Client disconnected … (connected clients: 0)".
- Determinism note: this service imports the SAME engine as the Next.js API via relative path, so prices are IDENTICAL across API + WS at the same wall-clock time.
- Browser/frontend integration contract: connect with `io('/?XTransformPort=3003')` (Caddy :81 → localhost:3003), events 'snapshot' (on connect) and 'tick' (every 2s), payload { t: number, ticks: { symbol, p, c, v }[] }.
- `bun run lint` passes (exit 0). No files outside `mini-services/market-ticker/` were created/modified except: main package.json + bun.lock (added socket.io-client, as instructed) and this worklog append. /tmp/ticker-test.ts kept for re-verification (`cd /home/z/my-project && bun /tmp/ticker-test.ts`).

---
Task ID: 1-a
Agent: backend-api
Task: Implemented all 17 Next.js API routes under src/app/api/** per the Task 1-a contract, plus shared portfolio logic (src/lib/portfolio.ts) and server-only LLM/watchlist helpers (src/app/api/_lib/).

Work Log:
- Read worklog contract + engine/news/universe/types/db sources; confirmed dev server on :3000 and z-ai-web-dev-sdk types.
- Created `src/lib/portfolio.ts` — foldTransactions (avg-cost method, CASH_SEED=100000, fee=0.99 only affects cash), computePortfolio (summary/holdings/last-50 txns), computeHistorySeries (daily value via EOD cash cutoffs + getCloseOn, final live point), toTransactionDTO.
- Created `src/app/api/_lib/llm.ts` — llmComplete() (system prompt as first 'assistant' msg, optional history, thinking disabled) + stripCodeFences/safeJsonParse; `_lib/watchlist.ts` — toWatchItemDTO with computed alertAboveHit/alertBelowHit.
- Implemented routes: market/overview, stocks (search/sector/sort/order/limit), stocks/[symbol] (+404), stocks/[symbol]/candles (range whitelist, default 1D, +400), news (ensureNews first, publishedAt<=now, symbol filter, limit/offset, symbolName join), news/[id]/ai-summary (POST LLM→strict-JSON {summary,sentiment,impact}, cache in NewsItem.aiSummary, 200+fallback:true on LLM failure, GET cached), watchlist GET/POST + [symbol] PATCH/DELETE, portfolio GET, portfolio/trade POST (BUY cash check, SELL owned-qty check, price=live or provided, returns updated PortfolioDTO), portfolio/transaction/[id] DELETE, portfolio/history (days 1-365 default 30), analysis/[symbol] POST (TTL cache ANALYSIS_TTL_MS, context: quote+fundamentals+1M trend stats+sector+3 headlines, regex parse Rating/Score/Price Target, 503 on LLM failure) + GET (latest or {report:null}), chat POST (save user msg, context block: 3 gainers/3 losers + watchlist + portfolio holdings + mentioned-stock quotes/fundamentals, last-10 history, save+return reply, 503 on failure) + GET (last 50 asc), search, health. All with `export const dynamic = 'force-dynamic'`, `await params` (Next 16 Promise params), and { error } JSON on 400/404/500/503.
- Fixed 2 bugs found while testing: relative imports of _lib helpers (switched to '@/app/api/_lib/...' alias) and a `sessionId` redeclaration in chat POST.
- curl-tested every endpoint incl. full portfolio flow (BUY 2 AAPL → GET → invalid SELL 400), LLM endpoints for real (ai-summary ~2s, analysis ~5.5s, chat ~1-2.5s), caching behavior, idempotency of ensureNews (count stable at 54 across calls), and error paths. `bun run lint` passes; `tsc --noEmit` clean for my files.

Stage Summary:
- All 17 contract endpoints live on :3000 and verified: overview, stocks list/detail/candles, news list/ai-summary, watchlist CRUD, portfolio/trade/transaction-delete/history, analysis POST+GET, chat POST+GET, search, health.
- ensureNews refinement (deliberate, within contract intent): skips a dateKey when the FULL generated set exists (count >= generated length) instead of "any row exists", because the seeder had inserted only today's already-published items — this backfills the rest of the day's slots once; upserts use update:{} so existing rows are never mutated; verified idempotent.
- Response shapes for frontend agents: /api/portfolio, /api/portfolio/trade and /api/portfolio/transaction/[id] return the PortfolioDTO DIRECTLY ({summary,holdings,transactions}); watchlist items include extra computed alertAboveHit/alertBelowHit booleans; POST /api/news/[id]/ai-summary returns {summary,sentiment,impact} (+cached:true on cache hit, +fallback:true if LLM down); analysis returns {report}; chat returns {reply}; news list/news history/search keep the contract wrappers.
- Notes: (1) test trade BUY 2 AAPL @ ~196.49 remains as the 9th transaction (per instructed test flow) — portfolio: 7 positions, cash ≈ $45.5K. (2) Cached demo data available: AAPL report (HOLD 6/10, $185-$215) and MSFT report (HOLD 7/10, $440-$480), one news aiSummary (item 27), chat session 'test-session-1' with 2 turns. (3) avgCost/costBasis exclude fees (display convention); fees only reduce cash. (4) LLM sentiment/impact are not persisted on ai-summary cache hits (only summary text stored per contract) — cache hits return the item's stored sentiment/impact.
