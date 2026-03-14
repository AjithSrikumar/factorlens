"use client"

import { useState } from "react"
import {
  ComposedChart,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  PieChart,
  Pie,
  Cell,
  TooltipProps,
  BarChart,
  Bar,
  LabelList,
} from "recharts"
import { format, parseISO } from "date-fns"
import { ChevronDown, ChevronRight } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { FYRawRow } from "@/lib/calculations"

interface NavPoint {
  date: string
  value: number
}

interface DrawdownPoint {
  date: string
  value: number
}

interface RollingReturn {
  date: string
  value: number
}

// Sample every Nth point for performance
function sampleData<T>(data: T[], targetPoints: number): T[] {
  if (data.length <= targetPoints) return data
  const step = Math.ceil(data.length / targetPoints)
  const sampled: T[] = []
  for (let i = 0; i < data.length; i += step) sampled.push(data[i])
  if (sampled[sampled.length - 1] !== data[data.length - 1]) sampled.push(data[data.length - 1])
  return sampled
}

function formatDate(dateStr: string) {
  try { return format(parseISO(dateStr), "MMM ''yy") } catch { return dateStr }
}

// Premium custom tooltip
function CustomTooltip({
  active,
  payload,
  label,
  formatter,
}: TooltipProps<number, string> & { formatter?: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover/95 border border-border/60 rounded-xl shadow-xl px-3.5 py-2.5 text-xs backdrop-blur-sm">
      <p className="text-muted-foreground mb-1.5 font-medium">{formatDate(label)}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: p.color }}
          />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold font-mono ml-auto pl-2" style={{ color: p.color }}>
            {formatter ? formatter(p.value as number) : (p.value as number).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Merge two data series by date with forward-fill for unmatched benchmark dates
function mergeSeries(data: any[], benchmarkData?: any[]): any[] {
  if (!benchmarkData || benchmarkData.length === 0) return data

  const sorted = [...benchmarkData].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const bMap = new Map<string, number>()
  sorted.forEach(p => bMap.set(String(p.date).trim(), p.value))
  const bDates = sorted.map(p => String(p.date).trim())

  return data.map(p => {
    const key = String(p.date).trim()
    let val = bMap.get(key)
    if (val === undefined) {
      let lo = 0, hi = bDates.length - 1, found = -1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (bDates[mid] <= key) { found = mid; lo = mid + 1 }
        else hi = mid - 1
      }
      val = found >= 0 ? sorted[found].value : sorted[0]?.value
    }
    return { ...p, benchmark: val ?? null }
  })
}

// Shared axis tick style
const axisTick = { fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }
const gridStroke = "hsl(var(--border))"

