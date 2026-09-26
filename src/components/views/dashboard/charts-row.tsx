'use client'

import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtUSD, fmtUSDCompact } from '@/lib/format'
import type { DashboardDTO } from '@/lib/types'

import { fadeUp } from './motion'

/** No-blue category palette: emerald · teal · amber · stone · rose · lime. */
const CATEGORY_COLORS = ['#10b981', '#14b8a6', '#f59e0b', '#78716c', '#f43f5e', '#84cc16']

function tickDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function labelDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type CategoryValue = { category: string; value: number }
type Flow = { date: string; received: number; delivered: number }

/** Row 3 — value by category (donut) + 14-day inbound/outbound value flows. */
export function ChartsRow({ valueByCategory, flows }: { valueByCategory: CategoryValue[]; flows: Flow[] }) {
  const totalValue = valueByCategory.reduce((sum, entry) => sum + entry.value, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Donut — stock value by category */}
      <motion.section variants={fadeUp} initial="hidden" animate="visible" aria-label="Stock value by category">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Stock Value by Category</CardTitle>
            <CardDescription>On-hand value split across product categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={valueByCategory}
                    dataKey="value"
                    nameKey="category"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {valueByCategory.map((entry, index) => (
                      <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => fmtUSD(Number(value))}
                    cursor={false}
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              {/* center total */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total</span>
                <span className="text-lg font-semibold tabular">{fmtUSDCompact(totalValue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* Grouped bars — 14-day received vs delivered value */}
      <motion.section variants={fadeUp} initial="hidden" animate="visible" aria-label="14-day inbound vs outbound flows">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Inbound vs Outbound — 14 Days</CardTitle>
            <CardDescription>Value received vs delivered per day (from the ledger)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(iso) => tickDate(String(iso))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickMargin={8}
                    minTickGap={12}
                  />
                  <YAxis
                    tickFormatter={(value) => fmtUSDCompact(Number(value))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    width={52}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
                    formatter={(value) => fmtUSD(Number(value))}
                    labelFormatter={(iso) => labelDate(String(iso))}
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="received" name="Received" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="delivered" name="Delivered" fill="#78716c" radius={[3, 3, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.section>
    </div>
  )
}
