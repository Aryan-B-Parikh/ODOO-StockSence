/**
 * StockSense — market-ticker WebSocket mini-service
 *
 * Broadcasts live simulated market ticks (from the deterministic engine
 * `src/lib/market/engine.ts`, imported via a RELATIVE path so this pure-Bun
 * service and the Next.js API produce IDENTICAL prices at the same time).
 *
 *  - New connection  → 'snapshot' { t, ticks }  (immediate full snapshot)
 *  - Every 2000ms    → 'tick'     { t, ticks }  (broadcast to all clients)
 *
 * Payload shape: { t: number, ticks: { symbol: string, p: number, c: number, v: number }[] }
 *   p = price, c = changePct (%), v = volume
 */

import { createServer } from 'http'
import { Server } from 'socket.io'
import { getLiveTicks } from '../../src/lib/market/engine'

interface Tick {
  symbol: string
  p: number
  c: number
  v: number
}

interface TickPayload {
  t: number
  ticks: Tick[]
}

const PORT = 3003
const TICK_INTERVAL_MS = 2000

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  // io.sockets.sockets.size is accurate at connect AND disconnect time
  // (io.engine.clientsCount lags on client-initiated disconnects)
  console.log(`[market-ticker] Client connected: ${socket.id} (connected clients: ${io.sockets.sockets.size})`)

  // Immediate snapshot for the newly connected client
  socket.emit('snapshot', { t: Date.now(), ticks: getLiveTicks() } satisfies TickPayload)

  socket.on('disconnect', (reason) => {
    console.log(
      `[market-ticker] Client disconnected: ${socket.id} reason=${reason} (connected clients: ${io.sockets.sockets.size})`
    )
  })

  socket.on('error', (error) => {
    console.error(`[market-ticker] Socket error (${socket.id}):`, error)
  })
})

// Broadcast live ticks to all clients every 2 seconds
const tickerInterval = setInterval(() => {
  io.emit('tick', { t: Date.now(), ticks: getLiveTicks() } satisfies TickPayload)
}, TICK_INTERVAL_MS)

httpServer.listen(PORT, () => {
  const ticks = getLiveTicks()
  const sample = ticks
    .slice(0, 3)
    .map((t) => `${t.symbol} $${t.p.toFixed(2)} (${t.c >= 0 ? '+' : ''}${t.c.toFixed(2)}%)`)
    .join(', ')
  console.log(
    `[market-ticker] WebSocket service running on port ${PORT} — broadcasting ${ticks.length} symbols every ${TICK_INTERVAL_MS}ms`
  )
  console.log(`[market-ticker] Engine import OK, sample: ${sample}`)
})

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`[market-ticker] Received ${signal} signal, shutting down...`)
  clearInterval(tickerInterval)
  io.close(() => {
    httpServer.close(() => {
      console.log('[market-ticker] WebSocket server closed')
      process.exit(0)
    })
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