export function NavChart({
  data,
  benchmarkData,
  name = "Portfolio",
  benchmarkName = "Nifty 50",
}: {
  data: NavPoint[]
  benchmarkData?: NavPoint[]
  name?: string
  benchmarkName?: string
}) {
  const hasBenchmark = benchmarkData && benchmarkData.length > 0
  const merged = mergeSeries(data, benchmarkData)
  const sampled = sampleData(merged, 400)

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={sampled} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="navGradLight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} strokeOpacity={0.6} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={60}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `₹${v.toFixed(0)}`}
          width={52}
        />
        <Tooltip content={<CustomTooltip formatter={(v) => `₹${v.toFixed(2)}`} />} />
        <Legend
          verticalAlign="top"
          height={32}
          iconType="plainline"
          iconSize={16}
          wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke="#4f46e5"
          strokeWidth={2.5}
          fill="url(#navGradLight)"
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
        />
        {hasBenchmark && (
          <Line
            type="monotone"
            dataKey="benchmark"
            name={benchmarkName}
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function DrawdownChart({
  data,
  benchmarkData,
  name = "Portfolio",
  benchmarkName = "Nifty 50",
}: {
  data: DrawdownPoint[]
  benchmarkData?: DrawdownPoint[]
  name?: string
  benchmarkName?: string
}) {
  const hasBenchmark = benchmarkData && benchmarkData.length > 0
  const merged = mergeSeries(data, benchmarkData)
  const sampled = sampleData(merged, 400)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={sampled} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} strokeOpacity={0.6} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={60}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          width={44}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
        <Tooltip content={<CustomTooltip formatter={(v) => `${v.toFixed(2)}%`} />} />
        {hasBenchmark && (
          <Legend verticalAlign="top" height={32} iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
        )}
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke="#ef4444"
          strokeWidth={1.5}
          fill="url(#ddGrad)"
          dot={false}
        />
        {hasBenchmark && (
          <Line
            type="monotone"
            dataKey="benchmark"
            name={benchmarkName}
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function RollingReturnChart({
  data,
  benchmarkData,
  name = "Portfolio",
  benchmarkName = "Nifty 50",
}: {
  data: RollingReturn[]
  benchmarkData?: RollingReturn[]
  name?: string
  benchmarkName?: string
}) {
  const hasBenchmark = benchmarkData && benchmarkData.length > 0
  const merged = mergeSeries(data, benchmarkData)
  const sampled = sampleData(merged, 400)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={sampled} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} strokeOpacity={0.6} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={60}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          width={44}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 4" />
        <Tooltip content={<CustomTooltip formatter={(v) => `${v.toFixed(2)}%`} />} />
        {hasBenchmark && (
          <Legend verticalAlign="top" height={32} iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
        )}
        <Line
          type="monotone"
          dataKey="value"
          name={name}
          stroke="#0d9488"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
        />
        {hasBenchmark && (
          <Line
            type="monotone"
            dataKey="benchmark"
            name={benchmarkName}
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

const PIE_COLORS = [
  "#4f46e5", "#0d9488", "#7c3aed", "#d97706",
  "#059669", "#dc2626", "#0284c7", "#9333ea",
  "#16a34a", "#ea580c"
]

export function AllocationPieChart({ data }: { data: { name: string; weight: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={95}
          dataKey="weight"
          nameKey="name"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => [`${v}%`, "Allocation"]}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            fontSize: 12,
          }}
        />
        <Legend
          formatter={(value) => (
            <span style={{ fontSize: 11, fontFamily: "var(--font-sans)" }}>
              {value.length > 22 ? value.slice(0, 22) + "…" : value}
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ── Fiscal Year Returns Chart ──────────────────────────────────────────────

function findFloorNav(
  sortedDates: string[],
  navMap: Map<string, number>,
  targetDate: string
): number | null {
  let lo = 0, hi = sortedDates.length - 1, result = -1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (sortedDates[mid] <= targetDate) { result = mid; lo = mid + 1 }
    else hi = mid - 1
  }
  if (result === -1) return null
  return navMap.get(sortedDates[result]) ?? null
}

function findCeilNav(
  sortedDates: string[],
  navMap: Map<string, number>,
  targetDate: string
): number | null {
  let lo = 0, hi = sortedDates.length - 1, result = -1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (sortedDates[mid] >= targetDate) { result = mid; hi = mid - 1 }
    else lo = mid + 1
  }
  if (result === -1) return null
  return navMap.get(sortedDates[result]) ?? null
}

interface FYReturn {
  fy: string
  value: number
  isLive: boolean
}

function computeFYReturns(nav: NavPoint[], today: string): FYReturn[] {
  if (nav.length === 0) return []
  const sorted = [...nav].sort((a, b) => a.date.localeCompare(b.date))
  const navMap = new Map(sorted.map(p => [p.date, p.value]))
  const sortedDates = sorted.map(p => p.date)
  const firstDate = sortedDates[0]

  const todayYear = parseInt(today.slice(0, 4))
  const todayMonth = parseInt(today.slice(5, 7))
  const currentFYYear = todayMonth >= 4 ? todayYear + 1 : todayYear

  const results: FYReturn[] = []
  for (let fyYear = 2006; fyYear <= currentFYYear; fyYear++) {
    const fyStart = `${fyYear - 1}-04-01`
    const fyEnd = `${fyYear}-03-31`
    if (firstDate > fyEnd) continue

    const isLive = fyEnd > today
    const effectiveEnd = isLive ? today : fyEnd
    const effectiveStart = fyStart < firstDate ? firstDate : fyStart

    const startVal = findCeilNav(sortedDates, navMap, effectiveStart)
    const endVal = findFloorNav(sortedDates, navMap, effectiveEnd)

    if (startVal === null || endVal === null || startVal === 0) continue

    const ret = ((endVal / startVal) - 1) * 100
    results.push({ fy: `FY${fyYear.toString().slice(2)}`, value: parseFloat(ret.toFixed(1)), isLive })
  }
  return results
}

interface FYChartRow {
  fy: string
  fund: number | null
  benchmark: number | null
  isLive: boolean
}

export function FiscalYearChart({
  fundNav,
  benchmarkNav,
  fundName = "Fund",
  benchmarkName = "NIFTY 50",
}: {
  fundNav: NavPoint[]
  benchmarkNav: NavPoint[]
  fundName?: string
  benchmarkName?: string
}) {
  const today = new Date().toISOString().slice(0, 10)
  const fundReturns = computeFYReturns(fundNav, today)
  const benchReturns = computeFYReturns(benchmarkNav, today)

  const bMap = new Map(benchReturns.map(r => [r.fy, r]))
  const fMap = new Map(fundReturns.map(r => [r.fy, r]))

  const allFYs = new Set([...fundReturns.map(r => r.fy), ...benchReturns.map(r => r.fy)])
  const sortedFYs = Array.from(allFYs).sort()

  const data: FYChartRow[] = sortedFYs.map(fy => {
    const f = fMap.get(fy)
    const b = bMap.get(fy)
    return {
      fy,
      fund: f?.value ?? null,
      benchmark: b?.value ?? null,
      isLive: f?.isLive || b?.isLive || false,
    }
  })

  const hasLive = data.some(d => d.isLive)
  const todayParts = today.split("-").map(Number)
  const liveFYYear = todayParts[1] >= 4 ? todayParts[0] + 1 : todayParts[0]
  const liveFYLabel = `FY${String(liveFYYear).slice(2)}`
  const chartHeight = Math.max(320, data.length * 40 + 60)

  const CustomFYTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const row = data.find(d => d.fy === label)
    return (
      <div className="bg-popover/95 border border-border/60 rounded-xl shadow-xl px-3.5 py-2.5 text-xs backdrop-blur-sm">
        <p className="font-bold mb-1.5">{label}{row?.isLive ? " (live)" : ""}</p>
        {payload.map((p: any) => (
          p.value !== null && (
            <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
              <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
              <span className="text-muted-foreground">{p.name}:</span>
              <span className="font-bold font-mono ml-auto pl-2" style={{ color: p.fill }}>
                {p.value > 0 ? "+" : ""}{p.value?.toFixed(1)}%
              </span>
            </div>
          )
        ))}
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 54, left: 4, bottom: 4 }}
          barSize={12}
          barGap={2}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} strokeOpacity={0.5} />
          <XAxis
            type="number"
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            tick={{ ...axisTick, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="fy"
            tick={({ x, y, payload }) => {
              const row = data.find(d => d.fy === payload.value)
              const fill = row?.isLive ? "#f59e0b" : "hsl(var(--foreground))"
              return (
                <text x={x} y={y} dy={4} textAnchor="end" fontSize={10} fontWeight={row?.isLive ? 600 : 500} fill={fill} fontFamily="var(--font-mono)">
                  {payload.value}{row?.isLive ? "*" : ""}
                </text>
              )
            }}
            width={36}
          />
          <ReferenceLine x={0} stroke="hsl(var(--border))" />
          <Tooltip content={<CustomFYTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
          <Legend verticalAlign="top" height={28} iconType="square" wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="fund" name={fundName} fill="#4f46e5" radius={[0, 3, 3, 0]}>
            <LabelList
              dataKey="fund"
              position="right"
              formatter={(v: number | null) => v !== null ? `${v > 0 ? "+" : ""}${v?.toFixed(0)}%` : ""}
              style={{ fontSize: 9, fill: "#6366f1", fontFamily: "var(--font-mono)" }}
            />
          </Bar>
          <Bar dataKey="benchmark" name={benchmarkName} fill="#94a3b8" radius={[0, 3, 3, 0]}>
            <LabelList
              dataKey="benchmark"
              position="right"
              formatter={(v: number | null) => v !== null ? `${v > 0 ? "+" : ""}${v?.toFixed(0)}%` : ""}
              style={{ fontSize: 9, fill: "#64748b", fontFamily: "var(--font-mono)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {hasLive && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center mt-1 font-medium">
          * {liveFYLabel} is live (year-to-date through {today})
        </p>
      )}
    </div>
  )
}

// ── Fiscal Year Detail Cards ───────────────────────────────────────────────

interface FYTableFund {
  id: number
  name: string
}

interface FYTableData {
  portfolio: FYRawRow[]
  funds: Record<number, FYRawRow[]>
  benchmark: FYRawRow[]
}

function fmtVal(v: number): string {
  return v.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function fmtDate(d: string): string {
  try { return format(parseISO(d), "dd MMM yyyy") } catch { return d }
}

function fmtRet(v: number): React.ReactNode {
  const cls = v >= 0
    ? "text-emerald-600 dark:text-emerald-400 font-bold"
    : "text-red-600 dark:text-red-400 font-bold"
  return <span className={cls}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>
}

export function FiscalYearDetailCards({
  fyTableData,
  funds,
  benchmarkName = "NIFTY 50",
  primaryLabel = "Portfolio",
}: {
  fyTableData: FYTableData
  funds: FYTableFund[]
  benchmarkName?: string
  primaryLabel?: string
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const today = new Date().toISOString().slice(0, 10)
  const todayParts = today.split("-").map(Number)
  const liveFYYear = todayParts[1] >= 4 ? todayParts[0] + 1 : todayParts[0]
  const liveFYLabel = `FY${String(liveFYYear).slice(2)}`

  const primaryMap = new Map(fyTableData.portfolio.map(r => [r.fy, r]))
  const benchmarkMap = new Map(fyTableData.benchmark.map(r => [r.fy, r]))
  const fundMaps = Object.fromEntries(
    funds.map(f => [f.id, new Map((fyTableData.funds[f.id] ?? []).map(r => [r.fy, r]))])
  )

  const allFYs = new Set<string>()
  fyTableData.portfolio.forEach(r => allFYs.add(r.fy))
  fyTableData.benchmark.forEach(r => allFYs.add(r.fy))
  Object.values(fyTableData.funds).forEach(rows => rows.forEach(r => allFYs.add(r.fy)))
  const sortedFYs = Array.from(allFYs).sort().reverse()

  const hasSubFunds = funds.length > 0

  const toggleRow = (fy: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(fy) ? next.delete(fy) : next.add(fy)
      return next
    })
  }

  return (
    <div className="space-y-2">
      {sortedFYs.map(fy => {
        const portRow = primaryMap.get(fy)
        const benchRow = benchmarkMap.get(fy)
        const isLive = portRow?.isLive || benchRow?.isLive || false
        const isOpen = expanded.has(fy)
        const hasFundData = hasSubFunds && funds.some(f => fundMaps[f.id]?.has(fy))
        const outperformance = portRow && benchRow ? portRow.returnPct - benchRow.returnPct : null
        const isClickable = hasSubFunds && hasFundData

        return (
          <div
            key={fy}
            className={`rounded-xl border overflow-hidden ${
              isLive ? "border-amber-300/60 dark:border-amber-700/40" : "border-border/60"
            }`}
          >
            {/* Card Header */}
            <div
              className={`flex items-center justify-between px-4 py-2.5 ${
                isLive ? "bg-amber-50/60 dark:bg-amber-900/10" : "bg-muted/25"
              } ${isClickable ? "cursor-pointer hover:bg-muted/40 transition-colors" : ""}`}
              onClick={isClickable ? () => toggleRow(fy) : undefined}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold font-mono ${isLive ? "text-amber-600 dark:text-amber-400" : ""}`}>
                  {fy}
                </span>
                {isLive && (
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-full px-2 py-0.5 font-semibold">
                    live
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(portRow || benchRow) && (
                  <span className="text-[11px] text-muted-foreground hidden sm:block font-mono">
                    {fmtDate((portRow ?? benchRow)!.startDate)} – {fmtDate((portRow ?? benchRow)!.endDate)}
                  </span>
                )}
                {isClickable && (
                  isOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            </div>

            {/* Date range — mobile only */}
            {(portRow || benchRow) && (
              <div className="sm:hidden px-4 pt-2 text-[10px] text-muted-foreground font-mono">
                {fmtDate((portRow ?? benchRow)!.startDate)} – {fmtDate((portRow ?? benchRow)!.endDate)}
              </div>
            )}

            {/* Card Body */}
            <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide mb-1">Start NAV</p>
                <p className="text-sm font-mono font-semibold">
                  {portRow ? fmtVal(portRow.startValue) : benchRow ? fmtVal(benchRow.startValue) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide mb-1">End NAV</p>
                <p className="text-sm font-mono font-semibold">
                  {portRow ? fmtVal(portRow.endValue) : benchRow ? fmtVal(benchRow.endValue) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide mb-1">{primaryLabel} Return</p>
                <p className="text-base">
                  {portRow ? fmtRet(portRow.returnPct) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide mb-1">{benchmarkName} Return</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-base">
                    {benchRow ? fmtRet(benchRow.returnPct) : "—"}
                  </p>
                  {outperformance !== null && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      outperformance >= 0
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                    }`}>
                      {outperformance >= 0 ? "+" : ""}{outperformance.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded: individual fund sub-rows */}
            {isOpen && funds.map(fund => {
              const fRow = fundMaps[fund.id]?.get(fy)
              if (!fRow) return null
              return (
                <div
                  key={fund.id}
                  className="border-t border-border/40 px-4 py-2.5 bg-muted/10 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                      ↳ {fund.name}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Start → End NAV</p>
                    <p className="text-xs font-mono">{fmtVal(fRow.startValue)} → {fmtVal(fRow.endValue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Return</p>
                    <p className="text-sm">{fmtRet(fRow.returnPct)}</p>
                  </div>
                  <div className="sm:hidden">
                    <p className="text-[10px] text-muted-foreground mb-0.5">NAV</p>
                    <p className="text-xs font-mono">{fmtVal(fRow.startValue)} → {fmtVal(fRow.endValue)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
      {sortedFYs.some(fy => primaryMap.get(fy)?.isLive || benchmarkMap.get(fy)?.isLive) && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center font-medium pt-1">
          * {liveFYLabel} is live — year-to-date through {fmtDate(today)}
        </p>
      )}
    </div>
  )
}

export function FiscalYearTable({
  fyTableData,
  funds,
  benchmarkName = "NIFTY 50",
}: {
  fyTableData: FYTableData
  funds: FYTableFund[]
  benchmarkName?: string
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const today = new Date().toISOString().slice(0, 10)
  const todayParts = today.split("-").map(Number)
  const liveFYYear = todayParts[1] >= 4 ? todayParts[0] + 1 : todayParts[0]
  const liveFYLabel = `FY${String(liveFYYear).slice(2)}`

  const portfolioMap = new Map(fyTableData.portfolio.map(r => [r.fy, r]))
  const benchmarkMap = new Map(fyTableData.benchmark.map(r => [r.fy, r]))

  const allFYs = new Set<string>()
  fyTableData.portfolio.forEach(r => allFYs.add(r.fy))
  Object.values(fyTableData.funds).forEach(rows => rows.forEach(r => allFYs.add(r.fy)))
  const sortedFYs = Array.from(allFYs).sort()

  const fundMaps = Object.fromEntries(
    funds.map(f => [f.id, new Map((fyTableData.funds[f.id] ?? []).map(r => [r.fy, r]))])
  )

  const toggleRow = (fy: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(fy) ? next.delete(fy) : next.add(fy)
      return next
    })
  }

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-8 px-2 sticky left-0 z-20 bg-muted/30" />
              <TableHead className="text-[10px] font-bold uppercase tracking-widest sticky left-8 z-20 bg-muted/30 whitespace-nowrap">FY</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Start Date</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-right whitespace-nowrap">Start NAV</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">End Date</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-right whitespace-nowrap">End NAV</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-right whitespace-nowrap">Portfolio</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-right whitespace-nowrap">{benchmarkName}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedFYs.map(fy => {
              const portRow = portfolioMap.get(fy)
              const benchRow = benchmarkMap.get(fy)
              const isLive = portRow?.isLive || false
              const isOpen = expanded.has(fy)

              return (
                <>
                  <TableRow
                    key={fy}
                    className={`cursor-pointer hover:bg-muted/20 transition-colors ${isLive ? "bg-amber-50/30 dark:bg-amber-900/10" : ""}`}
                    onClick={() => toggleRow(fy)}
                  >
                    <TableCell className="px-2 py-2 sticky left-0 z-10 bg-background">
                      {isOpen
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="py-2.5 sticky left-8 z-10 bg-background whitespace-nowrap">
                      <span className={`text-sm font-bold font-mono ${isLive ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {fy}{isLive ? " *" : ""}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-muted-foreground font-mono">
                      {portRow ? fmtDate(portRow.startDate) : benchRow ? fmtDate(benchRow.startDate) : "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-right font-mono">
                      {portRow ? fmtVal(portRow.startValue) : "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-muted-foreground font-mono">
                      {portRow ? fmtDate(portRow.endDate) : benchRow ? fmtDate(benchRow.endDate) : "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-right font-mono">
                      {portRow ? fmtVal(portRow.endValue) : "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      {portRow ? fmtRet(portRow.returnPct) : "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      {benchRow ? fmtRet(benchRow.returnPct) : "—"}
                    </TableCell>
                  </TableRow>

                  {isOpen && funds.map(fund => {
                    const fRow = fundMaps[fund.id]?.get(fy)
                    if (!fRow) return null
                    return (
                      <TableRow key={`${fy}-${fund.id}`} className="bg-muted/10 hover:bg-muted/20">
                        <TableCell className="px-2 py-1.5" />
                        <TableCell className="py-1.5">
                          <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 pl-3">
                            ↳ {fund.name}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 text-[11px] text-muted-foreground font-mono">
                          {fmtDate(fRow.startDate)}
                        </TableCell>
                        <TableCell className="py-1.5 text-[11px] text-right font-mono">
                          {fmtVal(fRow.startValue)}
                        </TableCell>
                        <TableCell className="py-1.5 text-[11px] text-muted-foreground font-mono">
                          {fmtDate(fRow.endDate)}
                        </TableCell>
                        <TableCell className="py-1.5 text-[11px] text-right font-mono">
                          {fmtVal(fRow.endValue)}
                        </TableCell>
                        <TableCell className="py-1.5 text-right">
                          {fmtRet(fRow.returnPct)}
                        </TableCell>
                        <TableCell className="py-1.5" />
                      </TableRow>
                    )
                  })}
                </>
              )
            })}
          </TableBody>
        </Table>
        {sortedFYs.some(fy => portfolioMap.get(fy)?.isLive) && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center py-2 border-t border-border/40 font-medium">
            * {liveFYLabel} is live — year-to-date through {fmtDate(today)}
          </p>
        )}
      </div>
    </div>
  )
}
