import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  Package,
  TrendingUp,
  CheckCircle,
  Search,
  Filter,
  ArrowUpDown,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Layers,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { PriorityBadge, StatusBadge, ScoreBar } from '../components/RecallPriorityBadge'
import StoreRecallModal from '../components/StoreRecallModal'
import { cn, formatNumber } from '../utils/helpers'
import type { RecallItem, RecallPriority, RecallStatus } from '../types'

type SortKey = 'recallScore' | 'suggestedQty' | 'priority' | 'status'
const PRIORITY_ORDER: Record<RecallPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export default function Dashboard() {
  const { recallItems, products, stores, generateRecalls } = useAppStore()
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<RecallPriority | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<RecallStatus | 'all'>('all')
  const [filterStore, setFilterStore] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('recallScore')
  const [sortAsc, setSortAsc] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RecallItem | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const stats = useMemo(() => {
    const active = recallItems.filter((r) => r.status !== 'received' && r.status !== 'cancelled')
    return {
      total: active.length,
      urgent: active.filter((r) => r.priority === 'urgent').length,
      inTransit: recallItems.filter((r) => r.status === 'in-transit').length,
      completed: recallItems.filter((r) => r.status === 'received').length,
      totalSuggestedQty: active.reduce((s, r) => s + r.suggestedQty, 0),
    }
  }, [recallItems])

  const storeList = useMemo(() => {
    const ids = [...new Set(recallItems.map((r) => r.storeId))]
    return ids.map((id) => ({ id, name: stores.find((s) => s.id === id)?.name ?? id }))
  }, [recallItems, stores])

  const filtered = useMemo(() => {
    let list = [...recallItems]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((r) => {
        const p = products.find((p) => p.id === r.productId)
        const s = stores.find((s) => s.id === r.storeId)
        return (
          r.productId.toLowerCase().includes(q) ||
          p?.name.toLowerCase().includes(q) ||
          s?.name.toLowerCase().includes(q)
        )
      })
    }
    if (filterPriority !== 'all') list = list.filter((r) => r.priority === filterPriority)
    if (filterStatus !== 'all') list = list.filter((r) => r.status === filterStatus)
    if (filterStore !== 'all') list = list.filter((r) => r.storeId === filterStore)

    list.sort((a, b) => {
      let diff = 0
      if (sortKey === 'recallScore') diff = a.recallScore - b.recallScore
      else if (sortKey === 'suggestedQty') diff = a.suggestedQty - b.suggestedQty
      else if (sortKey === 'priority') diff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      return sortAsc ? diff : -diff
    })
    return list
  }, [recallItems, search, filterPriority, filterStatus, filterStore, sortKey, sortAsc, products, stores])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const hasData = recallItems.length > 0

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-7xl mx-auto">
      {/* 데이터 현황 패널 */}
      <DataStatusPanel />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="회수 대상"
          value={formatNumber(stats.total)}
          sub={`총 ${formatNumber(stats.totalSuggestedQty)}개`}
          icon={Package}
          accent="indigo"
        />
        <StatCard
          label="긴급 회수"
          value={formatNumber(stats.urgent)}
          sub="즉시 처리 필요"
          icon={AlertTriangle}
          accent="red"
        />
        <StatCard
          label="이송 중"
          value={formatNumber(stats.inTransit)}
          sub="진행 중"
          icon={TrendingUp}
          accent="purple"
        />
        <StatCard
          label="입고 완료"
          value={formatNumber(stats.completed)}
          sub="이번 시즌 누계"
          icon={CheckCircle}
          accent="green"
        />
      </div>

      {/* 빈 상태 */}
      {!hasData && (
        <EmptyState onGenerate={generateRecalls} />
      )}

      {/* 회수 목록 */}
      {hasData && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* 툴바 */}
          <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="상품코드, 상품명, 매장명..."
                className="w-full pl-8 pr-3 h-8 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:bg-white transition-colors"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg border transition-colors',
                showFilters
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              필터
              <ChevronDown className={cn('w-3 h-3 transition-transform', showFilters && 'rotate-180')} />
            </button>
            <div className="hidden sm:flex items-center text-xs text-gray-400 px-1">
              {filtered.length}건
            </div>
          </div>

          {/* 필터 패널 */}
          {showFilters && (
            <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-100 flex flex-wrap gap-2 items-center">
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value as RecallPriority | 'all')}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
              >
                <option value="all">전체 우선순위</option>
                <option value="urgent">긴급</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as RecallStatus | 'all')}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
              >
                <option value="all">전체 상태</option>
                <option value="recommended">회수 권장</option>
                <option value="requested">요청됨</option>
                <option value="in-transit">이송 중</option>
                <option value="received">입고 완료</option>
              </select>
              <select
                value={filterStore}
                onChange={(e) => setFilterStore(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
              >
                <option value="all">전체 매장</option>
                {storeList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400 sm:hidden">{filtered.length}건</span>
            </div>
          )}

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="w-1 p-0" />
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    상품
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    매장
                  </th>
                  <SortTh label="우선순위" sortKey="priority" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                  <SortTh label="점수" sortKey="recallScore" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                  <SortTh label="권장수량" sortKey="suggestedQty" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    회수 사유
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-14 text-gray-400 text-sm">
                      조건에 맞는 항목이 없습니다
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <RecallRow
                      key={item.id}
                      item={item}
                      onAction={() => setSelectedItem(item)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 회수 모달 */}
      {selectedItem && (
        <StoreRecallModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}

// ─── 데이터 현황 패널 ────────────────────────────────────────────
function DataStatusPanel() {
  const { centerStocks, storeStocks, periodSales, stores, products } = useAppStore()

  const hasCenter = centerStocks.length > 0
  const hasStore = storeStocks.length > 0
  const onlineSales = periodSales.filter((p) => p.channel === 'online')
  const offlineSales = periodSales.filter((p) => p.channel === 'offline')
  const coupangSales = periodSales.filter((p) => p.channel === 'coupang')
  const hasOnline = onlineSales.length > 0
  const hasCoupang = coupangSales.length > 0
  const hasOffline = offlineSales.length > 0
  const hasAnySales = hasOnline || hasCoupang

  const items = [
    {
      label: '센터재고',
      ok: hasCenter,
      detail: hasCenter ? `${products.length.toLocaleString()}종` : null,
      required: true,
    },
    {
      label: '매장재고',
      ok: hasStore,
      detail: hasStore ? `${stores.length}매장` : null,
      required: true,
    },
    {
      label: '온라인판매',
      ok: hasOnline,
      detail: hasOnline ? `${onlineSales.length}건` : null,
      required: true,
    },
    {
      label: '쿠팡',
      ok: hasCoupang,
      detail: hasCoupang ? `${coupangSales.length}건` : null,
      required: false,
    },
    {
      label: '매장판매',
      ok: hasOffline,
      detail: hasOffline ? `${offlineSales.length}건` : null,
      required: false,
    },
  ]

  const missingRequired = items.filter((i) => i.required && !i.ok)
  const allOk = missingRequired.length === 0

  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3',
        allOk
          ? 'bg-white border-gray-100'
          : !hasAnySales && (hasCenter || hasStore)
          ? 'bg-amber-50 border-amber-100'
          : 'bg-white border-gray-100'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 mr-1">
          <Layers className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500">데이터 현황</span>
        </div>

        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              'flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium border',
              item.ok
                ? 'bg-green-50 text-green-700 border-green-100'
                : item.required
                ? 'bg-red-50 text-red-500 border-red-100'
                : 'bg-gray-50 text-gray-400 border-gray-100'
            )}
          >
            {item.ok ? (
              <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
            ) : (
              <XCircle className="w-3 h-3 flex-shrink-0" />
            )}
            {item.label}
            {item.detail && <span className="opacity-60">· {item.detail}</span>}
          </div>
        ))}

        {!allOk && (
          <Link
            to="/upload"
            className="ml-auto text-[11px] font-semibold text-brand-600 hover:text-brand-700 hover:underline whitespace-nowrap"
          >
            업로드하기 →
          </Link>
        )}
      </div>

      {!hasAnySales && (hasCenter || hasStore) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            <strong>온라인 판매 데이터가 없으면 분석 결과가 0건</strong>이 됩니다 —
            이지어드민 어드민상품매출통계를 업로드하세요
          </span>
        </div>
      )}
    </div>
  )
}

