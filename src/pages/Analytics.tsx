import { useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { TrendingUp, ShoppingBag, Store, BarChart3 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { aggregateSalesByDate, abcAnalysis } from '../utils/analysis'
import { formatNumber } from '../utils/helpers'
import { subDays, parseISO } from 'date-fns'

const COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6']

export default function Analytics() {
  const { sales, recallItems, products, storeStocks, centerStocks } = useAppStore()

  const hasSales = sales.length > 0

  const onlineTrend = useMemo(() => aggregateSalesByDate(sales, 'all', 60), [sales])
  const onlineSeries = useMemo(() => aggregateSalesByDate(sales, 'online', 60), [sales])
  const offlineSeries = useMemo(() => aggregateSalesByDate(sales, 'offline', 60), [sales])
  const coupangSeries = useMemo(() => aggregateSalesByDate(sales, 'coupang', 60), [sales])

  // 채널별 비교 (최근 30일)
  const channelCompare = useMemo(() => {
    const ref = new Date()
    const cutoff = subDays(ref, 30)
    const channels = ['online', 'offline', 'coupang'] as const
    return channels.map((ch) => {
      const filtered = sales.filter(
        (s) => s.channel === ch && parseISO(s.date) >= cutoff
      )
      return {
        name: ch === 'online' ? '온라인' : ch === 'offline' ? '오프라인' : '쿠팡',
        qty: filtered.reduce((s, r) => s + r.qty, 0),
        revenue: filtered.reduce((s, r) => s + r.revenue, 0),
      }
    })
  }, [sales])

  // ABC 분석
  const abc = useMemo(() => abcAnalysis(sales, 90), [sales])
  const abcSummary = useMemo(() => {
    const groups = { A: { count: 0, qty: 0 }, B: { count: 0, qty: 0 }, C: { count: 0, qty: 0 } }
    abc.forEach(({ grade, totalQty }) => {
      groups[grade].count++
      groups[grade].qty += totalQty
    })
    return [
      { name: 'A등급 (상위 70%)', count: groups.A.count, qty: groups.A.qty, color: '#6366f1' },
      { name: 'B등급 (다음 20%)', count: groups.B.count, qty: groups.B.qty, color: '#f59e0b' },
      { name: 'C등급 (하위 10%)', count: groups.C.count, qty: groups.C.qty, color: '#94a3b8' },
    ]
  }, [abc])

  // 우선순위별 회수 현황
  const priorityData = useMemo(() => {
    const groups = { urgent: 0, high: 0, medium: 0, low: 0 }
    recallItems.forEach((r) => { groups[r.priority]++ })
    return [
      { name: '긴급', value: groups.urgent, color: '#ef4444' },
      { name: '높음', value: groups.high, color: '#f97316' },
      { name: '보통', value: groups.medium, color: '#eab308' },
      { name: '낮음', value: groups.low, color: '#94a3b8' },
    ].filter((d) => d.value > 0)
  }, [recallItems])

  // 재고 총계
  const totalCenterStock = centerStocks.reduce((s, r) => s + r.qty, 0)
  const totalStoreStock = storeStocks.reduce((s, r) => s + r.qty, 0)
  const totalRecallQty = recallItems
    .filter((r) => r.status !== 'received' && r.status !== 'cancelled')
    .reduce((s, r) => s + r.suggestedQty, 0)

  // 트렌드 날짜 포맷
  const fmtDate = (d: string) => {
    const [, m, day] = d.split('-')
    return `${parseInt(m)}/${parseInt(day)}`
  }

  // 합산 트렌드 데이터
  const combinedTrend = useMemo(() => {
    const byDate = new Map<string, { date: string; online: number; offline: number; coupang: number }>()
    onlineSeries.forEach(({ date, qty }) => {
      const e = byDate.get(date) ?? { date, online: 0, offline: 0, coupang: 0 }
      e.online = qty; byDate.set(date, e)
    })
    offlineSeries.forEach(({ date, qty }) => {
      const e = byDate.get(date) ?? { date, online: 0, offline: 0, coupang: 0 }
      e.offline = qty; byDate.set(date, e)
    })
    coupangSeries.forEach(({ date, qty }) => {
      const e = byDate.get(date) ?? { date, online: 0, offline: 0, coupang: 0 }
      e.coupang = qty; byDate.set(date, e)
    })
    return [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, dateLabel: fmtDate(d.date) }))
  }, [onlineSeries, offlineSeries, coupangSeries])

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* 재고 현황 요약 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={BarChart3} label="센터 재고" value={formatNumber(totalCenterStock)} sub="개" color="brand" />
        <SummaryCard icon={Store} label="매장 재고" value={formatNumber(totalStoreStock)} sub="개" color="green" />
        <SummaryCard icon={TrendingUp} label="회수 권장 수량" value={formatNumber(totalRecallQty)} sub="개" color="orange" />
        <SummaryCard icon={ShoppingBag} label="분석 상품 수" value={formatNumber(products.length || abc.length)} sub="종" color="purple" />
      </div>

      {!hasSales ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-16 text-center">
          <BarChart3 className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <div className="text-gray-500 text-sm">판매 데이터를 업로드하면 분석 차트가 표시됩니다</div>
        </div>
      ) : (
        <>
          {/* 채널별 판매 트렌드 */}
          <ChartCard title="채널별 일별 판매 추이 (60일)" subtitle="온라인·오프라인·쿠팡 판매량">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={combinedTrend} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                  formatter={(val: number, name: string) => [
                    `${formatNumber(val)}개`,
                    name === 'online' ? '온라인' : name === 'offline' ? '오프라인' : '쿠팡',
                  ]}
                />
                <Legend
                  formatter={(value) => value === 'online' ? '온라인' : value === 'offline' ? '오프라인' : '쿠팡'}
                  iconType="circle"
                />
                <Line type="monotone" dataKey="online" stroke="#6366f1" strokeWidth={2} dot={false} name="online" />
                <Line type="monotone" dataKey="offline" stroke="#22c55e" strokeWidth={2} dot={false} name="offline" />
                <Line type="monotone" dataKey="coupang" stroke="#f97316" strokeWidth={2} dot={false} name="coupang" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 채널별 30일 비교 */}
            <ChartCard title="채널별 판매 비교" subtitle="최근 30일">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={channelCompare} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                    formatter={(val: number) => [`${formatNumber(val)}개`, '판매량']}
                  />
                  <Bar dataKey="qty" radius={[6, 6, 0, 0]}>
                    {channelCompare.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 회수 우선순위 파이 */}
            {priorityData.length > 0 && (
              <ChartCard title="회수 우선순위 분포" subtitle="현재 회수 대상">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={priorityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {priorityData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                      formatter={(val: number, name: string) => [`${val}건`, name]}
                    />
                    <Legend iconType="circle" formatter={(v) => v} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* ABC 분석 */}
          {abc.length > 0 && (
            <ChartCard title="ABC 분석" subtitle="90일 판매량 기준 상품 등급">
              <div className="grid grid-cols-3 gap-4 mb-4">
                {abcSummary.map((g) => (
                  <div key={g.name} className="text-center p-4 rounded-xl bg-gray-50">
                    <div
                      className="text-2xl font-bold"
                      style={{ color: g.color }}
                    >
                      {g.count}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{g.name}</div>
                    <div className="text-xs font-medium text-gray-700 mt-0.5">
                      {formatNumber(g.qty)}개 판매
                    </div>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-gray-500 font-medium">상품코드</th>
                      <th className="text-left py-2 text-gray-500 font-medium">상품명</th>
                      <th className="text-right py-2 text-gray-500 font-medium">판매량</th>
                      <th className="text-right py-2 text-gray-500 font-medium">등급</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abc.slice(0, 20).map(({ productId, totalQty, grade }) => {
                      const product = products.find((p) => p.id === productId)
                      const gradeColor = grade === 'A' ? '#6366f1' : grade === 'B' ? '#f59e0b' : '#94a3b8'
                      return (
                        <tr key={productId} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 text-gray-400">{productId}</td>
                          <td className="py-2 text-gray-800">{product?.name ?? productId}</td>
                          <td className="py-2 text-right font-medium">{formatNumber(totalQty)}</td>
                          <td className="py-2 text-right">
                            <span
                              className="font-bold px-1.5 py-0.5 rounded"
                              style={{ color: gradeColor, background: `${gradeColor}18` }}
                            >
                              {grade}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}
        </>
      )}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5">
      <div className="mb-4">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub: string
  color: string
}) {
  const styles: Record<string, { bg: string; icon: string }> = {
    brand: { bg: 'bg-brand-50', icon: 'text-brand-600' },
    green: { bg: 'bg-green-50', icon: 'text-green-600' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600' },
  }
  const s = styles[color]
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-4">
      <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
        <Icon className={`w-4.5 h-4.5 ${s.icon}`} />
      </div>
      <div className="text-xl font-bold text-gray-900">{value}<span className="text-sm font-normal text-gray-400 ml-1">{sub}</span></div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
