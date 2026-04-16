import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  AlertTriangle, Package, TrendingUp, CheckCircle,
  Search, Filter, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Layers,
  Download, Send, Square, CheckSquare, Loader2, Undo2,
  Store, Warehouse, CalendarDays, LayoutGrid,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { PriorityBadge, StatusBadge } from '../components/RecallPriorityBadge'
import StoreRecallModal from '../components/StoreRecallModal'
import { cn, formatNumber } from '../utils/helpers'
import { getCurrentSeasonLabel, getCurrentSeason, getProductSeasonType } from '../utils/analysis'
import type { RecallItem, RecallPriority, RecallStatus, Product } from '../types'

// ─── 이름 기반 시즌 추정 ─────────────────────────────────────────
// product.season 필드가 없을 때 상품명 키워드로 FW/SS 추정
const FW_KEYWORDS = ['패딩', '다운', '덕다운', '구스다운', '점퍼', '파카', '코트', '자켓', '자켓트', '니트', '스웨터', '후리스', '플리스', '기모', '울', '코듀로이', '맨투맨']
const SS_KEYWORDS = ['반팔', '반바지', '민소매', '나시', '린넨', '시어', '쿨링', '래쉬가드', '수영복', '쇼츠', '탱크탑']

function inferSeasonFromName(name: string): 'SS' | 'FW' | null {
  const lower = name.toLowerCase()
  if (FW_KEYWORDS.some((k) => lower.includes(k))) return 'FW'
  if (SS_KEYWORDS.some((k) => lower.includes(k))) return 'SS'
  return null
}

function getEffectiveSeason(product: Product | undefined): { type: 'SS' | 'FW' | null; inferred: boolean; label: string } {
  const rawSeason = product?.season?.trim() ?? ''
  if (rawSeason) {
    // season 필드가 있으면: 타입 판별과 무관하게 원본 레이블 항상 반환
    // (e.g. "봄/가을" → type=null 이지만 label='봄/가을' 으로 뱃지 표시)
    const type = getProductSeasonType(rawSeason)
    return { type, inferred: false, label: rawSeason }
  }
  // season 필드 없으면: 상품명 키워드로 추정
  const fromName = inferSeasonFromName(product?.name ?? '')
  if (fromName) return { type: fromName, inferred: true, label: fromName === 'FW' ? '❄️FW 추정' : '🌸SS 추정' }
  return { type: null, inferred: false, label: '' }
}

const PAGE_SIZE = 25
const PRIORITY_ORDER: Record<RecallPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const PRIORITY_DOT: Record<RecallPriority, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-300',
}

