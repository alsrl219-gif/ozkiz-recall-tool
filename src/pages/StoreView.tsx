import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  Search, Package, ChevronDown, ChevronRight,
  Store, AlertTriangle, CheckCircle2, ArrowRight, Warehouse, LayoutList, LayoutGrid,
  TrendingUp,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PriorityBadge, StatusBadge } from '../components/RecallPriorityBadge'
import StoreRecallModal from '../components/StoreRecallModal'
import { cn, formatNumber } from '../utils/helpers'
import type { RecallItem, RecallPriority } from '../types'

const PAGE_SIZE = 20
const PRIORITY_DOT: Record<RecallPriority, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-300',
}

// ─── 커스텀 툴팁 ────────────────────────────────────────────────
function Tooltip({ text, children, align = 'right' }: {
  text: string
  children: React.ReactNode
  align?: 'center' | 'right'  // right: 오른쪽 정렬(왼쪽으로 펼침), center: 가운데 정렬
}) {
  const boxPos = align === 'right'
    ? 'right-0'           // 트리거 오른쪽 끝 기준 → 왼쪽으로 펼쳐짐
    : 'left-1/2 -translate-x-1/2'  // 가운데 정렬
  const tailPos = align === 'right'
    ? 'right-2'
    : 'left-1/2 -translate-x-1/2'
  return (
    <span className="relative group inline-flex items-center cursor-help">
      {children}
      <span className={cn(
        'pointer-events-none absolute bottom-full mb-2 z-[9999]',
        boxPos,
        'w-72 rounded-xl bg-gray-900 text-white text-xs leading-relaxed p-3 shadow-2xl',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        'whitespace-pre-line text-left'
      )}>
        {text}
        {/* 말풍선 꼬리 */}
        <span className={cn(
          'absolute top-full border-4 border-transparent border-t-gray-900',
          tailPos
        )} />
      </span>
    </span>
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

export default function StoreView() {
  const { products, storeStocks, stores, centerStocks, recallItems, periodSales, getStore, updateRecallStatus } = useAppStore()
  const [search, setSearch] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [selectedItem, setSelectedItem] = useState<RecallItem | null>(null)
  const [filterMode, setFilterMode] = useState<'all' | 'recall'>('all')
  const [viewMode, setViewMode] = useState<'product' | 'store'>('product')
  const [expandedPkuKeys, setExpandedPkuKeys] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // 매장 재고가 있는 상품 ID 집합
  const stockedProductIds = useMemo(
    () => new Set(storeStocks.filter((s) => s.qty > 0).map((s) => s.productId)),
    [storeStocks]
  )

  // ── ① 상품별 PKU 그룹 ────────────────────────────────────────
  const pkuGroups = useMemo(() => {
    const map = new Map<string, {
      key: string
      productName: string
      imageUrl?: string
      skus: Array<{
        product: ReturnType<typeof useAppStore.getState>['products'][0]
        myStocks: ReturnType<typeof useAppStore.getState>['storeStocks']
        totalStoreQty: number
        centerQty: number
        myRecalls: RecallItem[]
        urgentCount: number
        sellThrough: number | null
      }>
    }>()

    for (const product of products) {
      if (!stockedProductIds.has(product.id)) continue
      const key = product.name
      if (!map.has(key)) {
        map.set(key, { key, productName: key, imageUrl: product.imageUrl, skus: [] })
      }
      const myStocks = storeStocks.filter((s) => s.productId === product.id && s.qty > 0)
      const totalStoreQty = myStocks.reduce((s, i) => s + i.qty, 0)
      const centerQty = centerStocks.find((c) => c.productId === product.id)?.qty ?? 0
      const myRecalls = recallItems.filter(
        (r) => r.productId === product.id && r.status !== 'received' && r.status !== 'cancelled'
      )
      const urgentCount = myRecalls.filter((r) => r.priority === 'urgent').length
      const soldQty = periodSales.filter((p) => p.channel === 'offline' && p.productId === product.id).reduce((s, p) => s + p.totalQty, 0)
      const sellThrough = soldQty + totalStoreQty === 0 ? null : Math.round((soldQty / (soldQty + totalStoreQty)) * 100)

      map.get(key)!.skus.push({ product, myStocks, totalStoreQty, centerQty, myRecalls, urgentCount, sellThrough })
    }

    return Array.from(map.values())
      .map((g) => {
        const totalStoreQty = g.skus.reduce((s, sku) => s + sku.totalStoreQty, 0)
        const totalRecalls = g.skus.reduce((s, sku) => s + sku.myRecalls.length, 0)
        const urgentCount = g.skus.reduce((s, sku) => s + sku.urgentCount, 0)
        const hasRecall = totalRecalls > 0
        const storeIds = new Set(g.skus.flatMap((sku) => sku.myStocks.map((s) => s.storeId)))
        const validSTs = g.skus.map((sku) => sku.sellThrough).filter((v): v is number => v !== null)
        const groupSellThrough = validSTs.length > 0 ? Math.round(validSTs.reduce((s, v) => s + v, 0) / validSTs.length) : null
        return { ...g, totalStoreQty, totalRecalls, urgentCount, hasRecall, storeCount: storeIds.size, groupSellThrough }
      })
      .filter((g) => filterMode === 'all' || g.hasRecall)
      .filter((g) => {
        if (!search) return true
        const q = search.toLowerCase()
        return g.productName.toLowerCase().includes(q) || g.skus.some((sku) => sku.product.id.toLowerCase().includes(q))
      })
      .sort((a, b) => b.urgentCount - a.urgentCount || b.totalRecalls - a.totalRecalls)
  }, [products, storeStocks, centerStocks, recallItems, periodSales, search, filterMode, stockedProductIds])

  // ── ② 매장별 그룹 (PKU → SKU 2단계) ─────────────────────────
  const { storeGroups, salesPeriodLabel } = useMemo(() => {
    type SkuDetail = {
      productId: string
      optionLabel: string
      imageUrl?: string
      qty: number
      offlineSalesQty: number   // 전체 오프라인 판매 합계 (매장 구분 없음)
      dailyVelocity: number
      recall: RecallItem | undefined
    }
    type PkuInStore = {
      productName: string
      imageUrl?: string
      skus: SkuDetail[]
      totalStoreQty: number
      totalSalesQty: number     // 상품 전체 오프라인 판매 합계
      dailyVelocity: number
      recallCount: number
      urgentCount: number
    }
    type StoreGroup = {
      storeId: string
      storeName: string
      pkuGroups: PkuInStore[]
      pkuCount: number
      totalQty: number
      recallCount: number
      urgentCount: number
    }

    // 판매 기간 정보 추출
    const offlineSales = periodSales.filter((p) => p.channel === 'offline')
    let periodStart = '', periodEnd = '', periodDays = 0
    if (offlineSales.length > 0) {
      periodStart = offlineSales.reduce((m, p) => p.periodStart < m ? p.periodStart : m, offlineSales[0].periodStart)
      periodEnd   = offlineSales.reduce((m, p) => p.periodEnd   > m ? p.periodEnd   : m, offlineSales[0].periodEnd)
      periodDays  = Math.max(...offlineSales.map((p) => p.periodDays))
    }
    const fmt = (d: string) => d ? d.replace(/-/g, '.') : ''
    const label = periodStart
      ? `오프라인 전체 매장 판매 합계\n기간: ${fmt(periodStart)} ~ ${fmt(periodEnd)} (${periodDays}일)\n※ 매장별 분리 집계 데이터가 없어 전체 매장 합산 값으로 표시됩니다`
      : '오프라인 판매 합계 (기간 데이터 없음)'

    // 오프라인 판매 데이터 캐시 (productId → 집계)
    const salesCache = new Map<string, { qty: number; velocity: number }>()
    for (const p of offlineSales) {
      const cur = salesCache.get(p.productId) ?? { qty: 0, velocity: 0 }
      salesCache.set(p.productId, { qty: cur.qty + p.totalQty, velocity: cur.velocity + p.dailyVelocity })
    }

    // storeId → StoreGroup
    const storeMap = new Map<string, StoreGroup>()
    // storeId+productName → PkuInStore
    const pkuMap = new Map<string, PkuInStore>()

    for (const stock of storeStocks) {
      if (stock.qty <= 0) continue
      const store = getStore(stock.storeId)
      if (!storeMap.has(stock.storeId)) {
        storeMap.set(stock.storeId, {
          storeId: stock.storeId,
          storeName: store?.name ?? stock.storeId,
          pkuGroups: [],
          pkuCount: 0,
          totalQty: 0,
          recallCount: 0,
          urgentCount: 0,
        })
      }
      const sg = storeMap.get(stock.storeId)!
      const product = products.find((p) => p.id === stock.productId)
      const productName = product?.name ?? stock.productId
      const pkuKey = `${stock.storeId}::${productName}`

      if (!pkuMap.has(pkuKey)) {
        const pku: PkuInStore = {
          productName,
          imageUrl: product?.imageUrl,
          skus: [],
          totalStoreQty: 0,
          totalSalesQty: 0,
          dailyVelocity: 0,
          recallCount: 0,
          urgentCount: 0,
        }
        pkuMap.set(pkuKey, pku)
        sg.pkuGroups.push(pku)
      }
      const pku = pkuMap.get(pkuKey)!
      const optionLabel = [product?.color, product?.size].filter(Boolean).join(' / ')
      const sales = salesCache.get(stock.productId) ?? { qty: 0, velocity: 0 }
      const recall = recallItems.find(
        (r) => r.productId === stock.productId && r.storeId === stock.storeId
          && r.status !== 'received' && r.status !== 'cancelled'
      )

      pku.skus.push({ productId: stock.productId, optionLabel, imageUrl: product?.imageUrl, qty: stock.qty, offlineSalesQty: sales.qty, dailyVelocity: sales.velocity, recall })
      pku.totalStoreQty += stock.qty
      // 대표 SKU 1개의 판매량만 PKU에 기록 (첫 번째 SKU 기준으로 중복 방지)
      if (pku.skus.length === 1) {
        pku.totalSalesQty = sales.qty
        pku.dailyVelocity = sales.velocity
      }
      if (recall) { pku.recallCount++; if (recall.priority === 'urgent') pku.urgentCount++ }
      sg.totalQty += stock.qty
      if (recall) { sg.recallCount++; if (recall.priority === 'urgent') sg.urgentCount++ }
    }

    const result = Array.from(storeMap.values())
      .map((g) => ({
        ...g,
        pkuCount: g.pkuGroups.length,
        pkuGroups: g.pkuGroups
          .map((pku) => ({
            ...pku,
            skus: [...pku.skus].sort((a, b) => {
              if (a.recall && !b.recall) return -1
              if (!a.recall && b.recall) return 1
              return b.qty - a.qty
            }),
          }))
          .sort((a, b) => b.urgentCount - a.urgentCount || b.recallCount - a.recallCount || b.totalStoreQty - a.totalStoreQty),
      }))
      .filter((g) => filterMode === 'all' || g.recallCount > 0)
      .filter((g) => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
          g.storeName.toLowerCase().includes(q) ||
          g.pkuGroups.some((pku) =>
            pku.productName.toLowerCase().includes(q) ||
            pku.skus.some((sku) => sku.productId.toLowerCase().includes(q))
          )
        )
      })
      .sort((a, b) => b.urgentCount - a.urgentCount || b.recallCount - a.recallCount || b.totalQty - a.totalQty)

    return { storeGroups: result, salesPeriodLabel: label }
  }, [storeStocks, stores, products, periodSales, recallItems, search, filterMode, getStore])

  // ── 무한 스크롤 ───────────────────────────────────────────────
  const currentList = viewMode === 'product' ? pkuGroups : storeGroups
  useEffect(() => { setVisibleCount(PAGE_SIZE); setExpandedKeys(new Set()); setExpandedPkuKeys(new Set()) }, [search, filterMode, viewMode])

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, currentList.length))
  }, [currentList.length])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const ob = new IntersectionObserver(
      (e) => { if (e[0].isIntersecting) loadMore() },
      { rootMargin: '200px' }
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [loadMore])

  const visibleGroups = currentList.slice(0, visibleCount)
  const hasMore = visibleCount < currentList.length

  function toggleGroup(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function togglePku(key: string) {
    setExpandedPkuKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const totalPku = pkuGroups.length
  const recallPku = pkuGroups.filter((g) => g.hasRecall).length

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="전체 상품 (PKU)" value={totalPku} sub="매장 재고 있음" color="text-gray-700" />
        <SummaryCard label="회수 대상 상품" value={recallPku} sub="분석 결과" color="text-brand-600" />
        <SummaryCard label="전체 매장" value={stores.length} sub="등록된 매장" color="text-gray-700" />
      </div>

      {/* 뷰 모드 탭 + 검색 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* 뷰 모드 토글 */}
        <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden flex-shrink-0">
          <button
            onClick={() => setViewMode('product')}
            className={cn(
              'flex items-center gap-1.5 px-3 h-9 text-xs font-semibold transition-colors',
              viewMode === 'product'
                ? 'bg-brand-500 text-white'
                : 'text-gray-500 hover:bg-gray-50'
            )}
          >
            <LayoutList className="w-3.5 h-3.5" />상품별
          </button>
          <button
            onClick={() => setViewMode('store')}
            className={cn(
              'flex items-center gap-1.5 px-3 h-9 text-xs font-semibold transition-colors border-l border-gray-200',
              viewMode === 'store'
                ? 'bg-brand-500 text-white'
                : 'text-gray-500 hover:bg-gray-50'
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />매장별
          </button>
        </div>

        {/* 검색 */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={viewMode === 'product' ? '상품명 또는 SKU 코드 검색...' : '매장명 또는 상품명 검색...'}
            className="w-full pl-8 pr-3 h-9 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>

        {/* 회수 대상 필터 */}
        <button
          onClick={() => setFilterMode(filterMode === 'all' ? 'recall' : 'all')}
          className={cn(
            'px-3 h-9 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap',
            filterMode === 'recall'
              ? 'bg-brand-500 text-white border-brand-500'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          )}
        >
          {filterMode === 'recall' ? '✓ 회수 대상만' : '회수 대상만'}
        </button>
      </div>

      {/* ── 상품별 뷰 ─────────────────────────────────────────────── */}
      {viewMode === 'product' && (
        <>
          {pkuGroups.length === 0 ? (
            <EmptyState hasData={stockedProductIds.size > 0} />
          ) : (
            <div className="space-y-2">
              {(visibleGroups as typeof pkuGroups).map((group) => {
                const isExpanded = expandedKeys.has(group.key)
                return (
                  <div key={group.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50/60 transition-colors text-left"
                    >
                      {group.imageUrl ? (
                        <img src={group.imageUrl} alt=""
                          className="w-10 h-10 rounded-xl object-cover flex-shrink-0 bg-gray-100"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Package className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 truncate">{group.productName}</span>
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{group.skus.length}종</span>
                          {group.urgentCount > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                              <AlertTriangle className="w-2.5 h-2.5" />긴급 {group.urgentCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-[11px] text-gray-400">
                            {group.totalRecalls > 0
                              ? <span className="text-brand-500 font-medium">{group.totalRecalls}건 회수대상</span>
                              : '회수 불필요'}
                            <span className="mx-1.5 text-gray-200">·</span>
                            {group.storeCount}개 매장
                          </span>
                          {group.groupSellThrough !== null && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-300">ST</span>
                              <SellThroughBar pct={group.groupSellThrough} size="sm" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="hidden sm:flex items-center gap-5 text-center flex-shrink-0">
                        <div>
                          <div className="text-sm font-bold text-gray-900 tabular-nums">{formatNumber(group.totalStoreQty)}</div>
                          <div className="text-[10px] text-gray-400">매장 재고</div>
                        </div>
                        <div>
                          <div className={cn('text-sm font-bold tabular-nums', group.totalRecalls > 0 ? 'text-brand-600' : 'text-gray-400')}>
                            {group.totalRecalls}
                          </div>
                          <div className="text-[10px] text-gray-400">회수 대상</div>
                        </div>
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {group.skus.map(({ product, myStocks, totalStoreQty, centerQty, myRecalls, sellThrough }) => {
                          const optionLabel = [product.color, product.size].filter(Boolean).join(' / ')
                          const sortedStocks = [...myStocks].sort((a, b) => {
                            const aR = myRecalls.find((r) => r.storeId === a.storeId)
                            const bR = myRecalls.find((r) => r.storeId === b.storeId)
                            if (aR && !bR) return -1
                            if (!aR && bR) return 1
                            return b.qty - a.qty
                          })
                          return (
                            <div key={product.id} className="ml-14 mr-4 my-3 rounded-xl border border-gray-100 overflow-hidden">
                              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50/80 border-b border-gray-100">
                                <div className="flex items-center gap-1.5 text-xs flex-1 min-w-0">
                                  <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  {optionLabel ? (
                                    <><span className="font-semibold text-gray-800">{optionLabel}</span><span className="text-gray-400 font-mono">({product.id})</span></>
                                  ) : (
                                    <span className="font-mono text-gray-700">{product.id}</span>
                                  )}
                                  {sellThrough !== null && (
                                    <div className="flex items-center gap-1 ml-2">
                                      <span className="text-[10px] text-gray-300 font-normal">ST</span>
                                      <SellThroughBar pct={sellThrough} size="xs" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <div className="flex items-center gap-1">
                                    <Store className="w-3 h-3 text-gray-400" />
                                    <span className="text-xs text-gray-500">매장합계</span>
                                    <span className="text-xs font-bold ml-1 text-gray-700">{formatNumber(totalStoreQty)}개</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Warehouse className="w-3 h-3 text-gray-400" />
                                    <span className="text-xs text-gray-500">센터재고</span>
                                    <span className={cn('text-xs font-bold ml-1', centerQty <= 0 ? 'text-red-500' : 'text-gray-800')}>{formatNumber(centerQty)}개</span>
                                  </div>
                                </div>
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-white border-b border-gray-50">
                                    <th className="text-left px-4 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide"><div className="flex items-center gap-1"><Store className="w-3 h-3" /> 매장</div></th>
                                    <th className="text-right px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">매장재고</th>
                                    <th className="text-center px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">회수 상태</th>
                                    <th className="text-right px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">권장수량</th>
                                    <th className="text-right px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">액션</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedStocks.map((stock) => {
                                    const store = getStore(stock.storeId)
                                    const recall = myRecalls.find((r) => r.storeId === stock.storeId)
                                    return (
                                      <tr key={stock.storeId} className={cn('border-b border-gray-50 last:border-0 transition-colors', recall ? 'hover:bg-brand-50/30' : 'hover:bg-gray-50/30')}>
                                        <td className="px-4 py-2.5">
                                          <div className="flex items-center gap-2">
                                            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', recall ? PRIORITY_DOT[recall.priority] : 'bg-gray-200')} />
                                            <span className="text-sm text-gray-800">{store?.name ?? stock.storeId}</span>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                          <span className="text-sm font-semibold tabular-nums text-gray-900">{formatNumber(stock.qty)}개</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                          {recall ? (
                                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                              <PriorityBadge priority={recall.priority} />
                                              <StatusBadge status={recall.status} />
                                            </div>
                                          ) : (
                                            <div className="flex items-center justify-center gap-1 text-[11px] text-gray-400">
                                              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />회수 불필요
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                          {recall ? (
                                            <span className="text-sm font-bold text-brand-600 tabular-nums">
                                              <ArrowRight className="w-3 h-3 inline mr-0.5 opacity-60" />{formatNumber(recall.suggestedQty)}개
                                            </span>
                                          ) : <span className="text-xs text-gray-300">—</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                          {recall?.status === 'recommended' && (
                                            <button onClick={() => setSelectedItem(recall)} className="px-2.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors">회수 요청</button>
                                          )}
                                          {recall?.status === 'requested' && (
                                            <button onClick={() => updateRecallStatus(recall.id, 'in-transit')} className="px-2.5 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg transition-colors">이송 처리</button>
                                          )}
                                          {recall?.status === 'in-transit' && (
                                            <button onClick={() => updateRecallStatus(recall.id, 'received', recall.requestedQty)} className="px-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors">입고 확인</button>
                                          )}
                                          {recall?.status === 'received' && (
                                            <span className="text-[11px] text-green-500 font-medium">완료</span>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              <ScrollFooter sentinelRef={sentinelRef} hasMore={hasMore} visibleCount={visibleCount} total={pkuGroups.length} />
            </div>
          )}
        </>
      )}

      {/* ── 매장별 뷰 ─────────────────────────────────────────────── */}
      {viewMode === 'store' && (
        <>
          {storeGroups.length === 0 ? (
            <EmptyState hasData={storeStocks.length > 0} />
          ) : (
            <div className="space-y-2">
              {(visibleGroups as typeof storeGroups).map((group) => {
                const isExpanded = expandedKeys.has(group.storeId)
                return (
                  <div key={group.storeId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* 매장 헤더 */}
                    <button
                      onClick={() => toggleGroup(group.storeId)}
                      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50/60 transition-colors text-left"
                    >
                      {/* 매장 아이콘 */}
                      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                        <Store className="w-4 h-4 text-brand-500" />
                      </div>

                      {/* 매장명 + 요약 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{group.storeName}</span>
                          {group.urgentCount > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                              <AlertTriangle className="w-2.5 h-2.5" />긴급 {group.urgentCount}
                            </span>
                          )}
                          {group.recallCount > 0 && (
                            <span className="text-[10px] font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">
                              회수 {group.recallCount}건
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400 flex-wrap">
                          <span>상품 {group.pkuCount}종</span>
                          <span className="text-gray-200">·</span>
                          <span>재고 합계 {formatNumber(group.totalQty)}개</span>
                        </div>
                      </div>

                      {/* 우측 숫자 요약 */}
                      <div className="hidden sm:flex items-center gap-5 text-center flex-shrink-0">
                        <div>
                          <div className="text-sm font-bold text-gray-900 tabular-nums">{formatNumber(group.totalQty)}</div>
                          <div className="text-[10px] text-gray-400">총 재고</div>
                        </div>
                        <div>
                          <div className={cn('text-sm font-bold tabular-nums', group.recallCount > 0 ? 'text-brand-600' : 'text-gray-300')}>
                            {group.recallCount}
                          </div>
                          <div className="text-[10px] text-gray-400">회수 대상</div>
                        </div>
                      </div>

                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </button>

                    {/* ── 펼친 PKU 목록 ── */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {group.pkuGroups.map((pku) => {
                          const pkuKey = `${group.storeId}::${pku.productName}`
                          const isPkuExpanded = expandedPkuKeys.has(pkuKey)
                          return (
                            <div key={pku.productName}>
                              {/* PKU 행 */}
                              <button
                                onClick={() => togglePku(pkuKey)}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/70 transition-colors text-left"
                              >
                                {pku.imageUrl ? (
                                  <img src={pku.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                    <Package className="w-4 h-4 text-gray-300" />
                                  </div>
                                )}

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-800 truncate">{pku.productName}</span>
                                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{pku.skus.length}가지 옵션</span>
                                    {pku.urgentCount > 0 && (
                                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                                        긴급 {pku.urgentCount}
                                      </span>
                                    )}
                                    {pku.recallCount > 0 && (
                                      <span className="text-[10px] font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">
                                        회수 {pku.recallCount}건
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* 우측: 재고 / 판매량 / 화살표 */}
                                <div className="hidden sm:flex items-center gap-4 text-center flex-shrink-0">
                                  <div>
                                    <div className="text-sm font-bold tabular-nums text-gray-900">{formatNumber(pku.totalStoreQty)}개</div>
                                    <div className="text-[10px] text-gray-400">이 매장 재고</div>
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold tabular-nums text-green-600">
                                      {pku.totalSalesQty > 0 ? formatNumber(pku.totalSalesQty) + '개' : '—'}
                                    </div>
                                    <div className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                      판매량
                                      <Tooltip text={salesPeriodLabel}>
                                        <span className="text-gray-400 ml-0.5">ⓘ</span>
                                      </Tooltip>
                                    </div>
                                  </div>
                                </div>
                                <div className="sm:hidden text-right flex-shrink-0">
                                  <div className="text-sm font-bold tabular-nums">{formatNumber(pku.totalStoreQty)}개</div>
                                </div>

                                {isPkuExpanded
                                  ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                              </button>

                              {/* SKU 상세 테이블 */}
                              {isPkuExpanded && (
                                <div className="mx-4 mb-3 rounded-xl border border-gray-100 overflow-visible">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="bg-gray-50/80 border-b border-gray-100">
                                        <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">옵션 (색상/사이즈)</th>
                                        <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">매장 재고</th>
                                        <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">
                                          <div className="flex items-center justify-end gap-1">
                                            <TrendingUp className="w-3 h-3 text-green-400" />
                                            <span>판매량</span>
                                            <Tooltip text={salesPeriodLabel}>
                                              <span className="text-gray-400">ⓘ</span>
                                            </Tooltip>
                                          </div>
                                        </th>
                                        <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">일 판매속도</th>
                                        <th className="text-center px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">회수 상태</th>
                                        <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">액션</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {pku.skus.map((sku) => (
                                        <tr key={sku.productId}
                                          className={cn('border-b border-gray-50 last:border-0 transition-colors',
                                            sku.recall ? 'bg-orange-50/20 hover:bg-brand-50/30' : 'hover:bg-gray-50/40')}>
                                          {/* 옵션 */}
                                          <td className="px-3 py-2.5">
                                            <div className="text-xs font-semibold text-gray-700">
                                              {sku.optionLabel || '기본'}
                                            </div>
                                            <div className="text-[10px] text-gray-400 font-mono">{sku.productId}</div>
                                          </td>
                                          {/* 재고 */}
                                          <td className="px-3 py-2.5 text-right">
                                            <span className="text-sm font-bold tabular-nums text-gray-900">{formatNumber(sku.qty)}개</span>
                                          </td>
                                          {/* 판매량 */}
                                          <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                                            {sku.offlineSalesQty > 0 ? (
                                              <span className="text-sm font-semibold tabular-nums text-green-600">{formatNumber(sku.offlineSalesQty)}개</span>
                                            ) : <span className="text-xs text-gray-300">—</span>}
                                          </td>
                                          {/* 일 판매속도 */}
                                          <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                                            {sku.dailyVelocity > 0 ? (
                                              <span className="text-xs font-medium text-gray-500 tabular-nums">
                                                {sku.dailyVelocity >= 1
                                                  ? `${sku.dailyVelocity.toFixed(1)}/일`
                                                  : `${(sku.dailyVelocity * 7).toFixed(1)}/주`}
                                              </span>
                                            ) : <span className="text-xs text-gray-300">—</span>}
                                          </td>
                                          {/* 회수 상태 */}
                                          <td className="px-3 py-2.5 text-center">
                                            {sku.recall ? (
                                              <div className="flex items-center justify-center gap-1 flex-wrap">
                                                <PriorityBadge priority={sku.recall.priority} />
                                                <StatusBadge status={sku.recall.status} />
                                              </div>
                                            ) : (
                                              <div className="flex items-center justify-center gap-1 text-[11px] text-gray-400">
                                                <CheckCircle2 className="w-3 h-3 text-green-400" />정상
                                              </div>
                                            )}
                                          </td>
                                          {/* 액션 */}
                                          <td className="px-3 py-2.5 text-right">
                                            {sku.recall?.status === 'recommended' && (
                                              <button onClick={() => setSelectedItem(sku.recall!)}
                                                className="px-2.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                                                회수 요청
                                              </button>
                                            )}
                                            {sku.recall?.status === 'requested' && (
                                              <button onClick={() => updateRecallStatus(sku.recall!.id, 'in-transit')}
                                                className="px-2.5 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                                                이송 처리
                                              </button>
                                            )}
                                            {sku.recall?.status === 'in-transit' && (
                                              <button onClick={() => updateRecallStatus(sku.recall!.id, 'received', sku.recall!.requestedQty)}
                                                className="px-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                                                입고 확인
                                              </button>
                                            )}
                                            {sku.recall?.status === 'received' && (
                                              <span className="text-[11px] text-green-500 font-medium">완료</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              <ScrollFooter sentinelRef={sentinelRef} hasMore={hasMore} visibleCount={visibleCount} total={storeGroups.length} />
            </div>
          )}
        </>
      )}

      {selectedItem && (
        <StoreRecallModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  )
}

// ─── 공통 컴포넌트 ───────────────────────────────────────────────
function EmptyState({ hasData }: { hasData: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
      <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">
        {!hasData ? '이지체인 매장 재고 데이터를 먼저 업로드하세요' : '검색 결과가 없습니다'}
      </p>
    </div>
  )
}

function ScrollFooter({ sentinelRef, hasMore, visibleCount, total }: {
  sentinelRef: React.RefObject<HTMLDivElement>
  hasMore: boolean
  visibleCount: number
  total: number
}) {
  return (
    <>
      <div ref={sentinelRef} className="h-4" />
      {hasMore && (
        <div className="flex items-center justify-center py-4 gap-2 text-sm text-gray-400">
          <svg className="w-4 h-4 animate-spin text-brand-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
          </svg>
          불러오는 중… ({visibleCount}/{total})
        </div>
      )}
      {!hasMore && total > PAGE_SIZE && (
        <div className="text-center py-4 text-xs text-gray-300">전체 {total}개 표시 완료</div>
      )}
    </>
  )
}

function SummaryCard({ label, value, sub, color }: {
  label: string; value: number; sub: string; color: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className={cn('text-2xl font-bold tabular-nums', color)}>{formatNumber(value)}</div>
      <div className="text-xs font-medium text-gray-700 mt-0.5">{label}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}
