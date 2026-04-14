import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  Search, Package, ChevronDown, ChevronRight,
  Store, AlertTriangle, CheckCircle2, ArrowRight,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PriorityBadge, StatusBadge } from '../components/RecallPriorityBadge'
import StoreRecallModal from '../components/StoreRecallModal'
import { cn, formatNumber } from '../utils/helpers'
import type { RecallItem } from '../types'

const PAGE_SIZE = 20

export default function StoreView() {
  const { products, storeStocks, stores, centerStocks, recallItems, getStore } = useAppStore()
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<RecallItem | null>(null)
  const [filterMode, setFilterMode] = useState<'all' | 'recall'>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // 매장 재고가 있는 상품만
  const stockedProductIds = useMemo(() => {
    return new Set(storeStocks.filter((s) => s.qty > 0).map((s) => s.productId))
  }, [storeStocks])

  // 상품별 집계
  const productList = useMemo(() => {
    return products
      .filter((p) => stockedProductIds.has(p.id))
      .map((p) => {
        const myStocks = storeStocks.filter((s) => s.productId === p.id && s.qty > 0)
        const totalStoreQty = myStocks.reduce((s, i) => s + i.qty, 0)
        const centerQty = centerStocks.find((c) => c.productId === p.id)?.qty ?? 0
        const myRecalls = recallItems.filter(
          (r) => r.productId === p.id && r.status !== 'received' && r.status !== 'cancelled'
        )
        const urgentCount = myRecalls.filter((r) => r.priority === 'urgent').length
        const hasRecall = myRecalls.length > 0
        return { product: p, myStocks, totalStoreQty, centerQty, myRecalls, urgentCount, hasRecall }
      })
      .filter((row) => filterMode === 'all' || row.hasRecall)
      .filter((row) => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
          row.product.id.toLowerCase().includes(q) ||
          row.product.name.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.urgentCount - a.urgentCount || b.myRecalls.length - a.myRecalls.length)
  }, [products, storeStocks, centerStocks, recallItems, search, filterMode, stockedProductIds])

  // 검색/필터 바뀌면 다시 처음부터
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [search, filterMode])

  // 무한 스크롤: sentinel이 화면에 들어오면 20개 추가
  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, productList.length))
  }, [productList.length])

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

  const visibleList = productList.slice(0, visibleCount)
  const hasMore = visibleCount < productList.length

  const totalRecallProducts = products.filter((p) =>
    recallItems.some((r) => r.productId === p.id && r.status !== 'received' && r.status !== 'cancelled')
  ).length

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="재고 보유 상품"
          value={stockedProductIds.size}
          sub="매장 재고 있음"
          color="text-gray-700"
        />
        <SummaryCard
          label="회수 대상 SKU"
          value={totalRecallProducts}
          sub="분석 결과"
          color="text-brand-600"
        />
        <SummaryCard
          label="전체 매장"
          value={stores.length}
          sub="등록된 매장"
          color="text-gray-700"
        />
      </div>

      {/* 검색 + 필터 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU 코드 또는 상품명 검색..."
            className="w-full pl-8 pr-3 h-9 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
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

      {/* SKU 목록 */}
      {productList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {stockedProductIds.size === 0
              ? '이지체인 매장 재고 데이터를 먼저 업로드하세요'
              : '검색 결과가 없습니다'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleList.map(({ product, myStocks, totalStoreQty, centerQty, myRecalls, urgentCount }) => {
            const isExpanded = expandedId === product.id
            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                {/* 상품 헤더 행 */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : product.id)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50/60 transition-colors text-left"
                >
                  {/* 이미지 */}
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="w-10 h-10 rounded-xl object-cover flex-shrink-0 bg-gray-100"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-gray-400" />
                    </div>
                  )}

                  {/* 상품 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {product.name}
                      </span>
                      {urgentCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          긴급 {urgentCount}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">{product.id}</div>
                  </div>

                  {/* 재고 요약 */}
                  <div className="hidden sm:flex items-center gap-5 text-center flex-shrink-0">
                    <div>
                      <div className="text-sm font-bold text-gray-900 tabular-nums">{formatNumber(totalStoreQty)}</div>
                      <div className="text-[10px] text-gray-400">매장 재고</div>
                    </div>
                    <div>
                      <div className={cn('text-sm font-bold tabular-nums', centerQty === 0 ? 'text-red-500' : 'text-gray-900')}>
                        {formatNumber(centerQty)}
                      </div>
                      <div className="text-[10px] text-gray-400">센터 재고</div>
                    </div>
                    <div>
                      <div className={cn('text-sm font-bold tabular-nums', myRecalls.length > 0 ? 'text-brand-600' : 'text-gray-400')}>
                        {myRecalls.length}
                      </div>
                      <div className="text-[10px] text-gray-400">회수 대상</div>
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {myStocks.length}개 매장
                    </div>
                  </div>

                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  }
                </button>

                {/* 펼쳐진 매장별 상세 */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {/* 모바일용 요약 */}
                    <div className="sm:hidden flex gap-4 px-4 py-2 bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <span>매장재고 <strong>{totalStoreQty}</strong></span>
                      <span>센터재고 <strong className={centerQty === 0 ? 'text-red-500' : ''}>{centerQty}</strong></span>
                      <span>회수대상 <strong>{myRecalls.length}</strong></span>
                    </div>

                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                          <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                            <div className="flex items-center gap-1.5">
                              <Store className="w-3 h-3" /> 매장
                            </div>
                          </th>
                          <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">매장 재고</th>
                          <th className="text-center px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">회수 상태</th>
                          <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">권장 수량</th>
                          <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">액션</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myStocks
                          .sort((a, b) => {
                            // 회수 대상 매장 먼저
                            const aR = myRecalls.find((r) => r.storeId === a.storeId)
                            const bR = myRecalls.find((r) => r.storeId === b.storeId)
                            if (aR && !bR) return -1
                            if (!aR && bR) return 1
                            return b.qty - a.qty
                          })
                          .map((stock) => {
                            const store = getStore(stock.storeId)
                            const recall = myRecalls.find((r) => r.storeId === stock.storeId)
                            return (
                              <StoreStockRow
                                key={stock.storeId}
                                storeName={store?.name ?? stock.storeId}
                                qty={stock.qty}
                                recall={recall ?? null}
                                onAction={recall ? () => setSelectedItem(recall) : undefined}
                              />
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}

          {/* 무한 스크롤 sentinel */}
          <div ref={sentinelRef} className="h-4" />
          {hasMore && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-gray-400">
              <svg className="w-4 h-4 animate-spin text-brand-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
              </svg>
              불러오는 중… ({visibleCount}/{productList.length})
            </div>
          )}
          {!hasMore && productList.length > PAGE_SIZE && (
            <div className="text-center py-4 text-xs text-gray-300">
              전체 {productList.length}개 상품 표시 완료
            </div>
          )}
        </div>
      )}

      {selectedItem && (
        <StoreRecallModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  )
}

// ─── 매장 행 ────────────────────────────────────────────────────
function StoreStockRow({
  storeName, qty, recall, onAction,
}: {
  storeName: string
  qty: number
  recall: RecallItem | null
  onAction?: () => void
}) {
  const { updateRecallStatus } = useAppStore()
  const hasRecall = !!recall

  return (
    <tr className={cn(
      'border-b border-gray-50 last:border-0 transition-colors',
      hasRecall ? 'hover:bg-brand-50/30' : 'hover:bg-gray-50/40'
    )}>
      {/* 매장명 */}
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {hasRecall ? (
            <span className={cn(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              recall!.priority === 'urgent' ? 'bg-red-500' :
              recall!.priority === 'high' ? 'bg-orange-400' :
              recall!.priority === 'medium' ? 'bg-yellow-400' : 'bg-gray-300'
            )} />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-gray-200 flex-shrink-0" />
          )}
          <span className="text-sm text-gray-800">{storeName}</span>
        </div>
      </td>

      {/* 매장 재고 */}
      <td className="px-3 py-2.5 text-right">
        <span className="text-sm font-semibold tabular-nums text-gray-900">
          {formatNumber(qty)}개
        </span>
      </td>

      {/* 회수 상태 */}
      <td className="px-3 py-2.5 text-center">
        {recall ? (
          <div className="flex items-center justify-center gap-1.5">
            <PriorityBadge priority={recall.priority} />
            <StatusBadge status={recall.status} />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1 text-[11px] text-gray-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            회수 불필요
          </div>
        )}
      </td>

      {/* 권장 수량 */}
      <td className="px-3 py-2.5 text-right">
        {recall ? (
          <span className="text-sm font-bold text-brand-600 tabular-nums">
            <ArrowRight className="w-3 h-3 inline mr-0.5 opacity-60" />
            {formatNumber(recall.suggestedQty)}개
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* 액션 */}
      <td className="px-3 py-2.5 text-right">
        {recall?.status === 'recommended' && (
          <button
            onClick={onAction}
            className="px-2.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            회수 요청
          </button>
        )}
        {recall?.status === 'requested' && (
          <button
            onClick={() => updateRecallStatus(recall.id, 'in-transit')}
            className="px-2.5 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            이송 처리
          </button>
        )}
        {recall?.status === 'in-transit' && (
          <button
            onClick={() => updateRecallStatus(recall.id, 'received', recall.requestedQty)}
            className="px-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            입고 확인
          </button>
        )}
        {recall?.status === 'received' && (
          <span className="text-[11px] text-green-500 font-medium">완료</span>
        )}
      </td>
    </tr>
  )
}

// ─── 요약 카드 ───────────────────────────────────────────────────
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