// ─── 통계 카드 ────────────────────────────────────────────────────
type AccentColor = 'indigo' | 'red' | 'purple' | 'green'
const ACCENT: Record<AccentColor, { icon: string; top: string; val: string }> = {
  indigo: { icon: 'bg-indigo-50 text-indigo-500', top: 'bg-indigo-500', val: 'text-indigo-600' },
  red:    { icon: 'bg-red-50 text-red-500',       top: 'bg-red-500',    val: 'text-red-600' },
  purple: { icon: 'bg-purple-50 text-purple-500', top: 'bg-purple-500', val: 'text-purple-600' },
  green:  { icon: 'bg-green-50 text-green-500',   top: 'bg-green-500',  val: 'text-green-600' },
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent: AccentColor
}) {
  const c = ACCENT[accent]
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={cn('h-1', c.top)} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', c.icon)}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className={cn('text-2xl font-bold tabular-nums', c.val)}>{value}</div>
        <div className="text-xs font-medium text-gray-600 mt-0.5">{label}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ─── 테이블 헤더 ─────────────────────────────────────────────────
function SortTh({
  label, sortKey, current, asc, onToggle,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  asc: boolean
  onToggle: (k: SortKey) => void
}) {
  return (
    <th
      className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-800 select-none"
      onClick={() => onToggle(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={cn('w-3 h-3', current === sortKey ? 'text-brand-500' : 'text-gray-300')}
        />
      </div>
    </th>
  )
}

// ─── 회수 행 ─────────────────────────────────────────────────────
const PRIORITY_BORDER: Record<RecallPriority, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-gray-200',
}

function RecallRow({ item, onAction }: { item: RecallItem; onAction: () => void }) {
  const { getProduct, getStore, updateRecallStatus, updateRecallItem } = useAppStore()
  const product = getProduct(item.productId)
  const store = getStore(item.storeId)
  const [editingQty, setEditingQty] = useState(false)
  const [qtyInput, setQtyInput] = useState(String(item.suggestedQty))

  function commitQty() {
    const v = parseInt(qtyInput, 10)
    if (!isNaN(v) && v >= 0) updateRecallItem(item.id, { suggestedQty: v })
    else setQtyInput(String(item.suggestedQty))
    setEditingQty(false)
  }

  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-slate-50/60 transition-colors">
      {/* 우선순위 컬러 바 */}
      <td className="w-1 p-0">
        <div className={cn('w-[3px] min-h-[52px] h-full', PRIORITY_BORDER[item.priority])} />
      </td>

      {/* 상품 */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {product?.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <div className="font-medium text-gray-900 text-sm truncate max-w-[180px]">
              {product?.name ?? item.productId}
            </div>
            <div className="text-[11px] text-gray-400 font-mono mt-0.5">{item.productId}</div>
          </div>
        </div>
      </td>

      {/* 매장 */}
      <td className="px-3 py-3">
        <span className="text-sm text-gray-600 whitespace-nowrap">{store?.name ?? item.storeId}</span>
      </td>

      {/* 우선순위 */}
      <td className="px-3 py-3">
        <PriorityBadge priority={item.priority} />
      </td>

      {/* 점수 */}
      <td className="px-3 py-3 min-w-[110px]">
        <ScoreBar score={item.recallScore} />
      </td>

      {/* 권장 수량 */}
      <td className="px-3 py-3">
        {editingQty ? (
          <input
            autoFocus
            type="number"
            min={0}
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitQty()
              if (e.key === 'Escape') { setQtyInput(String(item.suggestedQty)); setEditingQty(false) }
            }}
            className="w-16 text-center border border-brand-300 rounded-lg px-1 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        ) : (
          <div>
            <button
              onClick={() => { setQtyInput(String(item.suggestedQty)); setEditingQty(true) }}
              className="text-sm font-bold text-gray-900 hover:text-brand-600 hover:underline tabular-nums transition-colors"
              title="클릭하여 수정"
            >
              {formatNumber(item.suggestedQty)}개
            </button>
            {item.requestedQty !== undefined && (
              <div className="text-[10px] text-gray-400 font-normal mt-0.5">요청 {item.requestedQty}개</div>
            )}
          </div>
        )}
      </td>

      {/* 상태 */}
      <td className="px-3 py-3">
        <StatusBadge status={item.status} />
      </td>

      {/* 회수 사유 */}
      <td className="px-3 py-3 max-w-[200px]">
        <span className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed" title={item.reason}>
          {item.reason || '—'}
        </span>
      </td>

      {/* 액션 */}
      <td className="px-3 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {item.status === 'recommended' && (
            <button
              onClick={onAction}
              className="px-2.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              회수 요청
            </button>
          )}
          {item.status === 'requested' && (
            <button
              onClick={() => updateRecallStatus(item.id, 'in-transit')}
              className="px-2.5 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              이송 처리
            </button>
          )}
          {item.status === 'in-transit' && (
            <button
              onClick={() => updateRecallStatus(item.id, 'received', item.requestedQty)}
              className="px-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              입고 확인
            </button>
          )}
          {item.status === 'received' && (
            <span className="text-[11px] text-gray-400">완료</span>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── 빈 상태 ─────────────────────────────────────────────────────
function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  const { centerStocks, storeStocks, periodSales } = useAppStore()
  const hasCenter = centerStocks.length > 0
  const hasStore = storeStocks.length > 0
  const hasOnline = periodSales.some((p) => p.channel === 'online' || p.channel === 'coupang')
  const readyToAnalyze = hasCenter && hasStore && hasOnline

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
        <Package className="w-7 h-7 text-brand-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1.5">회수 분석 결과가 없습니다</h3>

      {!readyToAnalyze ? (
        <>
          <p className="text-sm text-gray-500 mb-5">분석 실행 전 아래 데이터를 먼저 업로드하세요</p>
          <div className="inline-flex flex-col items-start gap-2 mb-6 text-left">
            <ChecklistItem ok={hasCenter} label="이지어드민 현재고조회 (.xls)" />
            <ChecklistItem ok={hasStore} label="이지체인 매장별 재고 (.xls)" />
            <ChecklistItem ok={hasOnline} label="이지어드민 어드민상품매출통계 (.xls)" critical />
          </div>
          <div>
            <Link
              to="/upload"
              className="inline-block px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              데이터 업로드하기
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-5">
            데이터 준비 완료 · 왼쪽 하단 <strong>'회수 분석 실행'</strong> 버튼을 클릭하세요
          </p>
          <button
            onClick={onGenerate}
            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            지금 분석 실행
          </button>
        </>
      )}
    </div>
  )
}

function ChecklistItem({ ok, label, critical }: { ok: boolean; label: string; critical?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 text-sm', ok ? 'text-green-700' : critical ? 'text-red-500' : 'text-gray-500')}>
      {ok
        ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        : critical
        ? <AlertCircle className="w-4 h-4 flex-shrink-0" />
        : <XCircle className="w-4 h-4 flex-shrink-0 text-gray-300" />
      }
      {label}
      {!ok && critical && <span className="text-xs bg-red-50 text-red-400 px-1.5 py-0.5 rounded-full">분석에 필수</span>}
    </div>
  )
}
