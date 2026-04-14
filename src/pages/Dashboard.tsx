import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
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
  Download,
  Send,
  Square,
  CheckSquare,
  Loader2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { PriorityBadge, StatusBadge, ScoreBar } from '../components/RecallPriorityBadge'
import StoreRecallModal from '../components/StoreRecallModal'
import { cn, formatNumber } from '../utils/helpers'
import type { RecallItem, RecallPriority, RecallStatus } from '../types'

type SortKey = 'recallScore' | 'suggestedQty' | 'priority' | 'status'
const PRIORITY_ORDER: Record<RecallPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const PAGE_SIZE = 30

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
    return [
      s?.name ?? item.storeId,
      p?.name ?? item.productId,
      item.productId,
      PRIORITY_KO[item.priority],
      item.suggestedQty,
      STATUS_KO[item.status],
      item.reason,
      new Date(item.createdAt).toLocaleDateString('ko-KR'),
    ]
  })
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(escape).join(',')).join('\n')
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
  const PRIORITY_EMOJI: Record<RecallPriority, string> = { urgent: '🔴', high: '🟠', medium: '🟡', low: '⚪' }
  const lines = items.map((item) => {
    const p = products.find((x) => x.id === item.productId)
    const s = stores.find((x) => x.id === item.storeId)
    return `${PRIORITY_EMOJI[item.priority]} *${s?.name ?? item.storeId}* | ${p?.name ?? item.productId} | *${item.suggestedQty}개*`
  })
  const now = new Date().toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const text = `🚚 *OZKIZ 회수 요청 (${items.length}건)*\n📅 ${now}\n\n${lines.join('\n')}\n\n_회수 담당자는 각 매장 매니저에게 회수 요청을 진행해주세요._`
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────
export default function Dashboard() {
  const { recallItems, products, stores, settings, generateRecalls, updateRecallStatus } = useAppStore()
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<RecallPriority | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<RecallStatus | 'all'>('all')
  const [filterStore, setFilterStore] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('recallScore')
  const [sortAsc, setSortAsc] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RecallItem | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // 다중 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 일괄 요청 상태
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // 무한 스크롤
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

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

  // 필터 변경 시 카운트 초기화
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
    setSelectedIds(new Set())
  }, [search, filterPriority, filterStatus, filterStore, sortKey, sortAsc])

  // 무한 스크롤
  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length))
  }, [filtered.length])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  const visibleList = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  // 회수권장 상태인 선택 항목
  const selectedRecommended = filtered.filter(
    (r) => selectedIds.has(r.id) && r.status === 'recommended'
  )

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const allIds = new Set(filtered.map((r) => r.id))
    const allSelected = filtered.every((r) => selectedIds.has(r.id))
    setSelectedIds(allSelected ? new Set() : allIds)
  }

  async function handleBulkRequest() {
    if (selectedRecommended.length === 0) return
    setSending(true)
    setSendResult(null)
    try {
      // 상태를 '요청됨'으로 변경
      selectedRecommended.forEach((item) => updateRecallStatus(item.id, 'requested'))

      // Google Chat 전송
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
      {/* 데이터 현황 패널 */}
      <DataStatusPanel />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="회수 대상" value={formatNumber(stats.total)} sub={`총 ${formatNumber(stats.totalSuggestedQty)}개`} icon={Package} accent="orange" />
        <StatCard label="긴급 회수" value={formatNumber(stats.urgent)} sub="즉시 처리 필요" icon={AlertTriangle} accent="red" />
        <StatCard label="이송 중" value={formatNumber(stats.inTransit)} sub="진행 중" icon={TrendingUp} accent="amber" />
        <StatCard label="입고 완료" value={formatNumber(stats.completed)} sub="이번 시즌 누계" icon={CheckCircle} accent="green" />
      </div>

      {/* 알림 결과 토스트 */}
      {sendResult && (
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border',
          sendResult.ok
            ? 'bg-green-50 text-green-700 border-green-100'
            : 'bg-red-50 text-red-600 border-red-100'
        )}>
          {sendResult.ok
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {sendResult.msg}
        </div>
      )}

      {/* 빈 상태 */}
      {!hasData && <EmptyState onGenerate={generateRecalls} />}

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
            {/* 다운로드 버튼 */}
            <button
              onClick={() => downloadRecallCSV(filtered, products, stores)}
              className="flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
              title="현재 목록 엑셀 다운로드"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">다운로드</span>
            </button>
            <div className="hidden sm:flex items-center text-xs text-gray-400 px-1">
              {filtered.length}건
            </div>
          </div>

          {/* 필터 패널 */}
          {showFilters && (
            <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-100 flex flex-wrap gap-2 items-center">
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as RecallPriority | 'all')}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
                <option value="all">전체 우선순위</option>
                <option value="urgent">긴급</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as RecallStatus | 'all')}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
                <option value="all">전체 상태</option>
                <option value="recommended">회수 권장</option>
                <option value="requested">요청됨</option>
                <option value="in-transit">이송 중</option>
                <option value="received">입고 완료</option>
              </select>
              <select value={filterStore} onChange={(e) => setFilterStore(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
                <option value="all">전체 매장</option>
                {storeList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <span className="text-xs text-gray-400 sm:hidden">{filtered.length}건</span>
            </div>
          )}

          {/* 일괄 액션 바 (선택 시 나타남) */}
          {selectedIds.size > 0 && (
            <div className="px-4 py-2.5 bg-brand-50 border-b border-brand-100 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-brand-700">
                {selectedIds.size}건 선택됨
                {selectedRecommended.length > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-brand-500">
                    (회수권장 {selectedRecommended.length}건)
                  </span>
                )}
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-brand-500 hover:text-brand-700 underline"
              >
                선택 해제
              </button>
              <div className="flex items-center gap-2 ml-auto">
                {/* 선택 항목만 다운로드 */}
                <button
                  onClick={() => downloadRecallCSV(
                    filtered.filter((r) => selectedIds.has(r.id)),
                    products, stores, '선택회수목록'
                  )}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  엑셀 다운로드
                </button>
                {/* Google Chat + 상태 변경 */}
                {selectedRecommended.length > 0 && (
                  <button
                    onClick={handleBulkRequest}
                    disabled={sending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors disabled:opacity-60"
                  >
                    {sending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />}
                    회수 요청 발송 ({selectedRecommended.length}건)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {/* 전체선택 체크박스 */}
                  <th className="w-10 px-3 py-2.5 text-center">
                    <button
                      onClick={toggleSelectAll}
                      className="text-gray-400 hover:text-brand-500 transition-colors"
                      title={filtered.every((r) => selectedIds.has(r.id)) ? '전체 해제' : '전체 선택'}
                    >
                      {filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id))
                        ? <CheckSquare className="w-4 h-4 text-brand-500" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="w-1 p-0" />
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">상품</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">매장</th>
                  <SortTh label="우선순위" sortKey="priority" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                  <SortTh label="점수" sortKey="recallScore" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                  <SortTh label="권장수량" sortKey="suggestedQty" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">상태</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">회수 사유</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-14 text-gray-400 text-sm">
                      조건에 맞는 항목이 없습니다
                    </td>
                  </tr>
                ) : (
                  visibleList.map((item) => (
                    <RecallRow
                      key={item.id}
                      item={item}
                      checked={selectedIds.has(item.id)}
                      onCheck={() => toggleSelect(item.id)}
                      onAction={() => setSelectedItem(item)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 무한 스크롤 sentinel */}
          <div ref={sentinelRef} className="h-2" />
          {hasMore && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-gray-400 border-t border-gray-50">
              <svg className="w-4 h-4 animate-spin text-brand-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
              불러오는 중… ({visibleCount}/{filtered.length})
            </div>
          )}
          {!hasMore && filtered.length > PAGE_SIZE && (
            <div className="text-center py-3 text-xs text-gray-300 border-t border-gray-50">
              전체 {filtered.length}건 표시 완료
            </div>
          )}
        </div>
      )}

      {/* 회수 모달 */}
      {selectedItem && (
        <StoreRecallModal item={selectedItem} onClose={() => setSelectedItem(null)} />
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
    { label: '센터재고', ok: hasCenter, detail: hasCenter ? `${products.length.toLocaleString()}종` : null, required: true },
    { label: '매장재고', ok: hasStore, detail: hasStore ? `${stores.length}매장` : null, required: true },
    { label: '온라인판매', ok: hasOnline, detail: hasOnline ? `${onlineSales.length}건` : null, required: true },
    { label: '쿠팡', ok: hasCoupang, detail: hasCoupang ? `${coupangSales.length}건` : null, required: false },
    { label: '매장판매', ok: hasOffline, detail: hasOffline ? `${offlineSales.length}건` : null, required: false },
  ]

  const missingRequired = items.filter((i) => i.required && !i.ok)
  const allOk = missingRequired.length === 0

  return (
    <div className={cn(
      'rounded-2xl border px-4 py-3',
      allOk ? 'bg-white border-gray-100'
        : !hasAnySales && (hasCenter || hasStore) ? 'bg-amber-50 border-amber-100'
        : 'bg-white border-gray-100'
    )}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 mr-1">
          <Layers className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500">데이터 현황</span>
        </div>
        {items.map((item) => (
          <div key={item.label} className={cn(
            'flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium border',
            item.ok ? 'bg-green-50 text-green-700 border-green-100'
              : item.required ? 'bg-red-50 text-red-500 border-red-100'
              : 'bg-gray-50 text-gray-400 border-gray-100'
          )}>
            {item.ok ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <XCircle className="w-3 h-3 flex-shrink-0" />}
            {item.label}
            {item.detail && <span className="opacity-60">· {item.detail}</span>}
          </div>
        ))}
        {!allOk && (
          <Link to="/upload" className="ml-auto text-[11px] font-semibold text-brand-600 hover:text-brand-700 hover:underline whitespace-nowrap">
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
type AccentColor = 'orange' | 'red' | 'amber' | 'green'
const ACCENT: Record<AccentColor, { icon: string; top: string; val: string }> = {
  orange: { icon: 'bg-orange-50 text-orange-500', top: 'bg-orange-500', val: 'text-orange-600' },
  red:    { icon: 'bg-red-50 text-red-500',       top: 'bg-red-500',    val: 'text-red-600' },
  amber:  { icon: 'bg-amber-50 text-amber-500',   top: 'bg-amber-400',  val: 'text-amber-600' },
  green:  { icon: 'bg-green-50 text-green-500',   top: 'bg-green-500',  val: 'text-green-600' },
}

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; accent: AccentColor
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
function SortTh({ label, sortKey, current, asc, onToggle }: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean; onToggle: (k: SortKey) => void
}) {
  return (
    <th
      className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-800 select-none"
      onClick={() => onToggle(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn('w-3 h-3', current === sortKey ? 'text-brand-500' : 'text-gray-300')} />
      </div>
    </th>
  )
}

// ─── 회수 행 ─────────────────────────────────────────────────────
const PRIORITY_BORDER: Record<RecallPriority, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-200',
}

function RecallRow({
  item, checked, onCheck, onAction,
}: {
  item: RecallItem
  checked: boolean
  onCheck: () => void
  onAction: () => void
}) {
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
    <tr className={cn(
      'border-b border-gray-50 last:border-0 transition-colors',
      checked ? 'bg-brand-50/40' : 'hover:bg-slate-50/60'
    )}>
      {/* 체크박스 */}
      <td className="w-10 px-3 py-3 text-center">
        <button onClick={onCheck} className="text-gray-300 hover:text-brand-500 transition-colors">
          {checked
            ? <CheckSquare className="w-4 h-4 text-brand-500" />
            : <Square className="w-4 h-4" />}
        </button>
      </td>

      {/* 우선순위 컬러 바 */}
      <td className="w-1 p-0">
        <div className={cn('w-[3px] min-h-[52px] h-full', PRIORITY_BORDER[item.priority])} />
      </td>

      {/* 상품 */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {product?.imageUrl ? (
            <img src={product.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
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
      <td className="px-3 py-3"><PriorityBadge priority={item.priority} /></td>

      {/* 점수 */}
      <td className="px-3 py-3 min-w-[110px]"><ScoreBar score={item.recallScore} /></td>

      {/* 권장 수량 */}
      <td className="px-3 py-3">
        {editingQty ? (
          <input
            autoFocus type="number" min={0} value={qtyInput}
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
      <td className="px-3 py-3"><StatusBadge status={item.status} /></td>

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
            <button onClick={onAction}
              className="px-2.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
              회수 요청
            </button>
          )}
          {item.status === 'requested' && (
            <button onClick={() => updateRecallStatus(item.id, 'in-transit')}
              className="px-2.5 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
              이송 처리
            </button>
          )}
          {item.status === 'in-transit' && (
            <button onClick={() => updateRecallStatus(item.id, 'received', item.requestedQty)}
              className="px-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
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
            <Link to="/upload"
              className="inline-block px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors">
              데이터 업로드하기
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-5">
            데이터 준비 완료 · 왼쪽 하단 <strong>'회수 분석 실행'</strong> 버튼을 클릭하세요
          </p>
          <button onClick={onGenerate}
            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors">
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
