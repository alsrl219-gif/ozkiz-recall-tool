import { useState, useMemo } from 'react'
import { Download, Search, Filter, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PriorityBadge, StatusBadge } from '../components/RecallPriorityBadge'
import { formatNumber, formatDate, downloadCSV } from '../utils/helpers'
import type { RecallStatus } from '../types'

export default function RecallHistory() {
  const { recallItems, getProduct, getStore, deleteRecallItem } = useAppStore()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<RecallStatus | 'all'>('all')
  const [filterMonth, setFilterMonth] = useState('all')

  const months = useMemo(() => {
    const set = new Set<string>()
    recallItems.forEach((r) => {
      set.add(r.createdAt.slice(0, 7))
    })
    return [...set].sort().reverse()
  }, [recallItems])

  const filtered = useMemo(() => {
    let list = [...recallItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((r) => {
        const p = getProduct(r.productId)
        const s = getStore(r.storeId)
        return (
          r.productId.toLowerCase().includes(q) ||
          p?.name.toLowerCase().includes(q) ||
          s?.name.toLowerCase().includes(q)
        )
      })
    }
    if (filterStatus !== 'all') list = list.filter((r) => r.status === filterStatus)
    if (filterMonth !== 'all') list = list.filter((r) => r.createdAt.startsWith(filterMonth))
    return list
  }, [recallItems, search, filterStatus, filterMonth, getProduct, getStore])

  function handleExport() {
    const data = filtered.map((r) => ({
      생성일: formatDate(r.createdAt),
      상품코드: r.productId,
      상품명: getProduct(r.productId)?.name ?? '',
      매장코드: r.storeId,
      매장명: getStore(r.storeId)?.name ?? '',
      우선순위: r.priority,
      회수점수: r.recallScore,
      권장수량: r.suggestedQty,
      요청수량: r.requestedQty ?? '',
      실제수량: r.actualQty ?? '',
      상태: r.status,
      회수사유: r.reason,
      완료일: r.completedAt ? formatDate(r.completedAt) : '',
      메모: r.note ?? '',
    }))
    downloadCSV(data, `ozkiz_recall_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // 요약 통계
  const stats = useMemo(() => ({
    total: recallItems.length,
    received: recallItems.filter((r) => r.status === 'received').length,
    totalReceivedQty: recallItems
      .filter((r) => r.status === 'received')
      .reduce((s, r) => s + (r.actualQty ?? r.requestedQty ?? 0), 0),
    pending: recallItems.filter((r) => ['recommended', 'requested', 'in-transit'].includes(r.status)).length,
  }), [recallItems])

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      {/* 요약 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '전체 회수 건', value: stats.total },
          { label: '입고 완료', value: stats.received },
          { label: '완료 수량', value: `${formatNumber(stats.totalReceivedQty)}개` },
          { label: '진행 중', value: stats.pending },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-card p-4">
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="상품, 매장 검색..."
              className="w-full pl-9 pr-4 h-9 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as RecallStatus | 'all')}
              className="text-sm border border-gray-200 rounded-xl px-3 h-9 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="all">전체 상태</option>
              <option value="recommended">회수 권장</option>
              <option value="requested">요청됨</option>
              <option value="in-transit">이송 중</option>
              <option value="received">입고 완료</option>
              <option value="cancelled">취소</option>
            </select>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 h-9 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="all">전체 기간</option>
              {months.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 h-9 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV 내보내기</span>
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-400 px-4 py-2 bg-gray-50/50 border-b border-gray-100">
          {filtered.length}건
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['생성일', '상품', '매장', '우선순위', '권장/요청/실제', '상태', '완료일', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                    이력이 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const product = getProduct(item.productId)
                  const store = getStore(item.storeId)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 text-sm">
                          {product?.name ?? item.productId}
                        </div>
                        <div className="text-xs text-gray-400">{item.productId}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {store?.name ?? item.storeId}
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={item.priority} />
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-700">
                        <div>{formatNumber(item.suggestedQty)}</div>
                        {item.requestedQty !== undefined && (
                          <div className="text-xs text-gray-400">{formatNumber(item.requestedQty)} / {item.actualQty ?? '-'}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {item.completedAt ? formatDate(item.completedAt) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteRecallItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
