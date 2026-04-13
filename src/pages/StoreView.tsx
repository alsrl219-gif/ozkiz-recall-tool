import { useState, useMemo } from 'react'
import { Search, Package, ArrowRight, MapPin, Phone, CheckCircle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PriorityBadge, ScoreBar, StatusBadge } from '../components/RecallPriorityBadge'
import StoreRecallModal from '../components/StoreRecallModal'
import { cn, formatNumber } from '../utils/helpers'
import type { RecallItem, Store } from '../types'

export default function StoreView() {
  const { stores, settings, recallItems, storeStocks, getProduct } = useAppStore()
  const allStores = settings.stores.length ? settings.stores : stores

  const [selectedStoreId, setSelectedStoreId] = useState<string>(allStores[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<RecallItem | null>(null)

  const storeRecalls = useMemo(() =>
    recallItems.filter(
      (r) => r.storeId === selectedStoreId && r.status !== 'received' && r.status !== 'cancelled'
    ),
    [recallItems, selectedStoreId]
  )

  const storeInventory = useMemo(() =>
    storeStocks.filter((s) => s.storeId === selectedStoreId && s.qty > 0),
    [storeStocks, selectedStoreId]
  )

  const filtered = useMemo(() => {
    if (!search) return storeRecalls
    const q = search.toLowerCase()
    return storeRecalls.filter((r) => {
      const p = getProduct(r.productId)
      return r.productId.toLowerCase().includes(q) || p?.name.toLowerCase().includes(q)
    })
  }, [storeRecalls, search, getProduct])

  const currentStore = allStores.find((s) => s.id === selectedStoreId)
  const urgentCount = storeRecalls.filter((r) => r.priority === 'urgent').length
  const totalQty = storeRecalls.reduce((s, r) => s + r.suggestedQty, 0)

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
      {/* 매장 선택 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">매장 선택</label>
          {allStores.length === 0 ? (
            <div className="text-sm text-gray-400 py-2">
              매장 데이터가 없습니다. 이지체인 데이터를 업로드하거나 설정에서 매장을 추가해주세요.
            </div>
          ) : (
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full sm:w-64 text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              {allStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.region ? `(${s.region})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {currentStore && (
        <>
          {/* 매장 정보 카드 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-gray-900">{currentStore.name}</h2>
                  {currentStore.region && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{currentStore.region}
                    </span>
                  )}
                </div>
                {currentStore.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Phone className="w-3.5 h-3.5" />{currentStore.phone}
                  </div>
                )}
              </div>
              <div className="flex gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-gray-900">{storeRecalls.length}</div>
                  <div className="text-xs text-gray-500">회수 대상</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{urgentCount}</div>
                  <div className="text-xs text-gray-500">긴급</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-brand-600">{totalQty}</div>
                  <div className="text-xs text-gray-500">총 수량</div>
                </div>
              </div>
            </div>
          </div>

          {/* 회수 목록 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-900 flex-1">회수 권장 상품</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="상품 검색..."
                  className="pl-8 pr-3 h-8 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
                <div className="text-sm font-medium text-gray-700">회수 대상 상품이 없습니다</div>
                <div className="text-xs text-gray-400 mt-1">
                  {search ? '검색 조건을 바꿔보세요' : '이 매장은 현재 정상 상태입니다'}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map((item) => (
                  <StoreRecallCard
                    key={item.id}
                    item={item}
                    onAction={() => setSelectedItem(item)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 매장 전체 재고 현황 */}
          {storeInventory.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  매장 전체 재고 ({storeInventory.length}종)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">상품코드</th>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">상품명</th>
                      <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium">재고</th>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">회수 상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {storeInventory.map((stock) => {
                      const product = getProduct(stock.productId)
                      const recall = recallItems.find(
                        (r) => r.productId === stock.productId && r.storeId === stock.storeId
                      )
                      return (
                        <tr key={stock.productId} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 text-xs text-gray-400">{stock.productId}</td>
                          <td className="px-4 py-2.5 text-gray-800">{product?.name ?? stock.productId}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatNumber(stock.qty)}</td>
                          <td className="px-4 py-2.5">
                            {recall ? <StatusBadge status={recall.status} /> : (
                              <span className="text-xs text-gray-400">회수 불필요</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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

function StoreRecallCard({ item, onAction }: { item: RecallItem; onAction: () => void }) {
  const { getProduct, updateRecallStatus } = useAppStore()
  const product = getProduct(item.productId)

  return (
    <div className={cn(
      'p-4 flex items-start gap-4 transition-colors',
      item.priority === 'urgent' ? 'bg-red-50/30 border-l-4 border-red-400' :
      item.priority === 'high' ? 'bg-orange-50/20 border-l-4 border-orange-300' :
      'border-l-4 border-transparent'
    )}>
      {product?.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-gray-100"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Package className="w-5 h-5 text-gray-400" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-gray-900 text-sm">
              {product?.name ?? item.productId}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{item.productId}</div>
          </div>
          <PriorityBadge priority={item.priority} />
        </div>

        <div className="mt-2 mb-1">
          <ScoreBar score={item.recallScore} />
        </div>

        {item.reason && (
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{item.reason}</p>
        )}

        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs">
            <ArrowRight className="w-3.5 h-3.5 text-brand-500" />
            <span className="text-gray-600">권장 <strong>{formatNumber(item.suggestedQty)}개</strong></span>
          </div>
          <StatusBadge status={item.status} />
        </div>
      </div>

      <div className="flex flex-col gap-2 flex-shrink-0">
        {item.status === 'recommended' && (
          <button
            onClick={onAction}
            className="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap"
          >
            회수 요청
          </button>
        )}
        {item.status === 'requested' && (
          <button
            onClick={() => updateRecallStatus(item.id, 'in-transit')}
            className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap"
          >
            이송 처리
          </button>
        )}
        {item.status === 'in-transit' && (
          <button
            onClick={() => updateRecallStatus(item.id, 'received', item.requestedQty)}
            className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap"
          >
            입고 확인
          </button>
        )}
      </div>
    </div>
  )
}