// ─── CSV 다운로드 ─────────────────────────────────────────────────
function downloadRecallCSV(
  items: RecallItem[],
  products: ReturnType<typeof useAppStore.getState>['products'],
  stores: ReturnType<typeof useAppStore.getState>['stores'],
  label = '회수목록',
) {
  const PRIORITY_KO: Record<RecallPriority, string> = { urgent: '긴급', high: '높음', medium: '보통', low: '낮음' }
  const STATUS_KO: Record<RecallStatus, string> = {
    recommended: '회수권장', requested: '요청됨', 'in-transit': '이송중', received: '입고완료', cancelled: '취소',
  }
  const header = ['매장명', '상품명', '상품코드', '우선순위', '권장수량', '상태', '회수사유', '생성일']
  const rows = items.map((item) => {
    const p = products.find((x) => x.id === item.productId)
    const s = stores.find((x) => x.id === item.storeId)
    return [s?.name ?? item.storeId, p?.name ?? item.productId, item.productId,
      PRIORITY_KO[item.priority], item.suggestedQty, STATUS_KO[item.status],
      item.reason, new Date(item.createdAt).toLocaleDateString('ko-KR')]
  })
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const today = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')
  a.download = `OZKIZ_${label}_${today}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Google Chat 발송 ─────────────────────────────────────────────
async function sendGoogleChatRecall(
  webhookUrl: string,
  items: RecallItem[],
  products: ReturnType<typeof useAppStore.getState>['products'],
  stores: ReturnType<typeof useAppStore.getState>['stores'],
) {
  const EM: Record<RecallPriority, string> = { urgent: '🔴', high: '🟠', medium: '🟡', low: '⚪' }
  const lines = items.map((item) => {
    const p = products.find((x) => x.id === item.productId)
    const s = stores.find((x) => x.id === item.storeId)
    return `${EM[item.priority]} *${s?.name ?? item.storeId}* | ${p?.name ?? item.productId} | *${item.suggestedQty}개*`
  })
  const now = new Date().toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const text = `🚚 *OZKIZ 회수 요청 (${items.length}건)*\n📅 ${now}\n\n${lines.join('\n')}\n\n_회수 담당자는 각 매장 매니저에게 회수 요청을 진행해주세요._`
  await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
}

// ─── 호버 툴팁 ───────────────────────────────────────────────────
function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  if (!content) return <>{children}</>
  return (
    <div className="relative group/tt inline-block max-w-full">
      {children}
      <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover/tt:block z-50
        w-64 px-3 py-2 bg-gray-900 text-white text-[11px] rounded-xl shadow-2xl leading-relaxed whitespace-normal">
        {content}
        <div className="absolute top-full left-5 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px]
          border-transparent border-t-gray-900" />
      </div>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────
export default function Dashboard() {
  const { recallItems, products, stores, storeStocks, centerStocks, settings, generateRecalls, updateRecallStatus, getProduct, getStore } = useAppStore()

  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<RecallPriority | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<RecallStatus | 'all'>('all')
  const [filterStore, setFilterStore] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [cardFilter, setCardFilter] = useState<'urgent' | 'transit' | 'completed' | null>(null)
  const [filterSeason, setFilterSeason] = useState<'current' | 'all'>('current')

  const [selectedItem, setSelectedItem] = useState<RecallItem | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── 통계 ──────────────────────────────────────────────────────
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

  // ── 매장 목록 ─────────────────────────────────────────────────
  const storeList = useMemo(() => {
    const ids = [...new Set(recallItems.map((r) => r.storeId))]
    return ids.map((id) => ({ id, name: stores.find((s) => s.id === id)?.name ?? id }))
  }, [recallItems, stores])

  // ── 필터 적용 ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...recallItems]
    // 카드 필터
    if (cardFilter === 'urgent') list = list.filter((r) => r.priority === 'urgent' && r.status !== 'received' && r.status !== 'cancelled')
    else if (cardFilter === 'transit') list = list.filter((r) => r.status === 'in-transit')
    else if (cardFilter === 'completed') list = list.filter((r) => r.status === 'received')
    else list = list.filter((r) => r.status !== 'received' && r.status !== 'cancelled') // 기본: 활성

    // 시즌 필터 (현재 시즌만: SS/FW 판별 가능한 상품만 제외, 미설정은 포함)
    if (filterSeason === 'current') {
      const cur = getCurrentSeason()
      list = list.filter((r) => {
        const p = products.find((x) => x.id === r.productId)
        const { type } = getEffectiveSeason(p)
        if (type === null) return true  // 시즌 미판별 → 포함
        return type === cur
      })
    }

    if (search) {
      const q = search.toLowerCase()
      list = list.filter((r) => {
        const p = products.find((x) => x.id === r.productId)
        const s = stores.find((x) => x.id === r.storeId)
        return r.productId.toLowerCase().includes(q) || p?.name.toLowerCase().includes(q) || s?.name.toLowerCase().includes(q)
      })
    }
    if (filterPriority !== 'all') list = list.filter((r) => r.priority === filterPriority)
    if (filterStatus !== 'all') list = list.filter((r) => r.status === filterStatus)
    if (filterStore !== 'all') list = list.filter((r) => r.storeId === filterStore)
    return list
  }, [recallItems, search, filterPriority, filterStatus, filterStore, cardFilter, filterSeason, products, stores])

  // ── 상품별 그룹핑 (PKU 기준) ──────────────────────────────────
  const productGroups = useMemo(() => {
    const map = new Map<string, {
      key: string; productName: string; imageUrl?: string
      skuIds: string[]; recalls: RecallItem[]
    }>()
    for (const recall of filtered) {
      const product = getProduct(recall.productId)
      const key = product?.name ?? recall.productId
      if (!map.has(key)) map.set(key, { key, productName: key, imageUrl: product?.imageUrl, skuIds: [], recalls: [] })
      const g = map.get(key)!
      if (!g.skuIds.includes(recall.productId)) g.skuIds.push(recall.productId)
      g.recalls.push(recall)
    }
    return Array.from(map.values()).map((g) => {
      const active = g.recalls.filter((r) => r.status !== 'received' && r.status !== 'cancelled')
      const priorities = active.map((r) => PRIORITY_ORDER[r.priority])
      const minP = priorities.length > 0 ? Math.min(...priorities) : 3
      // 대표 시즌: SKU 중 시즌 레이블이 있는 첫 번째 (type=null이어도 label 있으면 표시)
      const seasonInfo = (() => {
        for (const skuId of g.skuIds) {
          const p = getProduct(skuId)
          const info = getEffectiveSeason(p)
          if (info.label) return info
        }
        return { type: null, inferred: false, label: '' }
      })()
      return {
        ...g,
        highestPriority: (['urgent', 'high', 'medium', 'low'] as RecallPriority[])[minP],
        urgentCount: active.filter((r) => r.priority === 'urgent').length,
        highCount: active.filter((r) => r.priority === 'high').length,
        totalRecallQty: active.reduce((s, r) => s + r.suggestedQty, 0),
        storeCount: new Set(active.map((r) => r.storeId)).size,
        activeCount: active.length,
        seasonType: seasonInfo.type,
        seasonLabel: seasonInfo.label,
        seasonInferred: seasonInfo.inferred,
      }
    }).sort((a, b) =>
      PRIORITY_ORDER[a.highestPriority] - PRIORITY_ORDER[b.highestPriority] ||
      b.urgentCount - a.urgentCount || b.totalRecallQty - a.totalRecallQty
    )
  }, [filtered, getProduct])

  // ── 무한 스크롤 ───────────────────────────────────────────────
  useEffect(() => { setVisibleCount(PAGE_SIZE); setSelectedIds(new Set()) },
    [search, filterPriority, filterStatus, filterStore, cardFilter, filterSeason])

  const loadMore = useCallback(() => {
    setVisibleCount((p) => Math.min(p + PAGE_SIZE, productGroups.length))
  }, [productGroups.length])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const ob = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore() }, { rootMargin: '200px' })
    ob.observe(el)
    return () => ob.disconnect()
  }, [loadMore])

  const visibleGroups = productGroups.slice(0, visibleCount)
  const hasMore = visibleCount < productGroups.length

  // ── 선택 관련 ─────────────────────────────────────────────────
  const selectedRecommended = filtered.filter((r) => selectedIds.has(r.id) && r.status === 'recommended')

  function toggleGroupSelect(groupKey: string) {
    const group = productGroups.find((g) => g.key === groupKey)
    if (!group) return
    const ids = group.recalls.map((r) => r.id)
    const allSelected = ids.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id))
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function toggleSelectAll() {
    const allIds = new Set(filtered.map((r) => r.id))
    const allSelected = filtered.every((r) => selectedIds.has(r.id))
    setSelectedIds(allSelected ? new Set() : allIds)
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  // ── 카드 필터 토글 ────────────────────────────────────────────
  function toggleCardFilter(f: 'urgent' | 'transit' | 'completed') {
    setCardFilter((prev) => prev === f ? null : f)
    setFilterPriority('all'); setFilterStatus('all')
  }

  // ── 일괄 요청 ─────────────────────────────────────────────────
  async function handleBulkRequest() {
    if (selectedRecommended.length === 0) return
    setSending(true); setSendResult(null)
    try {
      selectedRecommended.forEach((item) => updateRecallStatus(item.id, 'requested'))
      const webhookUrl = settings.googleChatWebhookUrl?.trim()
      if (webhookUrl) {
        await sendGoogleChatRecall(webhookUrl, selectedRecommended, products, stores)
        setSendResult({ ok: true, msg: `${selectedRecommended.length}건 요청 완료 · Google Chat 발송됨` })
      } else {
        setSendResult({ ok: true, msg: `${selectedRecommended.length}건 회수 요청 처리됨 (Google Chat 미설정)` })
      }
      setSelectedIds(new Set())
    } catch {
      setSendResult({ ok: false, msg: 'Google Chat 전송 실패. 설정에서 웹훅 URL을 확인하세요.' })
    } finally {
      setSending(false)
      setTimeout(() => setSendResult(null), 6000)
    }
  }

  const hasData = recallItems.length > 0

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-7xl mx-auto">
      <DataStatusPanel />

      {/* 통계 카드 (클릭 필터) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="회수 대상" value={formatNumber(stats.total)} sub={`총 ${formatNumber(stats.totalSuggestedQty)}개`}
          icon={Package} accent="orange"
          active={cardFilter === null}
          onClick={() => setCardFilter(null)} />
        <StatCard label="긴급 회수" value={formatNumber(stats.urgent)} sub="즉시 처리 필요"
          icon={AlertTriangle} accent="red"
          active={cardFilter === 'urgent'}
          onClick={() => toggleCardFilter('urgent')} />
        <StatCard label="이송 중" value={formatNumber(stats.inTransit)} sub="진행 중"
          icon={TrendingUp} accent="amber"
          active={cardFilter === 'transit'}
          onClick={() => toggleCardFilter('transit')} />
        <StatCard label="입고 완료" value={formatNumber(stats.completed)} sub="이번 시즌 누계"
          icon={CheckCircle} accent="green"
          active={cardFilter === 'completed'}
          onClick={() => toggleCardFilter('completed')} />
      </div>

      {/* 히트맵 토글 버튼 */}
      {hasData && (
        <button
          onClick={() => setShowHeatmap((v) => !v)}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors w-full sm:w-auto',
            showHeatmap
              ? 'bg-brand-50 text-brand-700 border-brand-200'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          )}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          매장 × 상품 히트맵
          <ChevronDown className={cn('w-3 h-3 transition-transform ml-auto sm:ml-0', showHeatmap && 'rotate-180')} />
        </button>
      )}

      {/* 히트맵 */}
      {showHeatmap && hasData && (
        <StoreHeatmap
          recallItems={recallItems}
          stores={stores}
          storeStocks={storeStocks}
          products={products}
        />
      )}

      {/* 알림 결과 토스트 */}
      {sendResult && (
        <div className={cn('flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border',
          sendResult.ok ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-600 border-red-100')}>
          {sendResult.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {sendResult.msg}
        </div>
      )}

      {!hasData && <EmptyState onGenerate={generateRecalls} />}

      {hasData && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* 툴바 */}
          <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="상품코드, 상품명, 매장명..."
                className="w-full pl-8 pr-3 h-8 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:bg-white transition-colors" />
            </div>
            {/* 시즌 필터 토글 */}
            <button
              onClick={() => setFilterSeason((f) => f === 'current' ? 'all' : 'current')}
              className={cn(
                'flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap',
                filterSeason === 'current'
                  ? 'border-cyan-300 bg-cyan-50 text-cyan-700 font-semibold'
                  : 'border-gray-200 text-gray-400 hover:bg-gray-50 line-through'
              )}
            >
              <span>{filterSeason === 'current' ? '🌸' : '❄️'}</span>
              {filterSeason === 'current' ? `${getCurrentSeasonLabel()} 시즌만` : '전체 시즌'}
            </button>
            <button onClick={() => setShowFilters(!showFilters)}
              className={cn('flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg border transition-colors',
                showFilters ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}>
              <Filter className="w-3.5 h-3.5" />필터
              <ChevronDown className={cn('w-3 h-3 transition-transform', showFilters && 'rotate-180')} />
            </button>
            <button onClick={() => downloadRecallCSV(filtered, products, stores)}
              className="flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
              <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">다운로드</span>
            </button>
            <div className="hidden sm:flex items-center text-xs text-gray-400 px-1">{productGroups.length}개 상품</div>
          </div>

          {/* 필터 패널 */}
          {showFilters && (
            <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-100 flex flex-wrap gap-2 items-center">
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as RecallPriority | 'all')}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
                <option value="all">전체 우선순위</option>
                <option value="urgent">긴급</option><option value="high">높음</option>
                <option value="medium">보통</option><option value="low">낮음</option>
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as RecallStatus | 'all')}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
                <option value="all">전체 상태</option>
                <option value="recommended">회수 권장</option><option value="requested">요청됨</option>
                <option value="in-transit">이송 중</option><option value="received">입고 완료</option>
              </select>
              <select value={filterStore} onChange={(e) => setFilterStore(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
                <option value="all">전체 매장</option>
                {storeList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* 일괄 액션 바 */}
          {selectedIds.size > 0 && (
            <div className="px-4 py-2.5 bg-brand-50 border-b border-brand-100 flex flex-wrap items-center gap-3">
              <button onClick={toggleSelectAll} className="text-gray-400 hover:text-brand-500 transition-colors">
                {filtered.every((r) => selectedIds.has(r.id))
                  ? <CheckSquare className="w-4 h-4 text-brand-500" />
                  : <Square className="w-4 h-4" />}
              </button>
              <span className="text-sm font-semibold text-brand-700">
                {selectedIds.size}건 선택됨
                {selectedRecommended.length > 0 && <span className="ml-1.5 text-xs font-normal text-brand-500">(회수권장 {selectedRecommended.length}건)</span>}
              </span>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-brand-500 hover:text-brand-700 underline">선택 해제</button>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => downloadRecallCSV(filtered.filter((r) => selectedIds.has(r.id)), products, stores, '선택회수목록')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors">
                  <Download className="w-3.5 h-3.5" />엑셀 다운로드
                </button>
                {selectedRecommended.length > 0 && (
                  <button onClick={handleBulkRequest} disabled={sending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors disabled:opacity-60">
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    회수 요청 발송 ({selectedRecommended.length}건)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 상품 목록 헤더 */}
          <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100 flex items-center gap-3">
            <button onClick={toggleSelectAll} className="text-gray-300 hover:text-brand-500 transition-colors flex-shrink-0">
              {filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id))
                ? <CheckSquare className="w-4 h-4 text-brand-500" />
                : <Square className="w-4 h-4" />}
            </button>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">상품 (PKU)</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-20 text-center hidden sm:block">우선순위</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-16 text-right hidden sm:block">회수수량</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-14 text-right hidden md:block">매장수</span>
            <span className="w-6" />
          </div>

          {/* 상품 그룹 목록 */}
          {productGroups.length === 0 ? (
            <div className="py-14 text-center text-gray-400 text-sm">조건에 맞는 항목이 없습니다</div>
          ) : (
            <div>
              {visibleGroups.map((group) => (
                <ProductGroupRow
                  key={group.key}
                  group={group}
                  expanded={expandedGroups.has(group.key)}
                  onToggle={() => toggleGroup(group.key)}
                  selectedIds={selectedIds}
                  onGroupCheck={() => toggleGroupSelect(group.key)}
                  onItemCheck={toggleSelect}
                  onItemAction={setSelectedItem}
                  onRevert={(id) => updateRecallStatus(id, 'in-transit')}
                  storeStocks={storeStocks}
                  centerStocks={centerStocks}
                  getStore={getStore}
                />
              ))}

              {/* 무한 스크롤 sentinel */}
              <div ref={sentinelRef} className="h-2" />
              {hasMore && (
                <div className="flex items-center justify-center py-4 gap-2 text-sm text-gray-400 border-t border-gray-50">
                  <svg className="w-4 h-4 animate-spin text-brand-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  불러오는 중… ({visibleCount}/{productGroups.length})
                </div>
              )}
              {!hasMore && productGroups.length > PAGE_SIZE && (
                <div className="text-center py-3 text-xs text-gray-300 border-t border-gray-50">
                  전체 {productGroups.length}개 상품 표시 완료
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedItem && <StoreRecallModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  )
}

// ─── Sell-Through 게이지 바 ──────────────────────────────────────
function SellThroughBar({ pct, size = 'sm' }: { pct: number | null; size?: 'sm' | 'xs' }) {
  if (pct === null) return null
  const color = pct >= 70 ? 'bg-green-400' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-400'
  const textColor = pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-yellow-600' : 'text-red-500'
  return (
    <div className={cn('flex items-center gap-1.5', size === 'xs' ? 'w-20' : 'w-24')}>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={cn('font-semibold tabular-nums flex-shrink-0', textColor, size === 'xs' ? 'text-[10px]' : 'text-[11px]')}>
        {pct}%
      </span>
    </div>
  )
}

// ─── 상품 그룹 행 ─────────────────────────────────────────────────
function ProductGroupRow({
  group, expanded, onToggle, selectedIds, onGroupCheck, onItemCheck, onItemAction, onRevert, storeStocks, centerStocks, getStore,
}: {
  group: ReturnType<typeof buildGroup>
  expanded: boolean
  onToggle: () => void
  selectedIds: Set<string>
  onGroupCheck: () => void
  onItemCheck: (id: string) => void
  onItemAction: (item: RecallItem) => void
  onRevert: (id: string) => void
  storeStocks: ReturnType<typeof useAppStore.getState>['storeStocks']
  centerStocks: ReturnType<typeof useAppStore.getState>['centerStocks']
  getStore: ReturnType<typeof useAppStore.getState>['getStore']
}) {
  const { periodSales } = useAppStore()
  const groupIds = group.recalls.map((r) => r.id)
  const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id))
  const someSelected = groupIds.some((id) => selectedIds.has(id))

  // ── Sell-Through 계산 (오프라인 기간합산 판매 / (판매 + 잔여재고)) ──
  const sellThrough = useMemo(() => {
    const skuSet = new Set(group.skuIds)
    const totalStoreQty = storeStocks
      .filter((s) => skuSet.has(s.productId))
      .reduce((sum, s) => sum + s.qty, 0)
    const totalSold = periodSales
      .filter((p) => p.channel === 'offline' && skuSet.has(p.productId))
      .reduce((sum, p) => sum + p.totalQty, 0)
    if (totalSold + totalStoreQty === 0) return null
    return Math.round((totalSold / (totalSold + totalStoreQty)) * 100)
  }, [group.skuIds, storeStocks, periodSales])

  return (
    <div className={cn('border-b border-gray-50 last:border-0', expanded && 'bg-orange-50/20')}>
      {/* 상품 헤더 행 */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
        {/* 체크박스 */}
        <button onClick={onGroupCheck} className="flex-shrink-0 text-gray-300 hover:text-brand-500 transition-colors">
          {allSelected
            ? <CheckSquare className="w-4 h-4 text-brand-500" />
            : someSelected
            ? <div className="w-4 h-4 rounded border-2 border-brand-400 bg-brand-100 flex items-center justify-center">
                <div className="w-2 h-0.5 bg-brand-500" />
              </div>
            : <Square className="w-4 h-4" />}
        </button>

        {/* 이미지 */}
        {group.imageUrl ? (
          <img src={group.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0 bg-gray-100"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4 text-gray-400" />
          </div>
        )}

        {/* 상품명 + SKU 수 */}
        <div className="flex-1 min-w-0" onClick={onToggle} role="button">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">{group.productName}</span>
            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{group.skuIds.length}종 SKU</span>
            {/* 시즌 배지 */}
            {group.seasonLabel && (
              <span className={cn(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full border',
                group.seasonType === 'SS'
                  ? 'bg-cyan-50 text-cyan-600 border-cyan-100'
                  : group.seasonType === 'FW'
                  ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              )}>
                {group.seasonType === 'SS' ? '🌸' : group.seasonType === 'FW' ? '❄️' : '🍃'} {group.seasonLabel}
              </span>
            )}
            {group.urgentCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="w-2.5 h-2.5" />긴급 {group.urgentCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className={cn('w-1.5 h-1.5 rounded-full inline-block flex-shrink-0', PRIORITY_DOT[group.highestPriority])} />
            <span className="text-[11px] text-gray-400">{group.activeCount}건 회수대상</span>
            {sellThrough !== null && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-300">ST</span>
                <SellThroughBar pct={sellThrough} size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* 통계 (데스크탑) */}
        <div className="hidden sm:flex items-center gap-5 flex-shrink-0" onClick={onToggle} role="button">
          <div className="text-center w-20">
            <PriorityBadge priority={group.highestPriority} />
          </div>
          <div className="text-right w-16">
            <div className="text-sm font-bold text-brand-600 tabular-nums">{formatNumber(group.totalRecallQty)}개</div>
            <div className="text-[10px] text-gray-400">회수 수량</div>
          </div>
          <div className="text-right w-14 hidden md:block">
            <div className="text-sm font-bold text-gray-700 tabular-nums">{group.storeCount}</div>
            <div className="text-[10px] text-gray-400">매장</div>
          </div>
        </div>

        {/* 펼치기 버튼 */}
        <button onClick={onToggle} className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* 펼친 내용: SKU별 상세 */}
      {expanded && (
        <div className="border-t border-orange-100/60">
          {group.skuIds.map((skuId) => (
            <SkuSection
              key={skuId}
              skuId={skuId}
              recalls={group.recalls.filter((r) => r.productId === skuId)}
              storeStocks={storeStocks}
              centerStocks={centerStocks}
              selectedIds={selectedIds}
              onItemCheck={onItemCheck}
              onItemAction={onItemAction}
              onRevert={onRevert}
              getStore={getStore}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SKU 섹션 ─────────────────────────────────────────────────────
function SkuSection({
  skuId, recalls, storeStocks, centerStocks, selectedIds, onItemCheck, onItemAction, onRevert, getStore,
}: {
  skuId: string
  recalls: RecallItem[]
  storeStocks: ReturnType<typeof useAppStore.getState>['storeStocks']
  centerStocks: ReturnType<typeof useAppStore.getState>['centerStocks']
  selectedIds: Set<string>
  onItemCheck: (id: string) => void
  onItemAction: (item: RecallItem) => void
  onRevert: (id: string) => void
  getStore: ReturnType<typeof useAppStore.getState>['getStore']
}) {
  const { getProduct, updateRecallStatus, periodSales } = useAppStore()
  const product = getProduct(skuId)
  const centerQty = centerStocks.find((c) => c.productId === skuId)?.qty ?? 0

  // SKU sell-through (오프라인 판매 / (판매 + 매장 잔여재고))
  const skuSellThrough = useMemo(() => {
    const totalStoreQty = storeStocks.filter((s) => s.productId === skuId).reduce((s, ss) => s + ss.qty, 0)
    const totalSold = periodSales.filter((p) => p.channel === 'offline' && p.productId === skuId).reduce((s, p) => s + p.totalQty, 0)
    if (totalSold + totalStoreQty === 0) return null
    return Math.round((totalSold / (totalSold + totalStoreQty)) * 100)
  }, [skuId, storeStocks, periodSales])

  // 재고 있는 매장 + 회수 대상 매장 모두 포함
  const skuStoreStocks = storeStocks.filter((s) => s.productId === skuId && s.qty > 0)
  const totalStoreQtyForSku = skuStoreStocks.reduce((sum, s) => sum + s.qty, 0)
  const recallStoreIds = new Set(recalls.map((r) => r.storeId))
  const allStoreIds = [...new Set([...skuStoreStocks.map((s) => s.storeId), ...recalls.map((r) => r.storeId)])]

  // 회수 대상 매장 먼저, 그다음 재고 많은 순
  const sortedStoreIds = allStoreIds.sort((a, b) => {
    const aRecall = recalls.find((r) => r.storeId === a)
    const bRecall = recalls.find((r) => r.storeId === b)
    if (aRecall && !bRecall) return -1
    if (!aRecall && bRecall) return 1
    if (aRecall && bRecall) return PRIORITY_ORDER[aRecall.priority] - PRIORITY_ORDER[bRecall.priority]
    const aQty = skuStoreStocks.find((s) => s.storeId === a)?.qty ?? 0
    const bQty = skuStoreStocks.find((s) => s.storeId === b)?.qty ?? 0
    return bQty - aQty
  })

  return (
    <div className="ml-14 mr-4 my-2 rounded-xl border border-gray-100 overflow-hidden">
      {/* SKU 헤더 */}
      <div className="flex items-center gap-3 px-3 py-2 bg-gray-50/80 border-b border-gray-100">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 flex-1 min-w-0">
          <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          {(() => {
            const optionLabel = [product?.color, product?.size].filter(Boolean).join(' / ')
            return optionLabel ? (
              <>
                <span className="font-semibold text-gray-800">{optionLabel}</span>
                <span className="text-[11px] text-gray-400 font-mono font-normal">({skuId})</span>
              </>
            ) : (
              <span className="font-mono text-gray-700">{skuId}</span>
            )
          })()}
          {skuSellThrough !== null && (
            <div className="flex items-center gap-1 ml-2">
              <span className="text-[10px] text-gray-300 font-normal">ST</span>
              <SellThroughBar pct={skuSellThrough} size="xs" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1">
            <Store className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-500">매장합계</span>
            <span className="text-xs font-bold ml-1 text-gray-700">{formatNumber(totalStoreQtyForSku)}개</span>
          </div>
          <div className="flex items-center gap-1">
            <Warehouse className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-500">센터재고</span>
            <span className={cn('text-xs font-bold ml-1', centerQty === 0 ? 'text-red-500' : 'text-gray-800')}>
              {formatNumber(centerQty)}개
            </span>
          </div>
        </div>
      </div>

      {/* 매장별 행 테이블 */}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white border-b border-gray-50">
            <th className="w-8 px-2 py-1.5" />
            <th className="text-left px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
              <div className="flex items-center gap-1"><Store className="w-3 h-3" /> 매장</div>
            </th>
            <th className="text-right px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">매장재고</th>
            <th className="text-right px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">회수수량</th>
            <th className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">상태</th>
            <th className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">사유</th>
            <th className="text-right px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">액션</th>
          </tr>
        </thead>
        <tbody>
          {sortedStoreIds.map((storeId) => {
            const recall = recalls.find((r) => r.storeId === storeId)
            const storeQty = storeStocks.find((s) => s.productId === skuId && s.storeId === storeId)?.qty ?? 0
            const store = getStore(storeId)
            const checked = recall ? selectedIds.has(recall.id) : false

            return (
              <tr key={storeId} className={cn(
                'border-b border-gray-50 last:border-0 transition-colors',
                checked ? 'bg-brand-50/40' : recall ? 'hover:bg-orange-50/30' : 'hover:bg-gray-50/30'
              )}>
                {/* 체크박스 */}
                <td className="w-8 px-2 py-2.5 text-center">
                  {recall && (
                    <button onClick={() => onItemCheck(recall.id)} className="text-gray-300 hover:text-brand-500 transition-colors">
                      {checked ? <CheckSquare className="w-3.5 h-3.5 text-brand-500" /> : <Square className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </td>

                {/* 매장명 */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0',
                      recall ? PRIORITY_DOT[recall.priority] : 'bg-gray-200')} />
                    <span className="text-sm text-gray-700">{store?.name ?? storeId}</span>
                  </div>
                </td>

                {/* 매장 재고 */}
                <td className="px-3 py-2.5 text-right">
                  <span className="text-sm font-semibold tabular-nums text-gray-800">{formatNumber(storeQty)}개</span>
                </td>

                {/* 회수 수량 */}
                <td className="px-3 py-2.5 text-right">
                  {recall ? (
                    <span className="text-sm font-bold text-brand-600 tabular-nums">→ {formatNumber(recall.suggestedQty)}개</span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>

                {/* 상태 */}
                <td className="px-3 py-2.5">
                  {recall ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      <PriorityBadge priority={recall.priority} />
                      <StatusBadge status={recall.status} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[11px] text-gray-400">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />회수불필요
                    </div>
                  )}
                </td>

                {/* 사유 (호버 툴팁) */}
                <td className="px-3 py-2.5 max-w-[160px]">
                  {recall?.reason ? (
                    <Tooltip content={recall.reason}>
                      <span className="text-[11px] text-gray-400 truncate block cursor-help max-w-[140px]">
                        {recall.reason}
                      </span>
                    </Tooltip>
                  ) : null}
                </td>

                {/* 액션 */}
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {recall?.status === 'recommended' && (
                      <button onClick={() => onItemAction(recall)}
                        className="px-2.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                        회수 요청
                      </button>
                    )}
                    {recall?.status === 'requested' && (
                      <button onClick={() => updateRecallStatus(recall.id, 'in-transit')}
                        className="px-2.5 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                        이송 처리
                      </button>
                    )}
                    {recall?.status === 'in-transit' && (
                      <button onClick={() => updateRecallStatus(recall.id, 'received', recall.requestedQty)}
                        className="px-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                        입고 확인
                      </button>
                    )}
                    {recall?.status === 'received' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-green-600 font-medium">완료</span>
                        <button
                          onClick={() => onRevert(recall.id)}
                          title="입고완료 취소 → 이송중으로 원복"
                          className="flex items-center gap-0.5 px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-orange-600 bg-gray-100 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-md transition-colors"
                        >
                          <Undo2 className="w-2.5 h-2.5" />원복
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── 매장 × 상품 히트맵 ──────────────────────────────────────────
function StoreHeatmap({
  recallItems, stores, storeStocks, products,
}: {
  recallItems: RecallItem[]
  stores: ReturnType<typeof useAppStore.getState>['stores']
  storeStocks: ReturnType<typeof useAppStore.getState>['storeStocks']
  products: ReturnType<typeof useAppStore.getState>['products']
}) {
  // 활성 회수 항목만 (받은 것, 취소된 것 제외)
  const active = recallItems.filter((r) => r.status !== 'received' && r.status !== 'cancelled')
  if (active.length === 0) return null

  // 상위 상품 (PKU 기준, 긴급→높음→많은 건수 순)
  type PkuMeta = { name: string; skuIds: string[]; minPriority: number; count: number }
  const pkuMap = new Map<string, PkuMeta>()
  for (const r of active) {
    const p = products.find((x) => x.id === r.productId)
    const name = p?.name ?? r.productId
    const prev = pkuMap.get(name) ?? { name, skuIds: [], minPriority: 3, count: 0 }
    if (!prev.skuIds.includes(r.productId)) prev.skuIds.push(r.productId)
    pkuMap.set(name, {
      ...prev,
      minPriority: Math.min(prev.minPriority, PRIORITY_ORDER[r.priority]),
      count: prev.count + 1,
    })
  }
  const topPkus = [...pkuMap.values()]
    .sort((a, b) => a.minPriority - b.minPriority || b.count - a.count)
    .slice(0, 10)

  // 회수 대상 매장 (긴급 건수 많은 순)
  const recallStoreIds = new Set(active.map((r) => r.storeId))
  const relevantStores = stores
    .filter((s) => recallStoreIds.has(s.id))
    .sort((a, b) => {
      const aU = active.filter((r) => r.storeId === a.id && r.priority === 'urgent').length
      const bU = active.filter((r) => r.storeId === b.id && r.priority === 'urgent').length
      return bU - aU || active.filter((r) => r.storeId === b.id).length - active.filter((r) => r.storeId === a.id).length
    })

  type CellState = RecallPriority | 'none' | 'empty'
  const CELL: Record<CellState, { bg: string; text: string; label: string }> = {
    urgent: { bg: 'bg-red-100 border-red-200',     text: 'text-red-600 font-bold',     label: '긴급' },
    high:   { bg: 'bg-orange-100 border-orange-200', text: 'text-orange-600 font-semibold', label: '높음' },
    medium: { bg: 'bg-yellow-100 border-yellow-200', text: 'text-yellow-700',           label: '보통' },
    low:    { bg: 'bg-sky-50 border-sky-100',       text: 'text-sky-600',               label: '낮음' },
    none:   { bg: 'bg-green-50 border-green-100',   text: 'text-green-500',             label: '양호' },
    empty:  { bg: 'bg-gray-50 border-gray-100',     text: 'text-gray-300',              label: '—' },
  }

  function getCell(storeId: string, skuIds: string[]): CellState {
    const hasStock = skuIds.some((id) =>
      storeStocks.some((s) => s.storeId === storeId && s.productId === id && s.qty > 0)
    )
    if (!hasStock) return 'empty'
    const recalls = active.filter((r) => r.storeId === storeId && skuIds.includes(r.productId))
    if (recalls.length === 0) return 'none'
    const minP = Math.min(...recalls.map((r) => PRIORITY_ORDER[r.priority]))
    return (['urgent', 'high', 'medium', 'low'] as RecallPriority[])[minP]
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-brand-400" />
          <span className="text-sm font-semibold text-gray-800">매장 × 상품 회수 현황</span>
          <span className="text-xs text-gray-400">
            상위 {topPkus.length}개 상품 · {relevantStores.length}개 매장
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
          {(['urgent', 'high', 'medium', 'low', 'none'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn('w-2.5 h-2.5 rounded border inline-block', CELL[s].bg)} />
              {CELL[s].label}
            </span>
          ))}
        </div>
      </div>

      {/* 히트맵 테이블 */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50/70 border-b border-gray-100">
              <th className="sticky left-0 z-10 bg-gray-50/90 text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 min-w-[100px] whitespace-nowrap">
                매장
              </th>
              {topPkus.map((p) => (
                <th key={p.name} className="px-2 py-2 text-center min-w-[68px]">
                  <div
                    className="text-[10px] font-medium text-gray-500 truncate max-w-[64px] mx-auto"
                    title={p.name}
                  >
                    {p.name.length > 7 ? p.name.slice(0, 7) + '…' : p.name}
                  </div>
                </th>
              ))}
              <th className="px-3 py-2 text-right text-[10px] font-normal text-gray-400 min-w-[52px] whitespace-nowrap">
                회수건수
              </th>
            </tr>
          </thead>
          <tbody>
            {relevantStores.map((store) => {
              const storeCount = active.filter((r) => r.storeId === store.id).length
              return (
                <tr
                  key={store.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors"
                >
                  <td className="sticky left-0 z-10 bg-white px-4 py-1.5 text-[12px] text-gray-700 font-medium whitespace-nowrap border-r border-gray-50">
                    {store.name}
                  </td>
                  {topPkus.map((p) => {
                    const state = getCell(store.id, p.skuIds)
                    const c = CELL[state]
                    const tooltipText = state !== 'empty'
                      ? `${store.name} · ${p.name}\n→ ${c.label}`
                      : ''
                    return (
                      <td key={p.name} className="px-1 py-1">
                        <Tooltip content={tooltipText}>
                          <div className={cn(
                            'mx-auto rounded-lg border text-center py-1 w-14 text-[10px] leading-none',
                            c.bg, c.text
                          )}>
                            {c.label}
                          </div>
                        </Tooltip>
                      </td>
                    )
                  })}
                  <td className="px-3 py-1.5 text-right">
                    <span className={cn(
                      'text-[11px] font-semibold tabular-nums',
                      storeCount >= 5 ? 'text-red-500' : storeCount >= 3 ? 'text-orange-500' : 'text-gray-500'
                    )}>
                      {storeCount}건
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 범례 설명 */}
      <div className="px-4 py-2 border-t border-gray-50 text-[10px] text-gray-400">
        재고 없음 = 셀 없음(—) · 재고 있고 회수불필요 = 양호(초록) · 회수대상 = 우선순위 색상
      </div>
    </div>
  )
}

// helper for type inference
const buildGroup = (g: {
  key: string; productName: string; imageUrl?: string; skuIds: string[]; recalls: RecallItem[]
  highestPriority: RecallPriority; urgentCount: number; highCount: number
  totalRecallQty: number; storeCount: number; activeCount: number
  seasonType: 'SS' | 'FW' | null; seasonLabel: string; seasonInferred: boolean
}) => g

// ─── 데이터 현황 패널 ────────────────────────────────────────────
function DataStatusPanel() {
  const { centerStocks, storeStocks, periodSales, stores, products, settings } = useAppStore()
  const hasCenter = centerStocks.length > 0
  const hasStore = storeStocks.length > 0
  const onlineSales = periodSales.filter((p) => p.channel === 'online')
  const coupangSales = periodSales.filter((p) => p.channel === 'coupang')
  const offlineSales = periodSales.filter((p) => p.channel === 'offline')
  const hasOnline = onlineSales.length > 0
  const hasCoupang = coupangSales.length > 0
  const hasOffline = offlineSales.length > 0
  const hasAnySales = hasOnline || hasCoupang

  const today = new Date()
  const seasonLabel = getCurrentSeasonLabel(today)
  const todayStr = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  // 시즌 종료까지 남은 일수
  const seasonEndDate = new Date(settings.seasonEndDate)
  const remainDays = Math.max(0, Math.ceil((seasonEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
  const isSeasonUrgent = remainDays <= 30
  const isSeasonSoon = remainDays <= 60

  const items = [
    { label: '센터재고', ok: hasCenter, detail: hasCenter ? `${products.length.toLocaleString()}종` : null, required: true },
    { label: '매장재고', ok: hasStore, detail: hasStore ? `${stores.length}매장` : null, required: true },
    { label: '온라인판매', ok: hasOnline, detail: hasOnline ? `${onlineSales.length}건` : null, required: true },
    { label: '쿠팡', ok: hasCoupang, detail: hasCoupang ? `${coupangSales.length}건` : null, required: false },
    { label: '매장판매', ok: hasOffline, detail: hasOffline ? `${offlineSales.length}건` : null, required: false },
  ]
  const allOk = items.filter((i) => i.required).every((i) => i.ok)

  return (
    <div className={cn('rounded-2xl border px-4 py-3',
      allOk ? 'bg-white border-gray-100' : !hasAnySales && (hasCenter || hasStore) ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100')}>
      <div className="flex flex-wrap items-center gap-2">
        {/* 시즌 배지 */}
        <div className={cn('flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold border mr-1',
          isSeasonUrgent ? 'bg-red-50 text-red-600 border-red-100'
          : isSeasonSoon ? 'bg-orange-50 text-orange-600 border-orange-100'
          : 'bg-brand-50 text-brand-700 border-brand-100')}>
          <CalendarDays className="w-3 h-3 flex-shrink-0" />
          <span>{todayStr}</span>
          <span className="opacity-50">·</span>
          <span>{seasonLabel}</span>
          {remainDays > 0 && (
            <span className="opacity-70">· 시즌 {remainDays}일 남음</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500">데이터 현황</span>
        </div>
        {items.map((item) => (
          <div key={item.label} className={cn('flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium border',
            item.ok ? 'bg-green-50 text-green-700 border-green-100'
              : item.required ? 'bg-red-50 text-red-500 border-red-100'
              : 'bg-gray-50 text-gray-400 border-gray-100')}>
            {item.ok ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <XCircle className="w-3 h-3 flex-shrink-0" />}
            {item.label}{item.detail && <span className="opacity-60">· {item.detail}</span>}
          </div>
        ))}
        {!allOk && (
          <Link to="/upload" className="ml-auto text-[11px] font-semibold text-brand-600 hover:underline whitespace-nowrap">
            업로드하기 →
          </Link>
        )}
      </div>
      {!hasAnySales && (hasCenter || hasStore) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <strong>온라인 판매 데이터가 없으면 분석 결과가 0건</strong>이 됩니다 — 이지어드민 어드민상품매출통계를 업로드하세요
        </div>
      )}
    </div>
  )
}

// ─── 통계 카드 (클릭 가능) ────────────────────────────────────────
type AccentColor = 'orange' | 'red' | 'amber' | 'green'
const ACCENT: Record<AccentColor, { icon: string; top: string; val: string; ring: string }> = {
  orange: { icon: 'bg-orange-50 text-orange-500', top: 'bg-orange-500', val: 'text-orange-600', ring: 'ring-orange-300' },
  red:    { icon: 'bg-red-50 text-red-500',       top: 'bg-red-500',    val: 'text-red-600',    ring: 'ring-red-300' },
  amber:  { icon: 'bg-amber-50 text-amber-500',   top: 'bg-amber-400',  val: 'text-amber-600',  ring: 'ring-amber-300' },
  green:  { icon: 'bg-green-50 text-green-500',   top: 'bg-green-500',  val: 'text-green-600',  ring: 'ring-green-300' },
}

function StatCard({ label, value, sub, icon: Icon, accent, active, onClick }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType
  accent: AccentColor; active?: boolean; onClick?: () => void
}) {
  const c = ACCENT[accent]
  return (
    <button
      onClick={onClick}
      className={cn(
        'bg-white rounded-2xl border shadow-sm overflow-hidden text-left w-full transition-all',
        active ? `border-gray-200 ring-2 ${c.ring} scale-[1.02]` : 'border-gray-100 hover:border-gray-200 hover:shadow-md'
      )}
    >
      <div className={cn('h-1', c.top)} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', c.icon)}>
            <Icon className="w-4 h-4" />
          </div>
          {active && <span className="text-[10px] text-gray-400 font-medium">필터 중</span>}
        </div>
        <div className={cn('text-2xl font-bold tabular-nums', c.val)}>{value}</div>
        <div className="text-xs font-medium text-gray-600 mt-0.5">{label}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </button>
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
          <Link to="/upload" className="inline-block px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors">
            데이터 업로드하기
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-5">데이터 준비 완료 · 왼쪽 하단 <strong>'회수 분석 실행'</strong> 버튼을 클릭하세요</p>
          <button onClick={onGenerate} className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors">
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
      {ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        : critical ? <AlertCircle className="w-4 h-4 flex-shrink-0" />
        : <XCircle className="w-4 h-4 flex-shrink-0 text-gray-300" />}
      {label}
      {!ok && critical && <span className="text-xs bg-red-50 text-red-400 px-1.5 py-0.5 rounded-full">분석에 필수</span>}
    </div>
  )
}
