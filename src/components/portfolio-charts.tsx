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

// Custom tooltip
function CustomTooltip({ active, payload, label, formatter }: TooltipProps<number, string> & { formatter?: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="text-muted-foreground mb-1">{formatDate(label)}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {formatter ? formatter(p.value as number) : (p.value as number).toFixed(2)}
        </p>
      ))}
    </div>
  )
}

// Merge two data series by date. Uses forward-fill for unmatched dates so the
// benchmark line always renders across the full chart range.
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
      // Binary-search for the last benchmark date <= key (forward-fill)
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
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={sampled} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `₹${v.toFixed(0)}`}
          width={55}
        />
        <Tooltip content={<CustomTooltip formatter={(v) => `₹${v.toFixed(2)}`} />} />
        <Legend verticalAlign="top" height={36} />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke="#4f46e5"
          strokeWidth={2}
          fill="url(#navGrad)"
          dot={false}
          activeDot={{ r: 4 }}
        />
        {hasBenchmark && (
          <Line
            type="monotone"
            dataKey="benchmark"
            name={benchmarkName}
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function DrawdownChart({ data, benchmarkData, name = "Portfolio", benchmarkName = "Nifty 50" }: { data: DrawdownPoint[], benchmarkData?: DrawdownPoint[], name?: string, benchmarkName?: string }) {
  const hasBenchmark = benchmarkData && benchmarkData.length > 0
  const merged = mergeSeries(data, benchmarkData)
  const sampled = sampleData(merged, 400)

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={sampled} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          width={45}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Tooltip content={<CustomTooltip formatter={(v) => `${v.toFixed(2)}%`} />} />
        {hasBenchmark && <Legend verticalAlign="top" height={36} iconType="plainline" />}
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
            strokeDasharray="4 4"
            dot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function RollingReturnChart({ data, benchmarkData, name = "Portfolio", benchmarkName = "Nifty 50" }: { data: RollingReturn[], benchmarkData?: RollingReturn[], name?: string, benchmarkName?: string }) {
  const hasBenchmark = benchmarkData && benchmarkData.length > 0
  const merged = mergeSeries(data, benchmarkData)
  const sampled = sampleData(merged, 400)

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={sampled} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          width={45}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 4" />
        <Tooltip content={<CustomTooltip formatter={(v) => `${v.toFixed(2)}%`} />} />
        {hasBenchmark && <Legend verticalAlign="top" height={36} iconType="plainline" />}
        <Line
          type="monotone"
          dataKey="value"
          name={name}
          stroke="#0d9488"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        {hasBenchmark && (
          <Line
            type="monotone"
            dataKey="benchmark"
            name={benchmarkName}
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

const PIE_COLORS = ["#4f46e5", "#0d9488", "#7c3aed", "#d97706", "#059669", "#dc2626", "#0284c7", "#9333ea", "#16a34a", "#ea580c"]

export function AllocationPieChart({ data }: { data: { name: string; weight: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          dataKey="weight"
          nameKey="name"
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => [`${v}%`, "Allocation"]} />
        <Legend
          formatter={(value) => <span className="text-xs">{value.length > 20 ? value.slice(0, 20) + "…" : value}</span>}
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
  // Binary search: find last date <= targetDate
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
  // Binary search: find first date >= targetDate
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
  // FY2006 = Apr 2005 – Mar 2006, ..., current FY
  for (let fyYear = 2006; fyYear <= currentFYYear; fyYear++) {
    const fyStart = `${fyYear - 1}-04-01`
    const fyEnd = `${fyYear}-03-31`
    // Skip if fund inception is after the end of this FY
    if (firstDate > fyEnd) continue

    const isLive = fyEnd > today
    const effectiveEnd = isLive ? today : fyEnd

    // For FY start: use the nearest date at or after fyStart (ceil),
    // but cap to the first date of the fund's history
    const effectiveStart = fyStart < firstDate ? firstDate : fyStart

    // FY start: use first trading day ON OR AFTER the target (ceil).
    // Using floor here would return March 31 when April 1 is a weekend,
    // which is the previous FY's last day — causing a one-day overlap bug.
    const startVal = findCeilNav(sortedDates, navMap, effectiveStart)
    // FY end: use last trading day ON OR BEFORE the target (floor).
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

  // Combine all FY years present in either series
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
  // Compute current fiscal year label dynamically (FY = Apr–Mar, e.g. Apr 2025–Mar 2026 = FY26)
  const todayParts = today.split("-").map(Number)
  const liveFYYear = todayParts[1] >= 4 ? todayParts[0] + 1 : todayParts[0]
  const liveFYLabel = `FY${String(liveFYYear).slice(2)}`
  // Height: each row ~38px for horizontal bar chart
  const chartHeight = Math.max(320, data.length * 38 + 60)

  const CustomFYTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const row = data.find(d => d.fy === label)
    return (
      <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-xs">
        <p className="font-bold mb-1">{label}{row?.isLive ? " (live)" : ""}</p>
        {payload.map((p: any) => (
          p.value !== null && (
            <p key={p.dataKey} style={{ color: p.fill }} className="font-medium">
              {p.name}: {p.value > 0 ? "+" : ""}{p.value?.toFixed(1)}%
            </p>
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
          margin={{ top: 4, right: 52, left: 4, bottom: 4 }}
          barSize={13}
          barGap={2}
          barCategoryGap="28%"
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="fy"
            tick={({ x, y, payload }) => {
              const row = data.find(d => d.fy === payload.value)
              // Live year = amber; completed years = foreground (readable on both dark + light)
              const fill = row?.isLive ? "#f59e0b" : "hsl(var(--foreground))"
              return (
                <text x={x} y={y} dy={4} textAnchor="end" fontSize={10} fontWeight={row?.isLive ? 600 : 500} fill={fill}>
                  {payload.value}{row?.isLive ? "*" : ""}
                </text>
              )
            }}
            width={36}
          />
          <ReferenceLine x={0} stroke="hsl(var(--border))" />
          <Tooltip content={<CustomFYTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
          <Legend verticalAlign="top" height={28} iconType="square" wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="fund" name={fundName} fill="#4f46e5" radius={[0, 2, 2, 0]}>
            <LabelList
              dataKey="fund"
              position="right"
              formatter={(v: number | null) => v !== null ? `${v > 0 ? "+" : ""}${v?.toFixed(0)}%` : ""}
              style={{ fontSize: 9, fill: "#4f46e5" }}
            />
          </Bar>
          <Bar dataKey="benchmark" name={benchmarkName} fill="#94a3b8" radius={[0, 2, 2, 0]}>
            <LabelList
              dataKey="benchmark"
              position="right"
              formatter={(v: number | null) => v !== null ? `${v > 0 ? "+" : ""}${v?.toFixed(0)}%` : ""}
              style={{ fontSize: 9, fill: "#64748b" }}
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

// ── Fiscal Year Detail Table ───────────────────────────────────────────────

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
    ? "text-emerald-600 dark:text-emerald-400 font-semibold"
    : "text-red-600 dark:text-red-400 font-semibold"
  return <span className={cls}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>
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

  // Build a map of portfolio FY → row for quick lookup
  const portfolioMap = new Map(fyTableData.portfolio.map(r => [r.fy, r]))
  const benchmarkMap = new Map(fyTableData.benchmark.map(r => [r.fy, r]))

  // Collect all FY labels that appear in portfolio or any fund
  const allFYs = new Set<string>()
  fyTableData.portfolio.forEach(r => allFYs.add(r.fy))
  Object.values(fyTableData.funds).forEach(rows => rows.forEach(r => allFYs.add(r.fy)))
  const sortedFYs = Array.from(allFYs).sort()

  // Per-fund maps
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
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-8 px-2 sticky left-0 z-20 bg-muted/40" />
            <TableHead className="text-xs font-bold uppercase tracking-wide sticky left-8 z-20 bg-muted/40 whitespace-nowrap">Fiscal Year</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide whitespace-nowrap">Starting Date</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-right whitespace-nowrap">Portfolio NAV</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide whitespace-nowrap">Ending Date</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-right whitespace-nowrap">Portfolio NAV</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-right whitespace-nowrap">Portfolio Return</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-right whitespace-nowrap">{benchmarkName} Return</TableHead>
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
                {/* Main FY row */}
                <TableRow
                  key={fy}
                  className={`cursor-pointer hover:bg-muted/30 transition-colors ${isLive ? "bg-amber-50/30 dark:bg-amber-900/10" : ""}`}
                  onClick={() => toggleRow(fy)}
                >
                  <TableCell className="px-2 py-2 sticky left-0 z-10 bg-background">
                    {isOpen
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="py-2 sticky left-8 z-10 bg-background whitespace-nowrap">
                    <span className={`text-sm font-bold ${isLive ? "text-amber-600 dark:text-amber-400" : ""}`}>
                      {fy}{isLive ? " *" : ""}
                    </span>
                    {isLive && (
                      <span className="ml-1.5 text-[10px] text-amber-500 font-medium">(live)</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {portRow ? fmtDate(portRow.startDate) : benchRow ? fmtDate(benchRow.startDate) : "—"}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right font-mono">
                    {portRow ? fmtVal(portRow.startValue) : "—"}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {portRow ? fmtDate(portRow.endDate) : benchRow ? fmtDate(benchRow.endDate) : "—"}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right font-mono">
                    {portRow ? fmtVal(portRow.endValue) : "—"}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    {portRow ? fmtRet(portRow.returnPct) : "—"}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    {benchRow ? fmtRet(benchRow.returnPct) : "—"}
                  </TableCell>
                </TableRow>

                {/* Expanded: one sub-row per selected fund */}
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
                      <TableCell className="py-1.5 text-[11px] text-muted-foreground">
                        {fmtDate(fRow.startDate)}
                      </TableCell>
                      <TableCell className="py-1.5 text-[11px] text-right font-mono">
                        {fmtVal(fRow.startValue)}
                      </TableCell>
                      <TableCell className="py-1.5 text-[11px] text-muted-foreground">
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
